# matttrifilo.com

The source of [matttrifilo.com](https://matttrifilo.com), Matt Trifilo's personal site: a blog, his résumé, a curated list of open-source projects, recommended books, a contact page, and Matt's Career Assistant, an AI assistant that answers questions about his published work.

The repository is public, so a push publishes. That includes this file.

Contributor and agent rules are in [`CLAUDE.md`](CLAUDE.md). Anything about the Career Assistant is covered by [`.claude/skills/career-assistant-context/SKILL.md`](.claude/skills/career-assistant-context/SKILL.md) and the runbook, [`docs/career-assistant-operations.md`](docs/career-assistant-operations.md). This README points at them rather than repeating them.

## Stack

- Next.js 16 (app router), React 19, TypeScript
- Tailwind CSS 4, with shadcn/ui components on Radix (`components.json`)
- Bun for installs, scripts and tests (CI pins Bun 1.3.3)
- Vercel for hosting, deploys and analytics
- The Career Assistant: the AI SDK (`ai`) with Gemini on Google Vertex AI (`@ai-sdk/google-vertex`); its eval suites run on promptfoo

## Run it locally

```sh
bun install
bun run dev
```

`bun run dev` starts the Next.js development server. Agents working in this repository do not run `dev`, `build` or `start`; see `CLAUDE.md`.

Before a push, run the same checks CI runs:

```sh
bun run typecheck
bun run lint
bun test
TZ=America/Phoenix bun test
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, `bun test` with `TZ=America/Phoenix` (so a date that shifts outside UTC fails; see `lib/format-date.ts`) and `bun run build` on every pull request and every push to `main`. A second workflow, `.github/workflows/accessibility.yml`, builds the site with the assistant on and runs axe-core and Lighthouse against it.

After any change under `content/knowledge` or `lib/knowledge`, also run `bun run knowledge:check`.

## Write a blog post

```sh
bun run new-post
```

That runs `scripts/new-blog-post.ts`. It asks for a title, optional comma-separated categories and an optional description, then writes two files with the same body:

- `content/blog/<date>-<slug>.md`, the post. The file name is the URL: `/blog/<date>-<slug>`.
- `content/knowledge/blog/<date>-<slug>.md`, its knowledge twin, which the Career Assistant reads. `bun test` fails when a post has no twin or when the two bodies differ, so edit both.

`<date>` is today's date in your machine's local time zone, so a post started in the evening in a US time zone carries that day's date, not tomorrow's.

### The post's frontmatter

Read by `lib/blog.ts`, which accepts these keys and no others: any other key, such as a misspelled `descripton` or a `draft` flag, fails the build with the file name and the key. A YAML error or a field that breaks its rule below also fails the build with the file name. The type is `lib/types/blog.ts`.

| Field         | Rule                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | Required, text that is not blank.                                                                                                                                                                                          |
| `date`        | A plain `YYYY-MM-DD` that is a real calendar date, with no time or offset; anything else fails the build.                                                                                                                  |
| `categories`  | Optional list of text values that are not blank; quote one YAML would read as something other than text (a number, a boolean or a date), such as `'2026'`.                                                                 |
| `description` | Optional; when present, text that is not blank.                                                                                                                                                                            |
| `updated`     | Optional, with the same rule as `date`, and on or after it. Set it when the post's content changes: it becomes the post's sitemap lastmod, its structured data `dateModified` and its `og:modifiedTime`. No page shows it. |

### The twin's frontmatter

Read by `lib/knowledge/build.ts`, which accepts these keys and no others.

| Field       | Rule                                                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | Required; must match the file name.                                                                                                                                                                               |
| `title`     | Required.                                                                                                                                                                                                         |
| `summary`   | Required; at most 160 characters. The script drafts it from the description or the title: rewrite it to say what a reader would learn, since it is what the assistant reads before deciding to open the post.     |
| `tags`      | Required, an inline list such as `[blog, engineering]`. The script writes `blog` plus the categories.                                                                                                             |
| `updated`   | Required, `YYYY-MM-DD`.                                                                                                                                                                                           |
| `canonical` | Required for a blog twin, and exactly `https://matttrifilo.com/blog/<date>-<slug>` (`bun test` checks it); the script writes it. Optional for other documents, where it must be an `https://matttrifilo.com` URL. |

A title or summary must be one line, with no em dash, no en dash used as a sentence dash (a range such as "2019 – 2025" is fine) and no middle dot (`·`) or look-alike. The script refuses these at its prompt.

### Headings and body

- The post's title is the page's only `<h1>`. Write `#` for top-level sections: `components/blog/mdx-content.tsx` renders every heading one level down.
- `##` headings are the section titles the assistant shows while it reads the post. Keep fewer than twelve, each under 120 characters (`lib/progress-caps.ts`), or `bun test` fails. `#` headings are not counted, so a post sectioned only with `#` shows no section titles while it is read.
- The twin is part of the corpus, so the corpus rules apply to the body: no em dash and no British spelling from the list in `lib/american-english.ts` (`lib/site-copy.test.ts`), and no prose line that starts with `TODO` or contains `TODO (Matt)`.
- Posts compile as MDX. Outside inline code or a fenced block, the body may not contain a bare `<` or `{`: wrap it in backticks, or write `&lt;` or `&#123;`. Close every code fence, indent a fence no more than three spaces, and do not open one on a list item or block quote line. `assertMdxSafe` in `lib/knowledge/build.ts` fails `bun test` otherwise.
- A long post can exceed the corpus's size guards (`KNOWLEDGE_DOCUMENT_TOKEN_CEILING` in `lib/knowledge/build.ts`, and the assistant's read budget). `bun run knowledge:check` prints each document's cost and the headroom left.

