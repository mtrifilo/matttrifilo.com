import { initBotId } from 'botid/client/core'

/**
 * Vercel BotID, client half (MTC-34).
 *
 * Every POST to the chat route carries a BotID classification header that
 * the route checks before it reads the body. The script that produces it is
 * served through same-origin rewrites (`withBotId` in next.config.ts), so
 * the site's CSP needs no new host and an ad blocker cannot strip it.
 *
 * Only the chat route is listed: it is the one endpoint that spends money
 * per request. The health route is preview-only and already gated.
 */
initBotId({
  protect: [{ path: '/api/chat', method: 'POST' }],
})
