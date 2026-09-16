# Matt's Career Assistant: operations

How the chat feature is protected, what it costs to abuse, and what to do when something goes wrong. Everything here is metadata-level: the route never records a visitor's words, and neither does anything below.

Rows marked "as of" are point-in-time observations. `vercel env ls`, the Vercel Firewall page, and the GCP console are the source of truth; check them before relying on a row during an incident.

## The layers (MTC-34)

| Layer            | Where                                                                                                                                                                          | State                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Kill switch      | `CHAT_DISABLED=1` env var on Vercel, read before the body                                                                                                                      | As of 2026-09-15: set on production; unset on preview and development |
| BotID Basic      | `instrumentation-client.ts` (client), `withBotId` in `next.config.ts` (rewrites), `checkBotId` in `app/api/chat/route.ts` (server)                                             | In code; free on every plan                                           |
| WAF rate limit   | Vercel dashboard, Firewall, one rule (Hobby allows one)                                                                                                                        | **Not yet created**; spec below                                       |
| Per-request caps | `lib/chat/validate.ts` and `lib/knowledge` budgets: 8 turns, 1,500-character questions, 26k input tokens, 3 documents / 20k tokens read, 1,000 output tokens per step, 4 steps | In code since MTC-31                                                  |
| GCP budget       | Billing budget on project `matttrifilo-com`, $50 a month                                                                                                                       | As of 2026-09-14 (MTC-30)                                             |
| Vertex quota cap | GCP console, IAM & Admin, Quotas, `aiplatform.googleapis.com`                                                                                                                  | **Not yet applied**; see below                                        |

Only the WAF rule refuses at the edge. BotID, the per-request caps, and the kill switch all run inside the function, so until the rule exists a flood still costs one invocation and one classifier round-trip per request against the plan's quotas. BotID stops model spend, not traffic.

## Kill switch

Setting `CHAT_DISABLED=1` on an environment makes every request to `/api/chat` answer 503 with the `disabled` envelope before the body is read or BotID is consulted. The UI shows the route's sentence and the email address.

```
vercel env add CHAT_DISABLED production   # value: 1
vercel env rm  CHAT_DISABLED production   # to re-enable
```

Vercel bakes environment variables into a deployment, so redeploy production after changing it (a dashboard redeploy of the current deployment is enough).

## BotID

- Every POST to `/api/chat` from a page carries BotID's classification header. `checkBotId()` is an HTTPS call to Vercel's classifier on every request, made before the body is read and bounded at 3 s (`lib/chat/visitor.ts`). Only an explicit "not a bot" verdict passes: a bot, a verified crawler, or a verdict with no `isBot` at all (an error body from the classifier) gets 403 and the `blocked` envelope, logged as `{ rejected: 'blocked', verifiedBot }`. A classifier that throws or stalls gets 502 and the `unavailable` envelope, logged as a stage line: the route fails closed.
- Expected, per Vercel's documentation and not verified from this repository: a request without the client's classification header (a `curl`) is classified as a bot on a Vercel deployment. It cannot be checked on a preview from outside a browser (deployment protection answers first) and cannot be checked on production until `CHAT_DISABLED` is lifted, since the kill switch answers before the classifier. What was verified on a preview: a real browser passes, including the first request after the homepage hand-off.
- `{ botIdBypassed: true, env }` at warn level means the classifier reported a bypass. In development that is normal (BotID does not run there). In production it means a request was served without a classification; treat a run of them as a signal, not noise.
- The challenge script and its calls go through same-origin rewrites, so the site's CSP needs no new host. Two directives are unverified: `script-src` has no `'unsafe-eval'`, and `frame-src` does not include `'self'`. The Basic path passed with the console clean on a preview; before enabling Deep Analysis, force it once and watch for CSP violations, since its escalated script loads only then.
- If the challenge script fails to load (an ad blocker, a CDN blip), the browser's patched `fetch` can wait on it indefinitely. The client bounds time to response headers at 20 s (`lib/chat/transport.ts`) and then shows the generic error notice, so the symptom is a 20 s wait followed by "Something went wrong reaching the assistant", not a spinner.
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

1. Spend or request rate is climbing and it is not visitors: set `CHAT_DISABLED=1` on production and redeploy. Nothing user-facing breaks; the notice explains and gives the email.
2. Check the Firewall overview for the source (rule hits, top IPs, JA4). Lower the rule's limit or add a deny rule for the JA4 if it is one client.
3. If automation is getting past BotID Basic, turn on Deep Analysis (above).
4. Re-enable once the pattern stops. Write down what happened in the MTC-34 ticket.

## Updating the knowledge base, running evals

See `lib/knowledge/knowledge.test.ts` for the guards, `scripts/knowledge-check.ts` for the report, and MTC-32 for the eval suite once it exists. `bun run knowledge:check` prints the index and every dropped document.
