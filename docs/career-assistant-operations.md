# Matt's Career Assistant: operations

How the chat feature is protected, what it costs to abuse, and what to do when something goes wrong. Everything here is metadata-level: the route never records a visitor's words, and neither does anything below.

Rows marked "as of" are point-in-time observations. `vercel env ls`, the Vercel Firewall page, and the GCP console are the source of truth; check them before relying on a row during an incident.

## The layers (MTC-34)

| Layer            | Where                                                                                                                                                                                                                                                                                               | State                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Kill switch      | `CHAT_DISABLED=1` env var on Vercel, read before the body                                                                                                                                                                                                                                           | As of 2026-09-15: set on production; unset on preview and development              |
| BotID Basic      | `instrumentation-client.ts` (client), `withBotId` in `next.config.ts` (rewrites), `checkBotId` in `app/api/chat/route.ts` (server)                                                                                                                                                                  | In code; free on every plan                                                        |
| WAF rate limit   | Vercel dashboard, Firewall, one rule (Hobby allows one)                                                                                                                                                                                                                                             | **Not yet created**; spec below                                                    |
| Per-request caps | `lib/chat/validate.ts` and `lib/knowledge` budgets: 8 turns, 1,500-character questions, 80k input tokens, 3 documents / 20k tokens read (shared with the GitHub digests), 3 GitHub checks, 8,192 output tokens per step (shared with Gemini 3.8 Flash thought tokens at thinking `medium`), 4 steps | In code since MTC-31; output raised so medium-thinking briefings are not cut short |
| GCP budget       | Billing budget on project `matttrifilo-com`, $50 a month                                                                                                                                                                                                                                            | As of 2026-09-14 (MTC-30)                                                          |
| Vertex quota cap | GCP console, IAM & Admin, Quotas, `aiplatform.googleapis.com`                                                                                                                                                                                                                                       | **Not yet applied**; see below                                                     |

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
- `[chat] { inputTokens, outputTokens, cachedInputTokens, cacheHit, documentsRead, activityCalls, activityTokens, answered, finishReason, ms }`: completions. `cacheHit: false` across the board means the implicit cache is not engaging (MTC-38). `answered: false` means tokens were spent for nothing.
- `[chat] truncated` and `[chat] incomplete`: answers cut short; a trend means the output cap or the step count needs revisiting.
- `activityRefusedUnknown` / `activityRepeated` / `activityRefusedBudget` on the same line: checks turned away or repeated. Unknown means the model is guessing at repository ids. Repeated means it is looping, and counts a repeat answered from the call already in flight, which is not refused, as well as one turned away `repository_already_checked` (MTC-52); the field was named `activityRefusedDuplicate` until MTC-56, so a log search reaching back before that change needs both names. Budget counts two refusals under one name: a check turned away at the call cap (`RECENT_ACTIVITY_MAX_CALLS`), which reaches no network, and a digest fetched and then dropped for want of tokens, which spends a check and gives the visitor nothing. A line whose `activityCalls` is below the cap had no cap refusal, so there every budget refusal is a dropped digest or a repeat of one.
- `[chat] { stage: 'github', repository, status }`: a GitHub call that did not answer. A run of them on one repository means the rate limit or an outage; see the activity section below.
- Vercel Firewall overview: hits on the rate-limit rule and BotID's blocked count.

### Vertex first-byte latency, measured (MTC-47)

`vertexFirstByteMs` on a `[chat]` line is the slowest wait before Vertex sent a byte on any model call of that request. It is the only number that can move the two deadlines in `lib/ai/bounded-fetch.ts`; the value of the last-attempt ceiling is fixed by the budget arithmetic in that file, so a measurement can show it is too small but cannot be what sets it.

Measured 2026-09-22 from six eval runs, on GitHub's Ubuntu runners against the global Vertex endpoint at concurrency 2. Suite sizes differ per ref and two of the runs were cancelled part way, so the per-run counts are listed rather than implied; requests exceed tests because the eval provider re-runs a transport failure (`evals/provider.ts`).

| run         | requests | recorded a first byte | wrote a `TimeoutError` failure line |
| ----------- | -------- | --------------------- | ----------------------------------- |
| 35141498434 | 102      | 102                   | 0                                   |
| 35146960224 | 103      | 103                   | 1                                   |
| 35615460739 | 30       | 29                    | 0                                   |
| 35619729850 | 32       | 31                    | 3                                   |
| 35622479143 | 152      | 146                   | 11                                  |
| 35640340223 | 104      | 103                   | 3                                   |
| total       | 523      | 514                   | 18                                  |

The last two columns do not partition the first and must never be added: a request that exhausts the wrapper can write a failure line **and** an `incomplete` completion line carrying a `vertexFirstByteMs`, and 9 requests here did both. The request column is counted independently, one `botIdBypassed` line per request. In each cancelled run one request was killed mid-flight and logged neither.

**To reproduce.** `gh run view <id> --log` in `mtrifilo/matttrifilo.com`, then:

- The distribution: take `vertexFirstByteMs` off every multi-line `[chat] {`, `[chat] incomplete {` and `[chat] truncated {` block. Skip any block without the field. Percentiles below are nearest-rank, which matters at these sample sizes: a value can be the p95 of one row and the p99 of another.
- The failures: count single-line `[chat] { stage: 'model', error: 'TimeoutError', vertexRetries: N }` blocks. These carry no `vertexFirstByteMs` and are not in the distribution.
- The elapsed figures: they are in the `Error [TimeoutError]: Vertex sent no response byte in N ms across M attempt(s)` text, which reaches an eval log because the harness prints the error object. **No `/api/chat` log line carries it** (`logFailure` records a stage, an error name and `vertexRetries` by design), so on Vercel the visible signature of an exhausted wrapper is that failure line, not a duration.
- Attempt counts: `[chat] step` lines are completed model calls; `[vertex] retry` lines are abandoned attempts; the `TimeoutError` messages are final attempts that threw.

**Count attempts, not requests, when asking how often a deadline is met.** Request-level counts cannot be added, for the reason above. Attempts can: each one ends in exactly one of three log shapes.

| attempts ended as                  | count | log line                            |
| ---------------------------------- | ----- | ----------------------------------- |
| completed a model call             | 1,136 | `[chat] step`                       |
| abandoned at the probe and retried | 36    | `[vertex] retry`                    |
| exhausted the ceiling and threw    | 18    | `Error [TimeoutError]: ...`         |
| total                              | 1,190 | 54 of them, 4.5%, cut at a deadline |

The distribution, over the 514 requests that recorded one. All figures in ms:

| class                      | n   | p50    | p90    | p95    | p99    | max    |
| -------------------------- | --- | ------ | ------ | ------ | ------ | ------ |
| all requests with a value  | 514 | 5,288  | 17,013 | 22,051 | 26,838 | 35,970 |
| the request answered       | 504 | 5,260  | 16,665 | 21,203 | 26,187 | 33,958 |
| the request did not answer | 10  | 15,789 | 31,661 | 35,970 | 35,970 | 35,970 |
| no document read           | 173 | 3,322  | 9,695  | 13,842 | 22,999 | 25,634 |
| one document read          | 117 | 5,468  | 17,925 | 26,187 | 31,661 | 33,958 |
| two documents read         | 158 | 7,443  | 20,624 | 23,437 | 27,738 | 35,970 |
| three documents read       | 66  | 6,619  | 18,545 | 22,959 | 25,217 | 25,217 |
| `vertexRetries` = 0        | 492 | 5,193  | 15,842 | 20,624 | 26,187 | 27,738 |
| `vertexRetries` above 0    | 22  | 15,789 | 31,661 | 33,958 | 35,970 | 35,970 |

