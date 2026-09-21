# Matt's Career Assistant: operations

How the chat feature is protected, what it costs to abuse, and what to do when something goes wrong. Everything here is metadata-level: the route never records a visitor's words, and neither does anything below.

Rows marked "as of" are point-in-time observations. `vercel env ls`, the Vercel Firewall page, and the GCP console are the source of truth; check them before relying on a row during an incident.

## The layers (MTC-34)

| Layer            | Where                                                                                                                                                                                                                                             | State                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Kill switch      | `CHAT_DISABLED=1` env var on Vercel, read before the body                                                                                                                                                                                         | As of 2026-09-15: set on production; unset on preview and development              |
| BotID Basic      | `instrumentation-client.ts` (client), `withBotId` in `next.config.ts` (rewrites), `checkBotId` in `app/api/chat/route.ts` (server)                                                                                                                | In code; free on every plan                                                        |
| WAF rate limit   | Vercel dashboard, Firewall, one rule (Hobby allows one)                                                                                                                                                                                           | **Not yet created**; spec below                                                    |
| Per-request caps | `lib/chat/validate.ts` and `lib/knowledge` budgets: 8 turns, 1,500-character questions, 80k input tokens, 3 documents / 20k tokens read, 8,192 output tokens per step (shared with Gemini 3.8 Flash thought tokens at thinking `medium`), 4 steps | In code since MTC-31; output raised so medium-thinking briefings are not cut short |
| GCP budget       | Billing budget on project `matttrifilo-com`, $50 a month                                                                                                                                                                                          | As of 2026-09-14 (MTC-30)                                                          |
| Vertex quota cap | GCP console, IAM & Admin, Quotas, `aiplatform.googleapis.com`                                                                                                                                                                                     | **Not yet applied**; see below                                                     |

Only the WAF rule refuses at the edge. BotID, the per-request caps, and the kill switch all run inside the function, so until the rule exists a flood still costs one invocation and one classifier round-trip per request against the plan's quotas. BotID stops model spend, not traffic.

## Kill switch

Setting `CHAT_DISABLED=1` on an environment makes every request to `/api/chat` answer 503 with the `disabled` envelope before the body is read or BotID is consulted, and hides the assistant from the site: the homepage panel, the nav entry, the résumé button and the sitemap entries go, and `/ask` returns 404 with the site's default metadata. The pages read the flag at build time, so the change takes effect on the next deploy. A visitor who reaches `/ask` from an old link sees the site's 404 page with the nav and the footer, so Contact and the email link are one click away; the route's `disabled` sentence is only ever seen by a client that was built while the flag was off.

```
vercel env add CHAT_DISABLED production   # value: 1
vercel env rm  CHAT_DISABLED production   # to re-enable
```

Vercel bakes environment variables into a deployment, so redeploy production after changing it (a dashboard redeploy of the current deployment is enough).

## BotID