Because a post adds a document the assistant can answer from, it is a corpus change: follow [Updating the corpus](#updating-the-corpus) below, including the eval run before the pull request.

## Deploys

Vercel builds from Git with `bun install` and `bun run build` (`vercel.json`). A push to `main` deploys production; a push to any other branch gets a preview deployment, which sits behind Vercel's deployment protection. Environment variables live on the Vercel project and are baked into a deployment when it builds, so a change takes effect on the next deploy.

## The Career Assistant

Matt's Career Assistant lives at `/ask`, with a compact panel on the homepage. It is switched off in production until launch (see [The kill switch](#the-kill-switch)). It is written for a hiring manager or recruiter deciding whether to talk to Matt about a hands-on engineering-manager role. It answers from a curated corpus in `content/knowledge/`, names the documents it read, and speaks about Matt in the third person, never as Matt. Nothing a visitor writes is stored.

The chat route is `app/api/chat`, and `app/api/ask/health` is a Vertex health probe served only on previews and in local development; the pages are under `app/ask`; the code is under `lib/chat`, `lib/knowledge`, `lib/ai` and `components/assistant`; the evals are under `evals`. Read the skill and the runbook before changing any of it.

### Updating the corpus

Documents live at `content/knowledge/<topic>/<id>.md`, with the frontmatter in the twin table above. The runbook's "Updating the knowledge base" section has the rest.

- `bun run knowledge:check` prints the index the model reads and every dropped document, then runs the corpus guards.
- `scripts/knowledge-denylist-check.sh` checks the corpus against a private denylist kept outside the repository. Without that file it prints one line and exits 0, so its OK is not proof on a machine that lacks it.
- Career documents follow Matt's verbatim-first rubric: copied from his private drafts, with only sensitive material, employer IP and personal data about other people removed, and never with a verb or scope stronger than the draft's.
- The repository is public, so a corpus change gets a fresh-context privacy review before any push.
- A new document needs at least one `golden` eval test that only it can answer, and it can make existing goldens' expected reads stale: see the runbook's "Adding a golden when a corpus document is added" before running `bun run evals`.
- An em dash or a listed British spelling in the corpus fails `bun test` (the runbook's "Copy rules").

### Running the evals

Four promptfoo suites (`golden`, `refusals`, `injection`, `groundedness`) run the chat route's own handler in process against Vertex AI. They authenticate with your Application Default Credentials:

```sh
gcloud auth application-default login
GCP_PROJECT_ID=<project> VERTEX_PROJECT_ID=<project> bun run evals:smoke
GCP_PROJECT_ID=<project> VERTEX_PROJECT_ID=<project> bun run evals
```

- `GCP_PROJECT_ID` is the project the route calls; `VERTEX_PROJECT_ID` is the one promptfoo's own Vertex grader uses. Both are needed.
- `evals:smoke` runs a few tests from each suite while you iterate; `bun run evals` is the full run, due before a pull request that changes anything the answers depend on (the list is under "When they run" in the runbook). Paste the table it prints into the pull request.
- They run locally, never in CI on pull requests. `.github/workflows/evals.yml` runs only when dispatched by hand, and is not a required check.
- Results go to `evals/out/`, which is not committed. To publish a run, commit the change it covers first, then run `bun run evals:publish`, which writes `evals/results/<date>-<sha>.json` and refuses a run that does not meet its bar; commit that file in the same pull request. `/ask/evals` shows the newest record.

The runbook's "Eval suites" section has the traps (a `.env` from `vercel env pull` changes how the suites authenticate), the cost of a run and how to add a golden.

### The kill switch

`CHAT_DISABLED=1` on a Vercel environment makes `/api/chat` answer 503 and removes the assistant from the site: `/ask` returns 404 and the homepage panel and nav entry go. It takes effect on the next deploy. It was set on Production on 2026-09-15 and stays there until the launch checklist in Linear (MTC-35) is done; `vercel env ls production` is the source of truth. The commands are in the runbook's "Kill switch" section.

### Nothing to rotate

The deployment holds no Google service-account key. It presents its Vercel OIDC token to a Google workload identity pool and gets a short-lived token in exchange (`lib/ai/vertex.ts`). The hand-dispatched eval workflow does the same with GitHub's OIDC token; its one-time setup is the runbook's "GCP and GitHub setup for the evals". Local eval runs use your own Application Default Credentials. The one optional token the site reads is `GITHUB_TOKEN`, used by `lib/github.ts` and `lib/chat/github-activity.ts` to lift GitHub's anonymous rate limit; it is not a Google credential.

## Where the work is tracked

Linear, team MTC, in two projects: "Ask Matt AI chat" for the Career Assistant, and the September 2026 site audit (Site Audit & Foundations) for the rest of the site. Every change has a ticket, and commit subjects and pull request titles carry its ID in parentheses at the end, for example `(MTC-19)`.
