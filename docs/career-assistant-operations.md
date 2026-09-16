# Matt's Career Assistant: operations

How the chat feature is protected, what it costs to abuse, and what to do when something goes wrong. Everything here is metadata-level: the route never records a visitor's words, and neither does anything below.

## The layers (MTC-34)

| Layer            | Where                                                                                                                                                                          | State                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Kill switch      | `CHAT_DISABLED=1` env var on Vercel, read before the body                                                                                                                      | Set on production since 2026-09-15; unset on preview and development |
| BotID Basic      | `instrumentation-client.ts` (client), `withBotId` in `next.config.ts` (rewrites), `checkBotId` in `app/api/chat/route.ts` (server)                                             | In code; free on every plan                                          |
| WAF rate limit   | Vercel dashboard, Firewall, one rule (Hobby allows one)                                                                                                                        | **Not yet created**; spec below                                      |
| Per-request caps | `lib/chat/validate.ts` and `lib/knowledge` budgets: 8 turns, 1,500-character questions, 26k input tokens, 3 documents / 20k tokens read, 1,000 output tokens per step, 4 steps | In code since MTC-31                                                 |
| GCP budget       | Billing budget on project `matttrifilo-com`, $50 a month                                                                                                                       | Set 2026-09-14 (MTC-30)                                              |
| Vertex quota cap | GCP console, IAM & Admin, Quotas, `aiplatform.googleapis.com`                                                                                                                  | **Not yet applied**; see below                                       |

## Kill switch

Setting `CHAT_DISABLED=1` on an environment makes every request to `/api/chat` answer 503 with the `disabled` envelope before the body is read or BotID is consulted. The UI shows the route's sentence and the email address.

```
vercel env add CHAT_DISABLED production   # value: 1
vercel env rm  CHAT_DISABLED production   # to re-enable
```

Vercel bakes environment variables into a deployment, so redeploy production after changing it (a dashboard redeploy of the current deployment is enough).

## BotID

- Every POST to `/api/chat` from a page carries BotID's classification header; the route calls `checkBotId()` and refuses `isBot` (including verified crawlers) with 403 and the `blocked` envelope. The log line is `{ rejected: 'blocked', verifiedBot }`.
- A `curl` to `/api/chat` on a Vercel deployment (preview or production) gets the 403, because it never ran the challenge. In local development BotID always returns human and the route logs `{ botIdBypassed: true }` once per request.
- The challenge script and its calls go through same-origin rewrites, so the site's CSP (`script-src 'self'`, `connect-src 'self'`) needs no new host.
- Upgrade path: enable Deep Analysis in the dashboard (Firewall, Rules) and pass `advancedOptions: { checkLevel: 'deepAnalysis' }` to `checkBotId` in the route. It costs $1 per 1,000 checks on Pro. Do it when the logs show `blocked` staying low while request volume or token spend climbs.

## WAF rate-limit rule (to create)

Hobby allows one rate-limit rule per project and three custom rules in total. The rule to create in the dashboard (Project, Firewall, Configure, New Rule):

| Field  | Value                                                    | Why                                                                                                                                      |
| ------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Name   | `chat: 20 requests a minute per client`                  |                                                                                                                                          |
| If     | Request path equals `/api/chat` and method equals `POST` | Only the endpoint that spends money                                                                                                      |
| Then   | Rate Limit, Fixed Window                                 | The only algorithm on Hobby                                                                                                              |
| Window | 60 s                                                     |                                                                                                                                          |
| Limit  | 20                                                       | A conversation is at most 8 questions; a regenerate or a retry after a stall doubles it; 20 leaves room for a person and none for a loop |
| Keys   | IP and JA4 digest                                        | Both included on Hobby; JA4 catches one client behind many residential IPs, which is the attack the ticket cites                         |
| Action | Default (429)                                            | The UI turns a bare 429 into the rate-limit notice with the résumé, project and email links                                              |

Counters are per region, so a distributed caller can exceed the limit somewhat; the per-request caps and the budget bound what that costs. After publishing, watch Firewall, overview, grouped by the rule, for a week; if real visitors trip it, raise the limit before lowering anything else.

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