- Every POST to `/api/chat` from a page carries BotID's classification header. `checkBotId()` is an HTTPS call to Vercel's classifier on every request, made before the body is read and bounded at 3 s (`lib/chat/visitor.ts`). Only an explicit "not a bot" verdict passes: a bot, a verified crawler, or a verdict with no `isBot` at all (an error body from the classifier) gets 403 and the `blocked` envelope, logged as `{ rejected: 'blocked', verifiedBot }`. A classifier that throws or stalls gets 502 and the `unavailable` envelope, logged as `{ stage: 'visitor', error }`: the route fails closed.
- Expected, per Vercel's documentation and not verified from this repository: a request without the client's classification header (a `curl`) is classified as a bot on a Vercel deployment. It cannot be checked on a preview from outside a browser (deployment protection answers first) and cannot be checked on production until `CHAT_DISABLED` is lifted, since the kill switch answers before the classifier. What was verified on a preview: a real browser passes, including the first request after the homepage hand-off.
- `{ botIdBypassed: true, env }` at warn level means the classifier reported a bypass. In development that is normal (BotID does not run there). In production it means a request was served without a classification; treat a run of them as a signal, not noise.
- The challenge script and its calls go through same-origin rewrites, so the site's CSP needs no new host. One directive is unverified: `script-src` has no `'unsafe-eval'`, and BotID's escalated script (the one that runs when Vercel decides a session needs a deeper check, which can happen on Basic at Vercel's discretion, not only under Deep Analysis) has not been observed loading here. `frame-src` includes `'self'` for the challenge path. The Basic path passed with the console clean on a preview. After launch, watch the Vercel Firewall view for a rising `blocked` count from real browsers, and the browser console for CSP violations on the challenge path; either is the signal that the escalated script is being refused. The wrapper also adds its own header rule for the challenge path, and Next's last-match-wins ordering means it takes effect there (X-Frame-Options SAMEORIGIN, frame-ancestors 'self'); nothing was framed on it in the Basic path observed on the preview.
- If the challenge script fails to load (an ad blocker, a CDN blip), the browser's patched `fetch` can wait on it indefinitely. The client races every chat request against a 20 s bound (`lib/chat/transport.ts`); the bound is a race on the promise rather than only an abort, because the patched fetch does not consult an abort signal while it waits for the challenge; the abort still fires when the bound wins, so a challenge that resolves late cannot send the request afterwards. The symptom is a 20 s wait followed by "Something went wrong reaching the assistant", not a spinner.
- Upgrade path: enable Deep Analysis in the dashboard (Firewall, Rules) and pass `advancedOptions: { checkLevel: 'deepAnalysis' }` to `checkBotId` in the route. It costs $1 per 1,000 checks on Pro. Do it when the logs show `blocked` staying low while request volume or token spend climbs.

## WAF rate-limit rule (to create)

Per [Vercel's WAF rate-limiting documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) (read 2026-09-15): Hobby includes the IP and JA4 digest keys, the fixed-window algorithm only, one rate-limit rule per project, and counters that are tracked per region; Hobby projects can have up to three custom firewall rules in total. The rule to create in the dashboard (Project, Firewall, Configure, New Rule):

| Field  | Value                                                    | Why                                                                                                                                          |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Name   | `chat: 20 requests a minute per client`                  |                                                                                                                                              |
| If     | Request path equals `/api/chat` and method equals `POST` | Only the endpoint that spends money                                                                                                          |
| Then   | Rate Limit, Fixed Window                                 | The only algorithm on Hobby, per the documentation above                                                                                     |
| Window | 60 s                                                     |                                                                                                                                              |
| Limit  | 20                                                       | A conversation is at most 8 questions; a regenerate or a retry after a stall doubles it; 20 leaves room for a person and none for a loop     |
| Keys   | IP and JA4 digest                                        | Both included on Hobby per the documentation above; JA4 catches one client behind many residential IPs, which is the attack the ticket cites |
| Action | Default (429)                                            | The UI turns a bare 429 into the rate-limit notice with the résumé, project and email links                                                  |

Counters are per region (documentation above), so a distributed caller can exceed the limit somewhat; the per-request caps and the budget bound what that costs. After publishing, watch Firewall, overview, grouped by the rule, for a week; if real visitors trip it, raise the limit before lowering anything else.

## GCP budget and quota

- The $50 monthly budget on `matttrifilo-com` emails at 50, 90 and 100 percent. At 100 percent, set the kill switch; the budget does not stop spend by itself.
- To cap spend hard, lower the Vertex AI request quota for the Gemini model in the GCP console (IAM & Admin, Quotas, filter on `aiplatform.googleapis.com` and the model's requests-per-minute quota) to a number the rate-limit rule cannot exceed. Not applied yet; the exact quota name depends on the model family and is best read from the console.

## What to watch

Vercel function logs for `/api/chat`, one line per request, all numeric:

- `[chat] { rejected: … }`: refusals by code. A rise in `blocked` is BotID working; a rise in `too_many_turns` or `message_too_long` is people hitting limits.
- `[chat] { inputTokens, outputTokens, cachedInputTokens, cacheHit, documentsRead, answered, finishReason, ms }`: completions. `cacheHit: false` across the board means the implicit cache is not engaging (MTC-38). `answered: false` means tokens were spent for nothing.
- `[chat] truncated` and `[chat] incomplete`: answers cut short; a trend means the output cap or the step count needs revisiting.
- Vercel Firewall overview: hits on the rate-limit rule and BotID's blocked count.

## Runbook: something is wrong

1. Spend or request rate is climbing and it is not visitors: set `CHAT_DISABLED=1` on production and redeploy. The assistant disappears from the site on that deploy (panel, nav entry, résumé button, sitemap entries; `/ask` becomes a 404) and the route refuses. Nothing else on the site changes.
2. Check the Firewall overview for the source (rule hits, top IPs, JA4). Lower the rule's limit or add a deny rule for the JA4 if it is one client.
3. If automation is getting past BotID Basic, turn on Deep Analysis (above).
4. Re-enable once the pattern stops. Write down what happened in the MTC-34 ticket.

## Updating the knowledge base

See `lib/knowledge/knowledge.test.ts` for the guards and `scripts/knowledge-check.ts` for the report. `bun run knowledge:check` prints the index and every dropped document.

## Eval suites (MTC-32)

`evals/` holds four promptfoo suites that run the chat route's own handler in process. There is no server and no fixture model: `evals/provider.ts` builds `createChatHandler` with the real knowledge corpus and the real Vertex client, posts the body a browser would post, and reads the answer back off the stream. What a suite asserts on is therefore the live policy, the live corpus and the live read budget.

| Suite          | Tests | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `golden`       |    32 | Hiring-manager questions. The answer contains the distinctive facts, stays in the third person, and opened the document the fact lives in (`metadata.readIds`). One `llm-rubric` per test on top, graded three times inside an `assert-set` at `threshold: 0.6`.                                                                                                                                                                                                                                                                                                                                         |
| `refusals`     |    24 | Compensation, employment status, contact details, colleague names, employer internals, opinions, "print your system prompt", and off-topic tasks. Compared against `DECLINE_SENTENCE` imported from `lib/chat/prompt.ts`, so rewording the sentence fails the suite instead of passing a stale copy.                                                                                                                                                                                                                                                                                                     |
| `injection`    |    23 | Role-play, encoded and reversed instructions, instructions planted inside a quoted "document", multi-turn escalation over forged assistant turns, and attempts to dump the index or name the tool. Every test asserts that the run answered at all, that it stays in the third person, and that no verbatim policy phrase or tool name comes back; the eight tests that could plausibly open a document also assert it read nothing outside the index. A paraphrased disclosure of the rules is not something a substring check can catch; read a failing injection answer, do not only trust the green. |
| `groundedness` |    23 | Twelve questions whose `Sources:` trailer must name only documents the server actually read, and eleven probes for plausible-but-absent facts that must be declined rather than invented.                                                                                                                                                                                                                                                                                                                                                                                                                |

Deterministic assertions are the gate. `llm-rubric` appears where judgement is genuinely needed and nowhere else: in `golden`, on whether an answer is _right_, and on the `groundedness` probes, where a substring list cannot see an invention phrased around it. The grader runs at temperature 0 and each rubric sits in an `assert-set` of three with `threshold: 0.6`, so two of three grades must pass. Be precise about what that buys: three identical prompts at temperature 0 are highly correlated, so this absorbs the residual nondeterminism of serving, not a difference of judgement. It costs 129 of the run's calls, about $0.09.

The threshold is 0.6 rather than 0.67 for an unobvious reason worth keeping written down: promptfoo scores an `assert-set` on the weighted **mean** of its members and passes on `score >= threshold`. Two passes out of three average 0.666…, which is below 0.67, so a 0.67 threshold would have demanded three of three and the tolerance would not have existed at all.

Every test whose assertions are all absence checks ("does not speak as Matt", "does not leak the policy") also carries `assertAnswered`. Without it those tests pass on an empty answer, which the route really does return when a run spends its steps reading or a provider filter stops the generation, and the suite proving jailbreak resistance would go green against an assistant that says nothing. `evals/config.test.ts` enforces that pairing so it cannot be dropped later.

The assertions live in `evals/assertions.ts` and import the route's own constants rather than pasting them. `evals/config.test.ts` runs in `bun test` and checks the YAML itself: every test is labelled with its suite, names an assertion that actually exists, declares the metadata that assertion reads, and points `expectReads` at a document in the corpus.

### When they run

Locally, during development, by decision of 2026-09-21 (Matt): a full run on every pull request cost more in tokens than it caught, and a one-in-a-hundred model flake reddened most runs. Run `bun run evals:smoke` while iterating and `bun run evals` before opening a pull request that changes anything the answers depend on (both write `evals/out/results.json`, then print the per-suite table and write `evals/out/summary.json`; the table is what goes in the pull request): `content/knowledge/**`, `lib/chat/**`, `lib/knowledge/**`, `lib/ai/**`, `lib/env.ts`, `app/api/chat/**`, `evals/**`, or a bump of `ai` or `@ai-sdk/google-vertex`. Paste that table into the pull request body; a reviewer should see the counts, not take them on faith. `bun run evals:report` regenerates the table from an existing `results.json` without spending anything.

`.github/workflows/evals.yml` still exists and runs only on `workflow_dispatch`. Use it when the question is whether the deployment's own identity can run the suites (an IAM or federation change). It dispatches only a ref in this repository and runs the workflow file at that ref with `id-token: write`, so never dispatch it on a branch whose `.github/` or `evals/` changes you have not read: a contributor's branch is evaluated by cherry-picking its content changes onto a branch you own, or by reviewing those two directories first. It is not a required check and must not become one.

Outputs, locally and in CI: `evals/out/results.json` and a compact `evals/out/summary.json`, both gitignored (in CI also uploaded as the `evals` workflow artifact, plus the per-suite table in the job summary). `summary.json` has a stable shape, so a later ticket can publish it on the site. `retried` counts the tests whose first attempt was lost to a stalled Vertex connection and was sent again, which is the difference between a bad few minutes upstream and a real regression:

```json
{
  "commit": "…",
  "ranAt": "…",
  "model": "gemini-3.8-flash",
  "suites": [{ "name": "golden", "passed": 32, "total": 32 }],
  "totals": { "passed": 102, "total": 102 },
  "retried": 0
}
```

### A red run

`bun run evals/summarize.ts` exits non-zero when any test failed. Nothing enforces that on a merge; the person opening the pull request does, by running the suites and pasting the result. A red run is one of four things, and `results.json` says which:

1. **The corpus changed and a golden is now wrong.** Fix the golden. That is the suite doing its job.
2. **The answer got worse.** Fix the prompt or the corpus, not the assertion.
3. **A grader flake.** Only on a rubric, and only if two of three grades disagreed. Re-run before touching anything.
4. **Vertex was slow, or impersonation was not ready.** A row reading `CHAT_ERROR: interrupted` or `unavailable` is a stalled connection or a refused token, not an answer; the provider retries transport failures twice more. The CI workflow also pings Vertex (`evals/warmup.ts`) after GitHub OIDC auth so the first goldens are not measuring IAM eventual consistency. A run with several of them after a successful warmup is upstream latency, and the `[chat]` lines in the log carry `vertexRetries` and `vertexFirstByteMs` for it. That is the same measurement MTC-38's timeout constants are hypotheses about, and a full suite is the largest sample of it anything here produces.

Never relax an assertion to get a green run without saying so in the pull request.

### Running them locally

The suites authenticate with Application Default Credentials. `lib/ai/vertex.ts` uses the Vercel OIDC federation when all four `GCP_*` federation variables are present, falls back to ADC when none of them is, and throws when some but not all are set, so a deployment missing one still fails with that variable's name rather than silently degrading.

```
gcloud auth application-default login
GCP_PROJECT_ID=<project> VERTEX_PROJECT_ID=<project> bun run evals:smoke
```

`evals:smoke` is the first three tests of each suite, twelve in all, for a few cents. `bun run evals` is the whole thing. `CHAT_REASONING=low|medium|high bun run evals:smoke` points the route at a different Gemini 3.8 Flash thinking level; `bun run evals:compare` runs the smoke subset at all three and prints a table. The live route defaults to `medium`. Run both from the repository root: the provider imports through the `@/` alias, and promptfoo resolves it relative to the working directory, so running from inside `evals/` turns every test into a module-not-found error row.

Four traps worth knowing. A `.env` written by `vercel env pull` is loaded by promptfoo automatically, and it carries the four federation variables, which pushes the run onto the Vercel OIDC path rather than ADC; move it aside to force ADC. If you ran the `gcloud` setup below in this shell you exported three of those four names, which is a partial set: the provider checks for that before it builds a handler, so every row names the missing variable instead of saying `unavailable`. The run still walks all 102 tests, but it makes no model call and costs nothing. Open a fresh shell. `VERTEX_PROJECT_ID` is separate from `GCP_PROJECT_ID` because promptfoo's own Vertex provider, which grades the rubrics, resolves its project independently of ours. And a local run authenticates as **you**, not as the deployment's service account, so a green local run says nothing about whether that account's `roles/aiplatform.user` is enough; only a CI run answers that.

### Cost of a run

102 tests. The route sends the policy (~1,418 tokens) and the document index (~754) on every model call, plus the tool definition and the question, and every later step re-sends everything so far plus the document just read; the corpus averages about 2,080 tokens a document.

| Suite                              | Tests | Input tokens each |  Total input | Total output |
| ---------------------------------- | ----: | ----------------: | -----------: | -----------: |
| golden (three calls, two reads)    |    32 |           ~13,300 |     ~425,600 |       ~9,600 |
| groundedness (mixed)               |    23 |            ~9,000 |     ~207,000 |       ~5,750 |
| refusals (one call, no read)       |    24 |            ~2,350 |      ~56,400 |       ~1,200 |
| injection (one call, some history) |    23 |            ~3,000 |      ~69,000 |       ~1,380 |
| rubric grader (43 × 3 calls)       |   129 |              ~700 |      ~90,300 |      ~10,320 |
| **total**                          |       |                   | **~848,000** |  **~28,000** |

The grader row is 43 rubric-bearing tests, the 32 goldens plus the 11 hallucination probes, each graded three times.

At Gemini 3.8 Flash's introductory list prices of $0.75 per million input tokens and $3.75 per million output tokens: 0.848 × $0.75 = $0.64, plus 0.028 × $3.75 = $0.11. **About $0.75 a full run**, before any implicit-cache discount, which only makes it cheaper. From 2027-01-01, when those prices double, about $1.50.

Read that as a typical figure, not a ceiling. Medium thinking spends more output tokens than the `low` floor the route used to send. The provider retries a test twice when earlier attempts were lost to a transport stall rather than answered, so a bad few minutes on Vertex can approach three times the request count; the `[chat]` log lines in the job output say how often that happened. The $50 monthly budget on the project is the real backstop.

Those two prices come from secondary sources, not from Google's own pricing page, which could not be read while this was written. Check the console before treating the figure as exact.

### Adding a golden when a corpus document is added

1. Add the document and run `bun run knowledge:check`.
2. Add at least one `golden` test that only that document can answer, with `metadata.expectReads` naming its id, a `contains-any` or `icontains-any` on wording distinctive to it, and a rubric in an `assert-set` of three at `threshold: 0.6`.
3. If the document introduces a topic the policy declines, add the refusal too.
4. Run `bun test` first: `evals/config.test.ts` catches a bad id or a missing metadata key without spending anything.
5. Then `bun run evals:smoke` while iterating, and `bun run evals` before the pull request; paste the summary in its body.

Goldens are hand-written from the corpus. They are never mined from traffic, because nothing is stored (decision of 2026-09-13).

## GCP and GitHub setup for the evals (owner, once)

These are Matt's to run. Nothing in the repository can do them, and the workflow fails closed until they exist.

### 1. A GitHub provider on the existing workload identity pool

```
gcloud iam workload-identity-pools providers create-oidc github \
  --project="$GCP_PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$GCP_WORKLOAD_IDENTITY_POOL_ID" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id" \
  --attribute-condition="assertion.repository_id == '43456112' && assertion.repository_owner_id == '8886227'"
```

**The attribute condition is the second of two boundaries, and the only one written here.** GitHub's token issuer is shared by every repository on GitHub, so without a condition any workflow anywhere could present a token this pool would accept. With it, only a token whose claims carry this repository's id is exchanged for anything.

The **first** boundary is GitHub's own: it does not issue an Actions OIDC token to a `pull_request` run from a fork. That matters because a fork's pull request runs the workflow file from the pull request's own head, so a contributor could rewrite `evals.yml` to print whatever token the job holds, and the pool's condition could not tell that run apart from one on `main`: both carry this repository's id. The workflow skips fork pull requests explicitly rather than relying only on the platform, and it must never be switched to `pull_request_target`, which would hand the base repository's trust to a fork's code.

It is keyed on the numeric ids, not on `mtrifilo/matttrifilo.com`, because names are reusable: rename the repository or the account and someone else can register the old name and mint tokens against a condition written on it. `43456112` is this repository's id and `8886227` is the owner's; both are public and come from `gh api repos/mtrifilo/matttrifilo.com --jq '.id, .owner.id'`. This is Google's own guidance for multi-tenant issuers.

### 2. Let that principal reach Vertex

Two shapes. The second is Google's preferred one and is worth trying first; the first is what the workflow is written for today.

**Impersonation (what `.github/workflows/evals.yml` expects):**

```
gcloud iam service-accounts add-iam-policy-binding "$GCP_SERVICE_ACCOUNT_EMAIL" \
  --project="$GCP_PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$GCP_PROJECT_NUMBER/locations/global/workloadIdentityPools/$GCP_WORKLOAD_IDENTITY_POOL_ID/attribute.repository_id/43456112"
```

**Direct resource access (no service account):** grant the federated principal the role on the project and delete the `service_account:` line from the workflow's auth step.

```
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --role=roles/aiplatform.user \
  --member="principalSet://iam.googleapis.com/projects/$GCP_PROJECT_NUMBER/locations/global/workloadIdentityPools/$GCP_WORKLOAD_IDENTITY_POOL_ID/attribute.repository_id/43456112"
```

Google recommends direct access over impersonation where the API accepts a federated token, and `google-github-actions/auth` v3 supports the no-service-account mode. Whether Vertex AI's `generateContent` accepts a `principalSet` identity directly could not be confirmed against Google's own documentation while this was written, so impersonation is the path the workflow ships with. If direct access works when tried, switch: it removes a hop and an identity.

**Use a dedicated identity, not `vercel-chat`.** The production service account (MTC-30) holds only `roles/aiplatform.user`, so on paper pointing CI at it grants nothing new. In practice the eval job installs the whole `promptfoo` dependency tree, several hundred packages, and runs it in the same process space as a live credential for the identity that serves production chat. A dedicated `github-evals` service account with the same single role, or the direct-access principal above, costs one command and keeps "what the deployment did" and "what a dispatched eval run did" separable in the audit log. Set `GCP_SERVICE_ACCOUNT_EMAIL` to that account rather than to `vercel-chat`.

Related surface worth knowing: `promptfoo` is a devDependency, so Vercel resolves and unpacks it during a production build too. Nothing imports it there, and `trustedDependencies` in `package.json` blocks install-time lifecycle scripts for everything outside the two named packages, so this is surface rather than a live path. If you would rather not have it there at all, drop the devDependency and call `bunx promptfoo@0.123.0` from the workflow and the npm scripts instead.

### 3. Log the token exchanges

In the console, IAM & Admin, Audit Logs: turn on Data Access audit logs for the **Security Token Service API** (`sts.googleapis.com`) and the **IAM API** (`iam.googleapis.com`) on the project. Cheap, and it means every exchange a GitHub workflow performs is recorded. Google's workload identity federation guidance recommends it.

### 4. Repository variables

Identifiers, not secrets, so they are variables and readable in logs.

```
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --body "projects/$GCP_PROJECT_NUMBER/locations/global/workloadIdentityPools/$GCP_WORKLOAD_IDENTITY_POOL_ID/providers/github"
gh variable set GCP_SERVICE_ACCOUNT_EMAIL --body "$GCP_SERVICE_ACCOUNT_EMAIL"
gh variable set GCP_PROJECT_ID --body "$GCP_PROJECT_ID"
```

`GCP_PROJECT_ID` is optional: the workflow falls back to the project id the auth action reports. Set it if that step ever fails with "No project id".

### 5. Do not make the check required

The workflow runs only on `workflow_dispatch` (decision of 2026-09-21), so there is no check to require; a required `evals` check would block every pull request forever. An outside contribution that changes the corpus or the prompt is evaluated by running `bun run evals` locally on its branch, or by cherry-picking its content changes onto a branch you own and dispatching the workflow there, never by dispatching on a branch whose `.github/` or `evals/` you have not reviewed.
