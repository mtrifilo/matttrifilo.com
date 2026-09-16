import { checkBotId } from 'botid/server'
import { boundVerdict } from '@/lib/chat/visitor'
import { geminiModel, getVertex } from '@/lib/ai/vertex'
import { createChatHandler } from '@/lib/chat/handler'
import { loadKnowledgeIndex, readKnowledgeDocument } from '@/lib/knowledge'

// Matt's Career Assistant (MTC-31). All of the behaviour is in
// lib/chat/handler.ts; this file only names the runtime and wires the three
// real dependencies, because a Next route module may export nothing but its
// handlers and its config.

// The Vertex client needs Node APIs (google-auth-library), and every answer is
// generated per request, so nothing here may be cached or statically rendered.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = createChatHandler({
  loadKnowledgeIndex,
  readKnowledgeDocument,
  // A client per request, so the retries its bounded fetch hides — and the
  // time it waited for each first byte — are counted into the log line of the
  // request that was billed for them (MTC-38).
  model: ({ onVertexRetry, onVertexFirstByte }) =>
    getVertex({ onRetry: onVertexRetry, onFirstByte: onVertexFirstByte })(
      geminiModel()
    ),
  // BotID Basic (MTC-34). The client half is instrumentation-client.ts; the
  // rewrites it needs are added by withBotId in next.config.ts. Basic is
  // the free tier; Deep Analysis is a dashboard switch plus
  // `advancedOptions: { checkLevel: 'deepAnalysis' }` here, when logs show
  // automation getting past Basic. checkBotId has no timeout of its own;
  // boundVerdict gives it one, and the handler fails closed on it.
  verifyVisitor: () => boundVerdict(checkBotId()),
})
