# matttrifilo.com

Matt Trifilo's site: Next.js 16 app router, React 19, Bun, Tailwind v4, deployed on Vercel. The repository is public: a push publishes.

## How to begin

1. Load the user-level `research-docs` skill if it is available. It explains how to find and use Matt's private research (`~/docs/research/INDEX.md`, outside this repository): who the audience is, what the market expects, and what to feature. That research is never copied into this public repository; cite it by path and date. **No access to it (another machine, another contributor)? Do not guess the audience. Ask Matt.** The reader and the featuring order are restated in the repository skill below.
2. Load this repository's `career-assistant-context` skill (`.claude/skills/career-assistant-context/SKILL.md`) before working on the Career Assistant. It holds the persona rules, the corpus rules, and the standing constraints. Everything under `app/ask`, `app/api/chat`, `lib/chat`, `lib/knowledge`, `content/knowledge`, `components/assistant`, and `evals` is covered by it.

## Commands

- `bun run typecheck`, `bun run lint`, `bun test`: run all three before any push. CI runs the same three with `TZ=America/Phoenix` (a timezone bug `formatDate` guards against) and then `bun run build`, which agents do not run locally; the Vercel preview is where a build problem shows.
- `bun run knowledge:check`: the corpus guards, after any change under `content/knowledge` or `lib/knowledge`.
- `scripts/knowledge-denylist-check.sh`: greps the corpus against a private denylist before any push that touches `content/knowledge`. It exits 0 without the denylist file, so its "OK" is not proof on a machine that lacks the file.
- `GCP_PROJECT_ID=<project> VERTEX_PROJECT_ID=<project> bun run evals:smoke` (and `bun run evals`): the eval suites, run locally with Application Default Credentials. When they must run, and their traps, are in `docs/career-assistant-operations.md` under "Eval suites". They do not run in CI on pull requests; the `workflow_dispatch` path has its own rules there.
- Never run `next dev`, `next build`, or `next start` from an agent; behaviour is proven by tests and the Vercel preview.

## Process

- Linear project "Ask Matt AI chat" (team MTC) is the source of truth for progress. Every piece of work has a ticket; decisions are recorded there as dated comments.
- Adversarial review before every pull request; fixes in their own commits; findings in the PR body. On Matt's machine a user-level hook refuses `gh pr create` without a review marker; the rule holds where the hook does not.
- Sub-agents run on Opus.
- Production is protected: `CHAT_DISABLED=1` was set on Vercel Production on 2026-09-15 and stays until MTC-35 is done; `vercel env ls production` is the source of truth. Do not change Vercel environment variables or deploy to production for chat work.

## Where things are

- `~/docs/research/hiring/hiring-audience-2026.md` (private, via the `research-docs` skill): who the assistant is for and what they screen for.
- `docs/career-assistant-operations.md`: layers, kill switch, evals, runbook.
- `content/knowledge/`: the corpus the assistant reads; `content/open-source.ts`: the curated repositories.
- `lib/chat/`: the route's handler, validation, prompt, tools; `lib/knowledge/`: the index and read budget.
- `evals/`: promptfoo suites and the assertions they import from the route's own code.