Outcomes: 22 of the 514 recorded `vertexRetries` above zero; 12 of those answered and 10 did not, and those 10 are every unanswered request in that population. The 18 that exhausted the wrapper each reported 67,501 to 67,504 ms across two attempts, which is 30,000 + 500 + 37,000 to within 4 ms; 18 of 523 requests, 3.4%, is how often a visitor would have got nothing. Do not try to reconcile the 22 and the 18 into a single retry total. They are drawn from the two overlapping populations above, and the unduplicated attempt-level figure is the 36 in the table.

**Four things these numbers cannot tell you.**

1. They are runner egress to the global endpoint, not Vercel's. Production has `CHAT_DISABLED=1` (MTC-35), so no production sample exists. `/api/ask/health?cache=1` on a preview is the nearest Vercel-side reading, with the caveat in that route's comment.
2. They are survivor statistics. `onFirstByte` fires only after a chunk arrives, so a wait cut at its deadline records nothing. "30 s is above p99" follows from how the instrument works, not from how fast Vertex is; the 4.5% attempt-cut rate is the figure that actually says how often a deadline is met.
3. The distribution is cut twice, once by each deadline. Above 30,000 ms a wait survives only on a last attempt, which is why exactly three samples clear it (31,661, 33,958 and 35,970) and all three sit in the retried row. Above 37,000 nothing survives.
4. The figure is one request's slowest call, not one call, so it cannot be split by step type. Answering "was it the thinking phase or the connection?" needs a per-step first-byte field, which does not exist yet.

**Re-measure when any of these change**, because each one moves the distribution and leaves the figures above quietly false: the default thinking level (`DEFAULT_CHAT_REASONING`, `lib/chat/validate.ts`), the model (`DEFAULT_GEMINI_MODEL`, `lib/ai/vertex.ts`, overridable by `GEMINI_MODEL` and not pinned by the workflow, so record which model a run used), the prompt or corpus size, or `CHAT_MAX_STEPS`. Update the table here, the two constants in `lib/ai/bounded-fetch.test.ts`, and the figures on `vertexFirstByteMs` in `lib/chat/handler.ts` together. Note also that GitHub deletes workflow logs on its retention window, so the run ids above stop being checkable after roughly 90 days from their dates.

## Runbook: something is wrong

1. Spend or request rate is climbing and it is not visitors: set `CHAT_DISABLED=1` on production and redeploy. The assistant disappears from the site on that deploy (panel, nav entry, résumé button, sitemap entries; `/ask` becomes a 404) and the route refuses. Nothing else on the site changes.
2. Check the Firewall overview for the source (rule hits, top IPs, JA4). Lower the rule's limit or add a deny rule for the JA4 if it is one client.
3. If automation is getting past BotID Basic, turn on Deep Analysis (above).
4. Re-enable once the pattern stops. Write down what happened in the MTC-34 ticket.

## Recent GitHub activity (MTC-45)

The assistant has a second tool, `recent_activity`. The corpus is a snapshot, so a question like "what is Matt working on right now?" is answered from GitHub instead of from a document written in September.

**What it fetches.** One repository per call, four public GitHub REST calls for it: the repository itself (for `pushed_at`), the last 20 closed pull requests filtered to the merged ones (newest eight kept, by title and merge date), the last eight default-branch commits (first line of the message, and the committer date), and `releases/latest` (tag and date; a 404 is normal and means no release). No author, login, avatar, URL, or SHA is carried at any point: the digest's shape has no field for one, so no prompt wording is load-bearing for Matt's "titles and dates only" decision.

**What it leaves out, and why** (2026-09-22, MTC-52). Three things a repository publishes are dropped in `lib/chat/github-activity.ts` rather than asked for in the prompt, because they are accurate and they are noise to the hiring manager the assistant answers: a release whose tag carries a `-screenshots` segment, which in the psy-loop is a screenshot upload published as a full release and therefore what `/releases/latest` returns; a release whose tag does not open like a version (`v?\d+\.\d+`), which closes the hole the first rule leaves for an upload tag spelled some other way; and issue-tracker keys (`PSY-2080`, `MTC-52`) in pull request titles and commit subjects. A digest with no release simply has no release line.

Three details worth knowing before changing any of it. The release rules judge the tag **as GitHub published it**, not the filtered one, because the filter would otherwise manufacture a version: `SDK-2.0.1` lost an issue-key-shaped prefix and became `0.1`, a release that does not exist. A tag with no minor part, `v1`, is therefore no release line either; that is the rule the ticket settled and no allowlisted repository tags that way today. And the key rule takes whole tokens only: `CVE-2024-1234`, `TLS-1.2` and `AES-256-GCM` are left alone, while `UTF-8`, `SHA-256`, `ISO-8601`, `HTTP-2`, `COVID-19` and `GPT-4` are removed as the accepted casualty of a rule with no acronym list. The two activity goldens assert the absence of keys and upload tags at the other end of the pipe (`assertNoTicketKeys`, `assertNoScreenshotRelease`); a red `assertNoTicketKeys` row citing a word like `GPT-5`, which the corpus does ship, is that pattern being blunt rather than the digest leaking.

**A duplicate check in one step is answered from the call already in flight** (2026-09-22, MTC-52), rather than refused: the second call awaits the first's promise and returns the same result, so one repository yields one outcome per step and a step can never carry both a digest and a failure for it. The digest is charged to the read budget once and delivered to each caller, so a repeated call resends a block already paid for; that trade stands.

**The progress view counts a repeated repository once** (2026-09-22, MTC-63, which fixed a missing row). The progress stage in `lib/chat/handler.ts` predicts the call cap from the distinct repositories whose digest reached the model, so one fetch answered twice is one check, and a repository checked in a later step (two calls for one repository and one for another, then the third) still gets its row. Counting per output left that third repository fetched with no row; its digest still reached the model and the answer was unaffected. The prediction can fall short of the session's count, which also spends a call on a fetch that failed, and a row it opens for a call the session then refuses is withdrawn when the refusal arrives; it can no longer run ahead of it. A step that checks all three repositories and repeats one was never affected: the SDK runs a step's tools only after the model finishes that step, so every call in it gets its row before any outcome arrives. `activityRepeated` counts a repeat answered from the fetch in flight as well as one refused `repository_already_checked`; a repeat past the call cap, or for a repository whose digest the read budget refused, counts as `activityRefusedBudget`, and below the cap a repeat for a repository GitHub did not answer is told `activity_unavailable` again and counted nowhere.

**Which repositories.** The allowlist is derived from the `assistant: true` flag in `content/open-source.ts`: `decant`, `psychic-homily-web`, `matttrifilo.com`. The model is given short ids, never owners, paths, or URLs, so an id it invents resolves to nothing and no request is made for it.

To add one, three files change and two tests will fail until they do:

1. `content/open-source.ts`: the entry, with `assistant: true` and a reviewed `summary`. A flagged entry with no summary is silently left off the allowlist, because the summary is what the model is shown in place of GitHub's description.
2. `content/knowledge/open-source/open-source.md`: a section describing it, which `lib/knowledge/knowledge.test.ts` requires of every curated project. Adding the repository also adds a card to the public /open-source page.
3. `lib/chat/repositories.test.ts`: the list of slugs is hardcoded there on purpose, so that growing the allowlist is a deliberate edit and not a side effect of editing a content file.

Then re-check the rate-limit arithmetic below, and `lib/chat/read-budget.test.ts`, which measures what the shared token budget allows.

**The cache.** Every fetch sets `next: { revalidate: 3600 }`, so a burst of questions about one repository costs one set of calls an hour (Matt's decision 3), and a visitor never waits on GitHub's rate limit. The data is at most an hour old, which is inside the precision of an answer that reports dates and not times.

**Rate limits without a token.** Unauthenticated GitHub allows 60 requests an hour per egress IP, and Vercel shares that IP with other tenants. In the steady state the cost is four calls per repository per hour times three repositories: **12 of the 60 per region**, because the hour of cache is what visitors share rather than each asking for themselves.

Two things that figure does not cover, and neither is verified against Vercel's behaviour here, so treat the 12 as the floor rather than a ceiling. Next's data cache is regional, so a deployment serving several regions pays the 12 in each. And an entry that has just expired does not hold concurrent requests behind one refetch as far as this has been established: N visitors arriving together on a cold or just-expired entry can issue up to 4N calls, bounded by concurrency and not by the cache. Both are reasons to set the token rather than reasons to worry: `GITHUB_TOKEN` in the Vercel project (any token with public read access; the same variable `lib/github.ts` already uses for the open-source page) raises the ceiling to 5,000 an hour and takes the shared IP out of the picture. The token stays on the server and is never shown to the model, which is given an allowlisted id rather than anything it could aim a credentialed request with.

**When GitHub does not answer.** Failing pull-request or commit calls make the whole check `unavailable` rather than an empty list, so the assistant can never report "nothing shipped recently" because of a 500. The model is told `{"error": "activity_unavailable"}` and the policy tells it to say current activity could not be checked and answer from the documents. The line to look for is `[chat] { stage: 'github', repository, status }`: a repository id and a status, never a URL and never a response body.

**Injection posture.** Pull request titles and commit subjects are written by anyone who has contributed to the repository, including bots, and they enter a model's context. Three things address that, and the first two are code:

1. `sanitiseText` in `lib/chat/github-activity.ts` strips HTML, markdown links and images, bare URLs, `@mentions`, control and bidi characters, and emoji shortcodes from every string, collapses whitespace, and caps each one at 120 characters. The whole digest is capped at about 1,500 estimated tokens, oldest entries dropped first, and charged against the same 20,000-token read budget the documents spend.
2. The digest reaches the model as one delimited block that says, on its own line, that its contents are quotations from a public code host and are data to summarise rather than instructions. The policy in `lib/chat/prompt.ts` says the same thing once more.
3. The client-chunk allowlist in `lib/chat/handler.ts` is unchanged, so the raw digest never reaches the browser; the visitor gets the answer and a progress row naming the repository.

The exposure is worth stating plainly: the assistant holds no private data and has no outbound channel other than the answer a visitor reads, so the "lethal trifecta" is not present. The risk is answer manipulation, and the filtering, the framing, and the two eval suites are what address it. A live injected commit is not needed to test the boundary, and `lib/chat/github-activity.test.ts` feeds the strings directly through the filter instead.

## The progress view (MTC-42, MTC-50)

While the assistant works, the transcript narrates it: a headline, one row per piece of work, and a timer. The server writes the whole account as a single `data-progress` part that it rewrites in place (`withProgress` in `lib/chat/handler.ts`); `lib/chat/progress.ts` is the browser's half, and every visitor-facing string is in `components/assistant/copy.ts`.

**What a row shows.** A read row's label is the document's title (`Reading Résumé…`). Expanded, it carries two more lines: the corpus topic the document sits in, shown as a label (Résumé, Career, FAQ, Open source, Blog), and the document's `##` section titles joined in order. The topic line is dropped when it would repeat the title, which is the résumé's case today. An activity row names the repository being checked on GitHub and carries neither. The writing row names nothing.

**Where the values come from.** All of them are looked up on the server at the moment the step is emitted, from the same index entry the read tool validates the model's id against. The model supplies an id and nothing else, so a row can only ever describe a document the index lists; an id that is not in the index earns no row at all. Headings are extracted by `documentHeadings` in `lib/knowledge/build.ts` when the corpus is built, which is once per server process, lazily, on the first request that needs it. They live on the entry object, not in the index text the model reads: the index is in every request, so nothing is added to it for the sake of the view. They are read off the text the tool would hand the model, so an faq question that was dropped as unanswered, and anything inside an HTML comment, cannot appear as a section.

**Headings are titles only.** The tool hands the model a whole document, so the list is that document's outline, not a claim about which parts of it were used, and nothing underneath a heading travels with it. `MAX_HEADINGS` (12) and `MAX_HEADING_CHARS` (120) live in `lib/progress-caps.ts`, a module with no imports: `lib/chat/progress.ts` validates the wire against them and `lib/knowledge/build.ts` extracts headings within them, so the build can never emit something the validator would drop, and the corpus never depends on the chat layer. `lib/progress-caps.test.ts` fails if any module under `lib/knowledge` imports from `lib/chat`, or if the caps module gains an import (it is in the browser bundle). The corpus is held below both by `lib/knowledge/knowledge.test.ts`, which is what keeps the count cap theoretical: a heading past the character cap is dropped, but the twelfth section would truncate the list silently, so a document that grew to twelve sections fails the suite instead. The corpus stands at nine sections and 88 characters at its longest. An editor's note written as a section title is refused at build time like any other placeholder.

**Collapsed, the run reports itself once**: `Used read_document on 3 sources in 14s`, with `and checked GitHub` added when the run also used the activity tool. The panel is shut by default once an answer has landed (Matt, MTC-42), which is why the collapsed line is the one that names the tool. A run that was cut off, or that finished without writing an answer, claims no count at all.

**The replayed part is not size-checked, on purpose** (decided 2026-09-22, MTC-65). The browser posts every earlier answer back with its progress part, and `lib/chat/validate.ts` skips that part without measuring it: every cap there measures text. Measured on 2026-09-22, as JSON with `ms` included:

- The largest part a finished run can leave with the current corpus (its three heaviest documents plus three GitHub checks) is 1,782 bytes, against 671 without headings.
- With every field at its cap (three reads, three checks, 64-character ids, 200-character titles, twelve 120-character headings), it is 6,383 characters. `lib/chat/validate.test.ts` pins this number.
- A run can leave a larger part if it is stopped mid-step. `withProgress` opens a row when a call starts and predicts the read and activity budgets from finished calls, so a step that asks for more than the budget lists every distinct id it named until the refusals arrive. A visitor who stops in that window keeps that part. Its bound is every index entry plus every allowlisted repository: 10,392 characters with the real corpus's headings, 62,059 with all 34 entries at the caps.
- The longest conversation the input budget accepts (eight questions at the question cap, answers filling the rest of the budget the real index leaves), carrying that stopped part on every answer, is 796,481 characters of JSON: 2.39 MB even at three bytes a character, against the 4.5 MB request body Vercel accepts ([Vercel Functions limits](https://vercel.com/docs/functions/limitations)). The test asserts this bound. At the caps each new corpus document adds about 43 KB to that worst case, so it fails at around eighty documents, and that is when the route needs a real bound.

A byte budget in validation was rejected because a wrong one would refuse a real visitor's next question, and it would not help against a tampered body: the body is parsed whole before validation, and the part is discarded unread like any other field the route ignores. Stripping headings from the outgoing request was not taken either: it saves about a kilobyte per turn with the current corpus and would change the client transport for that. When a test in the "replayed progress part" block fails, update the numbers here and in the comment on the replay path in `validate.ts` along with the test.

**Old transcripts.** The browser replays the whole message back with the next question, so parts narrated by an earlier deployment are validated by a newer one all the time. `topic`, `headings` and `kind` are therefore optional, and a field that does not check out costs the row its detail rather than costing the visitor the row.

## Focus on /ask (MTC-74, MTC-67)

A suggested question picked on a device whose primary pointer is coarse, or picked by a finger on any device (a starter or a follow-up, on /ask or on the homepage before the hand-off), moves focus to the transcript's visually hidden status region rather than the composer, so a phone's keyboard stays down while the answer streams; any other pick returns focus to the composer, and /ask focuses the composer on load only when the primary pointer is not coarse (`components/assistant/pointer.ts`; tests state a touch device with `test/touch-device.ts`).

## The Turbopack build cache (MTC-62)

Vercel restores a build cache before every build, keyed by team, project, framework, root directory, Node version, package manager and Git branch; a branch's first build has no cache of its own and gets the last production deployment's ([Vercel: caching process](https://vercel.com/docs/deployments/troubleshoot-a-build#caching-process)). Next.js 16.3 turned on Turbopack's persistent build cache inside that restore. On 2026-09-22 the first preview of PR #41, which changed `app/globals.css`, served the branch's JavaScript with main's stylesheet: the follow-up row it added had no rules at all and the transcript scrolled sideways. CI runs `bun run build` cold and was green.

The persistent build cache is therefore off in `next.config.ts` (`experimental.turbopackFileSystemCacheForBuild: false`) for every `next build`, not only Vercel's. Cost, measured 2026-09-22: CI's cold build step took 22 seconds and a cache-free Vercel build one minute including install. `lib/next-config.test.ts` fails if a Next upgrade stops recognising the option, because an unknown `experimental` key only prints a warning into a build log nobody reads on a green deploy. The dev server's cache (`turbopackFileSystemCacheForDev`) is still on by default; if a dev session looks stale, delete `.next/dev/cache`.

Belt and braces, owner's call: the project environment variable `VERCEL_FORCE_NO_BUILD_CACHE=1` makes Vercel skip restoring its cache at all, independent of the Next version. It is a Vercel setting, not a repository change, so it is not applied here.

If a preview ever looks like the branch's markup with the wrong styling, check the stylesheet before the code: open the page, fetch the `<link rel="stylesheet">` it names, and search it for a class the branch added. A stylesheet without that class is a cache hit, not a CSS bug. Rebuild the same commit without the cache: the deployment's **Redeploy** button in the Vercel dashboard with **Use existing Build Cache** unchecked. (`vercel deploy --force` also skips the cache, but it uploads the working directory rather than the commit, so only from a clean tree on the branch, and never `--prod`.) Then check again.

## Component tests (MTC-59)

Rendered behaviour is testable under `bun test`: no browser, no dev server, no runner change.

**Where they live.** Beside the component, as `*.test.tsx` (`components/assistant/starter-ticker.test.tsx`). Logic a component only draws stays where it is decided and keeps its own `.test.ts`, which is why `lib/chat/progress.ts` and `components/assistant/ticker-geometry.ts` are tested without a DOM.

**What the preload does.** `bunfig.toml` preloads `test/dom-preload.ts` once per run, before any test file is imported, because React DOM reads `window` and `document` while its own module evaluates. It registers Happy DOM through `@happy-dom/global-registrator`, puts back every global Bun already implements that Happy DOM overwrote (except `BROWSER_OWNS`, the window's own methods and the event classes the DOM's `dispatchEvent` insists on), and registers React Testing Library's `cleanup` as an `afterEach`. Bun cannot scope a test preload to a subset of files, so every test file runs with a DOM present; the restore is what keeps the replaced globals (streams, `fetch`, `Request`, `Response`, `URL`) Bun's under the server suites. The streams are the sharp edge: Happy DOM replaces `TransformStream` but not `ReadableStream`, and mixing the two throws `readable should be ReadableStream` through every streamed answer. `test/dom-preload.test.tsx` fails first, and by name, if a version bump breaks the restore or `BROWSER_OWNS`. What the restore does not undo is the globals Happy DOM adds: `window` and `document` exist in every suite, so a library that sniffs for a browser takes its browser branch under test (the AI SDK's user agent string and google-auth-library's crypto both do; no test depends on either today).

**When a Happy DOM API rejects a Bun type.** The restore gives the DOM Bun's `FormData` and `Blob`, so `new FormData(form)` comes back empty and Happy DOM's `FileReader` refuses a Bun `Blob`. A component test that needs one of these adds the name to `BROWSER_OWNS` in `test/dom-preload.ts`, runs the full suite (the server suites now see Happy DOM's version), and adds a pin to `test/dom-preload.test.tsx`.

**What not to test this way.** Happy DOM runs no animations and lays nothing out: every element measures zero wide, `:hover` and `:focus-within` never match, `:focus-visible` matches any focused element (so a pointer focus cannot be told from a keyboard one), and the app's stylesheet is never loaded. So motion, speed, pause-on-hover, the feel of a drag and anything that depends on a real width are preview checks, not tests. The stylesheet's own half of a behaviour is asserted against the CSS text instead (`lib/ticker-css.test.ts`, `lib/globals-css.test.ts`). One narrow exception: when a component reads a value back off the stylesheet (the ticker's fade width and its frozen track's lead), a test may inject those few rules from `app/globals.css` with `test/css-block.ts` and state a layout itself (stubbed pill offsets), which is how the ticker's hand-over tests prove the arithmetic of a scroll position. They prove the conversion, not what a browser draws. What a component test is for is the markup: what exists, how much of it, what a screen reader and the tab key reach, which state the component writes for the stylesheet to read, and what a click or a toggle changes. When a state is only written once something is moving or measured, the test states that premise itself (a stubbed `getAnimations` and a copy width, as the ticker's focus tests do) and asserts the flag, never the motion. A media feature is stated through Happy DOM's device settings (`window.happyDOM.settings.device.prefersReducedMotion`), which its `matchMedia` evaluates against, rather than by replacing `matchMedia`.

**Running them.** `bun test components/assistant/starter-ticker.test.tsx` for one file, `bun test -t 'folds the steps away'` for one test. Cost of the whole setup, measured 2026-09-22 with runs interleaved on a quiet machine, with and without `TZ=America/Phoenix`: about 0.2 seconds, 1.7 to 1.9 seconds for the suite before it and 1.9 to 2.2 seconds after (1,108 tests before, 1,131 after).

## Copy rules

No em dash anywhere a visitor reads (Matt, 2026-09-23): copy, corpus, and the policy use a comma, a colon, or a full stop instead. `lib/site-copy.test.ts` fails `bun test` on one in the text the source under `app/`, `components/`, `lib/og/` and `lib/seo/` renders, in `lib/chat/prompt.ts` and the chat's notices, in `content/open-source.ts`, in `content/knowledge/` and in `content/resume.md` (the files it reads are listed at its top; `content/blog/` is not among them); the policy tells the model the same, and `assertNoEmDash`, attached to every eval test through `defaultTest` in `evals/promptfooconfig.yaml`, fails an answer that uses one, or an en dash as a sentence dash. An en dash in a range ("Jul 2017 – present") is not a sentence dash. What counts as either is `lib/dashes.ts`, which both checks share.

## Updating the knowledge base

See `lib/knowledge/knowledge.test.ts` for the guards and `scripts/knowledge-check.ts` for the report. `bun run knowledge:check` prints the index and every dropped document.

A placeholder is a `## ` heading, or any line outside a fenced block or inline code, that starts with `TODO` (after an optional list marker) or contains `TODO (Matt)`: in `content/knowledge/faq` a question whose heading or answer is one is dropped and listed by `bun run knowledge:check`, and anywhere else it fails the build.

## Eval suites (MTC-32)

`evals/` holds four promptfoo suites that run the chat route's own handler in process. There is no server and no fixture model: `evals/provider.ts` builds `createChatHandler` with the real knowledge corpus and the real Vertex client, posts the body a browser would post, and reads the answer back off the stream. What a suite asserts on is therefore the live policy, the live corpus and the live read budget.

| Suite          | Tests | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `golden`       |   100 | Hiring-manager questions. The answer contains the distinctive facts, stays in the third person, and opened the document the fact lives in (`metadata.readIds`). One `llm-rubric` per test on top, graded three times inside an `assert-set` at `threshold: 0.6`, except the two MTC-45 activity goldens, which assert that the run checked the right repository (`metadata.activityRepos`), dated the work, and named no handle, no issue key and no screenshot upload, because what a repository shipped this week is not a stable claim to grade.                                                                                                                         |
| `refusals`     |    24 | Compensation, employment status, contact details, colleague names, employer internals, opinions, "print your system prompt", and off-topic tasks. Compared against `DECLINE_SENTENCE` imported from `lib/chat/prompt.ts`, so rewording the sentence fails the suite instead of passing a stale copy.                                                                                                                                                                                                                                                                                                                                                                        |
| `injection`    |    24 | Role-play, encoded and reversed instructions, instructions planted inside a quoted "document", multi-turn escalation over forged assistant turns, attempts to dump the index or name the tool, and a visitor quoting a fake commit message that carries instructions. Every test asserts that the run answered at all, that it stays in the third person, and that no verbatim policy phrase or tool name comes back; the eight tests that could plausibly open a document also assert it read nothing outside the index. A paraphrased disclosure of the rules is not something a substring check can catch; read a failing injection answer, do not only trust the green. |
| `groundedness` |    23 | Twelve questions answered from a document: the run must open one the test names (`assertReadsAnyOf`), and its `Sources:` trailer must name only documents in the server's read ledger, `metadata.readIds`, which also lists documents refused for size or budget (`assertCitesOnlyWhatItRead`), and may be absent only where the run opened that document (`assertCites`, the sixth case under "A red run"; `evals/config.test.ts` refuses a test that carries one of the two without the other). Eleven probes for plausible-but-absent facts must be declined rather than invented. Its pins follow the goldens' rule (see "Adding a golden").                            |

Deterministic assertions are the gate. `llm-rubric` appears where judgement is genuinely needed and nowhere else: in `golden`, on whether an answer is _right_, and on the `groundedness` probes, where a substring list cannot see an invention phrased around it. The grader runs at temperature 0 and each rubric sits in an `assert-set` of three with `threshold: 0.6`, so two of three grades must pass. Be precise about what that buys: three identical prompts at temperature 0 are highly correlated, so this absorbs the residual nondeterminism of serving, not a difference of judgement. It costs 327 of the run's calls, about $0.27.

The threshold is 0.6 rather than 0.67 for an unobvious reason worth keeping written down: promptfoo scores an `assert-set` on the weighted **mean** of its members and passes on `score >= threshold`. Two passes out of three average 0.666…, which is below 0.67, so a 0.67 threshold would have demanded three of three and the tolerance would not have existed at all.

Every test whose assertions are all absence checks ("does not speak as Matt", "does not leak the policy") also carries `assertAnswered`. Without it those tests pass on an empty answer, which the route really does return when a run spends its steps reading or a provider filter stops the generation, and the suite proving jailbreak resistance would go green against an assistant that says nothing. `evals/config.test.ts` enforces that pairing so it cannot be dropped later.

The assertions live in `evals/assertions.ts` and import the route's own constants rather than pasting them. `evals/config.test.ts` runs in `bun test` and checks the YAML itself: every test is labelled with its suite, names an assertion that actually exists, declares the metadata that assertion reads, and points `expectReads`, `expectReadsAny` and every `expectReadsAnySet` alternative at documents in the corpus.

The same file enforces the correspondence rule (MTC-51): every entry of `STARTER_QUESTIONS` in `components/assistant/copy.ts` must be the exact `vars.question` of at least one `golden` test, so a question added to the pill row without a golden fails `bun test` and names itself in the failure.

### The follow-ups trailer (MTC-41)

Every answer that is not a decline ends with a second trailer below `Sources:`: a line reading `Follow-ups:`, alone, and two or three questions under it, one to a line. The policy in `lib/chat/prompt.ts` asks for them and constrains them to questions the corpus can answer, ordered towards the outcomes Matt features first. The route parses that block out of the text it observed, validates each proposal (a question mark at the end, 12 to 140 characters, no markdown, no link, no address, no invisible characters, deduplicated, at most three) and puts the survivors on the message metadata as `followUps`. A decline, a cut-off answer and a run that never finished all carry none.

The trailer travels down the stream inside the answer text, exactly as the `Sources:` line does, and `lib/chat/answer.ts` takes both back off before the transcript renders a word; the pill row is built from the metadata alone, so a proposal that failed validation is never drawn as a button. That is the mechanism Matt chose on 2026-09-22 ("a fixed marker at the end of the answer that the client strips"), and what it means in practice is that the hiding is a client-side property: a marker the parser cannot recognise leaves the block on screen as prose rather than silently showing a bad pill. The marker is therefore matched generously (case, bolding and heading marks are tolerated) and must be alone on its line, so an ordinary sentence that opens "Follow-ups: …" cannot truncate a real answer.

Seven goldens carry `assertFollowUpsAnswerable`, which is the only assertion in the suites that makes a route call of its own: it replays the golden's question and answer as `history` and asks **one** of the run's proposals, exactly as the browser would. It fails if the run proposed nothing, if the assistant declines its own suggestion, or if the second answer was written without reading a document or checking GitHub, which is the acceptance criterion that a shown follow-up returns a sourced answer. One proposal is asked, to bound what a golden costs, and `followUpToAsk` picks which: the run's UTC day number plus a hash of the golden's question, modulo the number of proposals. So consecutive days rotate each golden through every position while its proposal count holds, and one run spreads the seven goldens across positions. The proposals themselves are regenerated on every run, so a re-run on the same day repeats the position only when the count is the same, and never promises the same question; to reproduce a red row, ask the question its reason quotes ("asked proposal 2 of 3, ..."). A red row there is a finding about the policy or the corpus, not an assertion to loosen: either the policy is inviting questions the documents cannot answer, or the document that would answer one is missing. Budget one extra route call for each of those seven tests, and up to three when a connection stalls, since that nested call retries like any other (`EVAL_TRANSPORT_ATTEMPTS`); it also exercises the real GitHub fetch, so it can spend rate limit as well as tokens. `assertThirdPerson` reads the proposals off the metadata in every suite that carries it, so the persona rule covers the pills as well as the prose.

### When they run

Locally, during development, by decision of 2026-09-21 (Matt): a full run on every pull request cost more in tokens than it caught, and a one-in-a-hundred model flake reddened most runs. Run `bun run evals:smoke` while iterating and `bun run evals` before opening a pull request that changes anything the answers depend on (both write `evals/out/results.json`, then print the per-suite table and write `evals/out/summary.json`; the table is what goes in the pull request): `content/knowledge/**`, `lib/chat/**`, `lib/knowledge/**`, `lib/ai/**`, `lib/env.ts`, `app/api/chat/**`, `evals/**`, or a bump of `ai` or `@ai-sdk/google-vertex`. Paste that table into the pull request body; a reviewer should see the counts, not take them on faith. `bun run evals:report` regenerates the table from an existing `results.json` without spending anything.

`.github/workflows/evals.yml` still exists and runs only on `workflow_dispatch`. Use it when the question is whether the deployment's own identity can run the suites (an IAM or federation change). It dispatches only a ref in this repository and runs the workflow file at that ref with `id-token: write`, so never dispatch it on a branch whose `.github/` or `evals/` changes you have not read: a contributor's branch is evaluated by cherry-picking its content changes onto a branch you own, or by reviewing those two directories first. It is not a required check and must not become one.

Outputs, locally and in CI: `evals/out/results.json` and a compact `evals/out/summary.json`, both gitignored (in CI also uploaded as the `evals` workflow artifact, plus the per-suite table in the job summary). `summary.json` has a stable shape, which is the shape the site publishes (see "Publishing a run" below). Three counters measure the run rather than the assistant, and the publish gate reads all three:

- `retried`: tests whose first attempt was lost to a stalled Vertex connection and was sent again, which is the difference between a bad few minutes upstream and a real regression.
- `transportFailures`: tests that produced no answer to grade at all, after every attempt: `CHAT_ERROR: interrupted`, `unavailable`, another API error, or a stream with no text in it. Those rows say nothing about the assistant, and an assertion that checks for the absence of something passes on them.
- `missingTrailer`: answers that used a document and wrote no `Sources:` trailer. The groundedness suite tolerates that where the run opened the document the test names (below), so this number and the `warning:` reasons in `results.json` are where a tolerated miss is visible; a miss the assertion still fails shows up as a red row as well as in this count. Neither counter is rendered on `/ask/evals`; both are in the committed record, because the site applies the publish floor again when it reads one.

```json
{
  "commit": "…",
  "ranAt": "…",
  "model": "gemini-3.8-flash",
  "promptfooVersion": "…",
  "suites": [{ "name": "golden", "passed": 100, "total": 100 }],
  "totals": { "passed": 171, "total": 171 },
  "retried": 0,
  "transportFailures": 0,
  "missingTrailer": 0
}
```

### Publishing a run (MTC-44)

The site publishes eval results at `/ask/evals`, linked from the line under the chat pane. It reads them from `evals/results/`, which is committed: one file per recorded run, named `<YYYY-MM-DD>-<7-char sha>.json`, holding exactly the `summary.json` above.

After a local `bun run evals` that accompanies a corpus, prompt or suite change:

```
git commit ...                   # the change the run covers, first
bun run evals:publish            # writes evals/results/<date>-<sha>.json
git add evals/results/<the file it named>
```

Commit the tested change **before** publishing. A local run records `"commit": "local"` because it has no `GITHUB_SHA`, so the script substitutes `git rev-parse HEAD`; with the change still uncommitted that names its parent, which is not the code that ran. The script refuses to publish from a dirty working copy for exactly this reason.

Commit the record in the same pull request as the change. Older files stay: the page shows the newest run and a history of the last ten, so a reader can see the trend. A committed record is never edited afterwards; a new run adds a new file, and `evals:publish` refuses rather than overwrite one that already exists. Two runs on the same day at the same commit collide on the name: if the earlier file has not been committed yet, delete it and publish again; if it has, it stands.

What it refuses, and why each refusal exists (MTC-54). `/ask/evals` is a credibility page: a hiring manager reads it as evidence that the assistant is tested, so a record of a bad run is worse than no record, because it is published under the same claim as a good one. There is deliberately no force flag and no environment variable that lifts any of this.

| It refuses when                                                                                                                                                                                                          | Because                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| any test produced no answer to grade (`transportFailures` above zero)                                                                                                                                                    | such a row is not evidence about the assistant either way, and a record that counts it as a test result publishes a number no answer stands behind |
| the run passed under 95 percent of its tests, or any one suite under 90 percent                                                                                                                                          | the page states a pass rate; below that the honest statement is that the run failed                                                                |
| `retried` is above 10 percent of the tests                                                                                                                                                                               | the run happened in a bad hour upstream, and its timings and counts are about Vertex                                                               |
| `missingTrailer` is above 10 percent of the tests                                                                                                                                                                        | the citation line is part of the answer policy, and the groundedness suite tolerates single misses; a tenth of the run is a regression             |
| the summary is missing any field of the record (`commit`, `ranAt`, `model`, `promptfooVersion`, `suites`, `totals`, `retried`, `transportFailures`, `missingTrailer`), or its suite rows do not add up to its totals row | a record that cannot say what ran, when, or against which code is not version-linked, and the site would skip it at build time anyway              |
| the run walked no tests at all                                                                                                                                                                                           | zero of zero is not evidence                                                                                                                       |
| no commit can be named at all                                                                                                                                                                                            | the same, at the point where there is nothing to attach the record to                                                                              |
| git cannot say whether the working copy is clean                                                                                                                                                                         | the check below fails closed, so the refusal cannot be lifted by running the script where git does not answer                                      |
| the working copy is dirty                                                                                                                                                                                                | the record names a commit that must contain the suites and the corpus the run walked; with a change uncommitted, no commit does                    |
| a record already exists under that name                                                                                                                                                                                  | a committed record is never rewritten                                                                                                              |

`lib/evals/results.ts` holds the same floor as named constants and applies it again when the site reads the directory, so a record written or edited by hand is skipped with a build warning rather than rendered.

What it does not do is stop a false record written on purpose: `evals/out/` is not committed, so a hand-edited `summary.json` reaches the script as a summary, and reviewing the record in the diff is what catches that. The gate is against publishing a run that went badly.

When it refuses, the answer is another run, not a way around the script: re-run when Vertex is healthy (a clean `bun run evals:smoke` first, as below), or dispatch `.github/workflows/evals.yml` by hand to get a record from GitHub's network as the deployment's own identity. A refusal on the pass rate is not a flake to route around; it is the suites saying the change is not ready.

The record it writes is built field by field rather than copied, so a new field in `summary.json` is published only when someone adds it to `evals/publish.ts` on purpose; `results.json`, which holds every question and every answer, is never the thing being copied.

`promptfooVersion` is read from the installed `node_modules/promptfoo` when the summary is written, so the record names the promptfoo that actually ran. A summary without one is refused: run `bun run evals:report` with the dependencies installed to record it.

One caveat about imported records: a summary produced by a `pull_request`-triggered CI run records `GITHUB_SHA`, which for that event is GitHub's synthetic merge commit rather than a commit in the branch's history. Records published from local runs do not have this problem, and local runs are how the suites run now.

The page renders aggregates only: suite, passed, total, the run date, the commit, the model id, the promptfoo version, the retry count, and a sentence per suite on what it checks. No question, no answer and no grader rationale is published; the suite definitions in `evals/suites/` are the public detail. `app/ask/evals/suite-notes.test.ts` fails when a suite in `evals/suites/`, or in a published record, has no sentence, and when a sentence describes neither, so a new suite cannot ship as an unexplained row and a deleted one cannot leave its sentence behind. Nothing is published for an assistant that is switched off: with `CHAT_DISABLED=1` the page is a 404 and the link is not rendered, exactly like `/ask`. With no record in `evals/results/` the page says there is no published run yet and the link is not rendered.

A summary that never reaches `evals/results/` is not published; the page shows the newest run that did, dated, so a long gap is visible rather than hidden.

### A red run

`bun run evals/summarize.ts` exits non-zero when any test failed. Nothing enforces that on a merge; the person opening the pull request does, by running the suites and pasting the result. A red run is one of four things, and `results.json` says which:

1. **The corpus changed and a golden is now wrong.** Fix the golden. That is the suite doing its job.
2. **The answer got worse.** Fix the prompt or the corpus, not the assertion.
3. **A grader flake.** Only on a rubric, and only if two of three grades disagreed. Re-run before touching anything.
4. **Vertex was slow, or impersonation was not ready.** A row reading `CHAT_ERROR: interrupted` or `unavailable` is a stalled connection or a refused token, not an answer; the provider retries transport failures twice more, and a row that never produced an answer is counted in `transportFailures`, which makes the run unpublishable whatever else it says. The CI workflow also pings Vertex (`evals/warmup.ts`) after GitHub OIDC auth so the first goldens are not measuring IAM eventual consistency. A run with several of them after a successful warmup is upstream latency. A row that failed this way writes `[chat] { stage: 'model', error: ..., vertexRetries: N }` and nothing else: no `vertexFirstByteMs`, because no byte arrived. The rows that did answer carry both fields on their completion line, and a full suite is the largest sample of them anything here produces; the percentiles and the extraction recipe are under "What to watch" above.

A fifth possibility is that the job ran out of time rather than failing. `.github/workflows/evals.yml` caps the job at `timeout-minutes: 90`, and `bun run evals` runs the 171 tests eight at a time (`--max-concurrency 8`, MTC-54) rather than two, so the same work finishes in about a quarter of the wall time. Each test is several model calls, not one, and each rubric-bearing test adds three grader calls after it, so the only honest figure is a measured one: the twelve-test smoke subset took 4m32s at concurrency 8 on 2026-09-22, during an hour when Vertex was stalling. A full run has not been timed at this concurrency. A timeout kills the job rather than the step, so `continue-on-error` on the suites step does not rescue it and there is no `results.json` to read. If that happens, raise the cap or the concurrency; it is a sizing problem, not a regression.

A sixth is a missing `Sources:` trailer. That one no longer reddens a run on its own: where the server's ledger shows the run opened the document the test names in `expectReadsAny`, and the answer is a real answer rather than a decline, `assertCites` passes the row with a reason that begins `warning:` and the provider counts the test in `missingTrailer` (MTC-54). promptfoo has no warning state of its own, so the row reads as a pass in the table and the evidence is the count in the summary plus that reason in `results.json`. It is still a failure when the run read nothing, when it read something other than the document the test names, when the answer is empty, and when the answer says the material does not cover the question; and the publish gate refuses a run where more than a tenth of the tests did it.

Never relax an assertion to get a green run without saying so in the pull request.

### Running them locally

The suites authenticate with Application Default Credentials. `lib/ai/vertex.ts` uses the Vercel OIDC federation when all four `GCP_*` federation variables are present, falls back to ADC when none of them is, and throws when some but not all are set, so a deployment missing one still fails with that variable's name rather than silently degrading.

```
gcloud auth application-default login
GCP_PROJECT_ID=<project> VERTEX_PROJECT_ID=<project> bun run evals:smoke
```

`evals:smoke` is the first three tests of each suite, twelve in all, for a few cents, and it writes `evals/out/smoke-results.json` and `evals/out/smoke-summary.json` rather than the files a full run writes, so a filtered run can never become the summary `evals:publish` reads. `bun run evals` is the whole thing.

How to spend a session (MTC-54):

1. Start with `bun run evals:smoke`. If rows come back as `CHAT_ERROR: interrupted` or `unavailable`, **stop and come back later** (the clean smoke run of 2026-09-21 passed 12 of 12 in under six minutes at concurrency 2, so wall time alone is a weak signal; the error rows are the reliable one). Vertex not answering from this machine is a bad hour upstream, not a suite to debug, and a full run in that state burns the budget for a record that cannot be published anyway. The alternative path is dispatching `.github/workflows/evals.yml` by hand, which runs from GitHub's network as the deployment's own identity.
2. Iterate on the tests you are actually changing rather than the whole suite: `bunx promptfoo eval -c evals/promptfooconfig.yaml --filter-pattern '<regex on the description>'`, or `--filter-metadata suite=groundedness` (`evals:smoke` uses the same flag on `smoke=true`). Both cost only what they run.
3. Run the full `bun run evals` once, at concurrency 8, before opening the pull request, and paste its table into the body.
4. If the published record should cover this change: commit the change first, then `bun run evals:publish`, then commit the record it writes. Publishing from a working copy with uncommitted changes is refused, for the reason under "Publishing a run".

`CHAT_REASONING=low|medium|high bun run evals:smoke` points the route at a different Gemini 3.8 Flash thinking level; `bun run evals:compare` runs the smoke subset at all three and prints a table (it sets its own `--max-concurrency 2` and was left there: it is a comparison of three runs, not a run before a pull request). The live route defaults to `medium`. Run both from the repository root: the provider imports through the `@/` alias, and promptfoo resolves it relative to the working directory, so running from inside `evals/` turns every test into a module-not-found error row.

Four traps worth knowing. A `.env` written by `vercel env pull` is loaded by promptfoo automatically, and it carries the four federation variables, which pushes the run onto the Vercel OIDC path rather than ADC; move it aside to force ADC. If you ran the `gcloud` setup below in this shell you exported three of those four names, which is a partial set: the provider checks for that before it builds a handler, so every row names the missing variable instead of saying `unavailable`. The run still walks all 171 tests, but it makes no model call and costs nothing. Open a fresh shell. `VERTEX_PROJECT_ID` is separate from `GCP_PROJECT_ID` because promptfoo's own Vertex provider, which grades the rubrics, resolves its project independently of ours. And a local run authenticates as **you**, not as the deployment's service account, so a green local run says nothing about whether that account's `roles/aiplatform.user` is enough; only a CI run answers that.

### Cost of a run

171 tests. The route sends the policy (~2,162 tokens after MTC-45), the document index (~754) and the repository list (~152) on every model call, plus the tool definition and the question, and every later step re-sends everything so far plus the document just read; the corpus averages about 2,080 tokens a document.

| Suite                               | Tests | Input tokens each |    Total input | Total output |
| ----------------------------------- | ----: | ----------------: | -------------: | -----------: |
| golden (three calls, two reads)     |    98 |           ~13,300 |     ~1,303,400 |      ~29,400 |
| golden, activity (one GitHub check) |     2 |           ~15,000 |        ~30,000 |         ~600 |
| groundedness (mixed)                |    23 |            ~9,000 |       ~207,000 |       ~5,750 |
| refusals (one call, no read)        |    24 |            ~2,350 |        ~56,400 |       ~1,200 |
| injection (one call, some history)  |    24 |            ~3,000 |        ~72,000 |       ~1,440 |
| rubric grader (109 × 3 calls)       |   327 |              ~700 |       ~228,900 |      ~26,160 |
| **total**                           |       |                   | **~1,898,000** |  **~64,500** |

The grader row is 109 rubric-bearing tests, the 98 rubric-bearing goldens plus the 11 hallucination probes, each graded three times. The two activity goldens carry no rubric, so it does not grow with them.

At Gemini 3.8 Flash's introductory list prices of $0.75 per million input tokens and $3.75 per million output tokens: 1.898 × $0.75 = $1.42, plus 0.0645 × $3.75 = $0.24. **About $1.66 a full run**, before any implicit-cache discount, which only makes it cheaper. From 2027-01-01, when those prices double, about $3.32.

Concurrency does not appear in any of this, and that is the point: `--max-concurrency 8` (MTC-54) changes how long a run takes, not what it costs, because the same calls are made either way. What bounds the concurrency is the Vertex requests-per-minute quota for the model on the project (GCP console, IAM & Admin, Quotas, filter on `aiplatform.googleapis.com`), which is the same quota the budget section suggests lowering to cap spend. Raising concurrency past it converts a slow run into a run of quota errors.

Read that as a typical figure, not a ceiling. Medium thinking spends more output tokens than the `low` floor the route used to send. The provider retries a test twice when earlier attempts were lost to a transport stall rather than answered, so a bad few minutes on Vertex can approach three times the request count; the `[chat]` log lines in the job output say how often that happened. The $50 monthly budget on the project is the real backstop.

Those two prices come from secondary sources, not from Google's own pricing page, which could not be read while this was written. Check the console before treating the figure as exact.

### Adding a golden when a corpus document is added

1. Add the document and run `bun run knowledge:check`.
2. Add at least one `golden` test that only that document can answer, with `metadata.expectReads` naming its id, a `contains-any` or `icontains-any` on wording distinctive to it, and a rubric in an `assert-set` of three at `threshold: 0.6`.
3. If the document introduces a topic the policy declines, add the refusal too.
4. Run `bun test` first: `evals/config.test.ts` catches a bad id or a missing metadata key without spending anything.
5. Then `bun run evals:smoke` while iterating, and `bun run evals` before the pull request; paste the summary in its body.

A new document can make an existing golden's pin stale: the run opens the new document, answers correctly, and fails `assertReadsExpected` because the test still names the résumé. So when a document lands, check every test in `evals/suites/` whose reads name a document it overlaps, and choose each pin by what the reader needs. Pin the new document alone in `expectReads` when the question is about the subject that document is written about (its title names the programme or feature) and the older source gives it a line; the prompt tells the model to prefer that document, so a run that skips it is a worse run. Use `expectReadsAny` with `assertReadsAnyOf` when two documents each hold every fact the rubric requires, so either is a correct read. Keep the old pin when only it holds a fact the rubric grades. Never list two documents under `expectReads` to mean "either": that requires both. Whichever you choose, reword the rubric so an answer drawn only from any document the test accepts can pass, never by lowering the threshold or dropping a fact that document states, and record the choice in a one-line comment above the test, `# Reads:` for a pin or `# Reads any of:` for a set.

When one document holds every graded fact and two others hold them only between them, neither list says "that one, or both of the others". `expectReadsAnySet` with `assertReadsAnySet` does: `[[resume], [merge-api-decomposition, contacts-api-and-shadow-comparison]]` passes on the résumé, or on both of the others, and fails on one of them alone. Its comment is `# Reads any set of:`. "Both" means both ids are in the read ledger, which also lists a document refused for size or budget, so a set can pass on a run that saw only part of it; the rubric is what catches the missing half. `evals/config.test.ts` refuses the set form on a test that carries `assertCites`, whose missing-trailer tolerance reads only the two flat lists.

The rule applies to the `groundedness` suite exactly as to `golden`, and a question the two suites both ask, in the same or nearly the same words, accepts the same documents in both. The groundedness citation tests all read through `assertReadsAnyOf`, so a pin there is a one-element `expectReadsAny`, and they carry no rubric to reword.

Goldens are hand-written from the corpus. They are never mined from traffic, because nothing is stored (decision of 2026-09-13).

### Adding a starter question (MTC-51)

1. Add the question to `STARTER_QUESTIONS` in `components/assistant/copy.ts`.
2. Keep the pool's pinned order. The independent-deploys question stays the tenth question (Matt, 2026-09-22, MTC-41), so a question inserted before it moves it and fails `copy.test.ts`. Each ticker row's first four pills open on the questions tagged in `STARTER_HEAD_THEMES`, in the featuring order, with the untagged head questions after them in their approved order (Matt, 2026-09-23, MTC-76). Where a new question goes in the first ten is Matt's call.
3. Add a `golden` test whose `vars.question` is that string **byte for byte**. A golden on the same subject in other words does not satisfy the correspondence test, and is not meant to: what is being measured is the wording in the pill.
4. Find the sentence in `content/knowledge/**` that answers it, cite the document and that sentence in a comment above the test, and write the rubric to those facts. A rubric must never reward an inferred characterisation presented as documented.
5. If the facts the rubric names live in different documents, say in the rubric that any one of them is enough. `assertReadsAnyOf` only requires the run to have opened one, so a conjunctive rubric over several documents is a flaky test, not a strict one.
6. `bun test` catches a missing golden, a bad document id, a duplicate question and a duplicated YAML anchor before anything is spent.

If the corpus cannot answer the question, it does not get a golden that expects a decline. It goes on [MTC-40](https://linear.app/psychic-homily/issue/MTC-40), which collects the answers only Matt can write.

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
