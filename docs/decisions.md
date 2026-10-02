# Durable decisions

The decisions about this site that are meant to last, one paragraph each: what was decided and when, why, where it lives in the code, and the Linear ticket (team MTC) that holds the discussion. Each decision is recorded in its ticket, in the description or a dated comment, or in the code comment this file cites. The tracker is private, but commit subjects and pull request titles carry the same ticket ID, so `git log --grep MTC-12` finds the changes behind a decision.

## The site

### The honeycomb background: treatment C, gutters

Decided 2026-09-12 (MTC-23), built in MTC-25. The honeycomb canvas is the site's one deliberate decorative element, and it stays. A design spike tried three treatments (the faint full-bleed field, a header band, and gutters) and recommended gutters, and Matt accepted it after a live preview. The spike's reason: the honeycomb stays visible on every page and at every scroll position, while the column being read stays calm. As built, on a viewport at least 56rem wide the field is drawn brighter and veiled to 8% behind the reading column, with a soft edge on each side. The 56rem breakpoint came out of MTC-25's review, replacing the 48rem the ticket first specified: below it there is no real gutter beside the 48rem column, so the field stays full-bleed at its original, fainter alpha. The mask is the "Honeycomb treatment C" block in `app/globals.css`; the breakpoint (`VEIL_QUERY`) and the two brightness ranges (`BRIGHTNESS`) are in `components/background/hex-renderer.ts`, and `components/background/HexBackground.tsx` switches between them.

### One title string and a one-line bio

Decided 2026-09-12 (MTC-24). The role is named with one string, "Engineering Leader & Agentic Engineer", everywhere it appears: the homepage, the default page title, the Person schema's `jobTitle` and the social card. The homepage keeps its one-line bio. Both are constants in `lib/seo/identity.ts` (`JOB_TITLE`, `TAGLINE`); `JOB_TITLE` feeds the homepage, the default title, the Person schema, the social card and the résumé page's description. Three places name the role in their own words rather than reading the constant: the site's default description in `app/layout.tsx`, the headline of `content/resume.md`, and a line in the corpus document `content/knowledge/career/engineering-philosophy.md`.

### The Content Security Policy keeps `'unsafe-inline'`

Re-confirmed by Matt on 2026-10-01 (MTC-12). `script-src` keeps `'unsafe-inline'` because the pages are prerendered: Next inlines its bootstrap and flight-data scripts in every page, and next-themes inlines the script that sets the theme before first paint. A prerendered page cannot carry a per-request nonce, and those scripts differ by page and by build, so hashes do not fit either. Removing it would take a `proxy.ts` that mints a nonce per request, and every page would then render per request instead of being served prerendered. With `'unsafe-inline'` kept, untrusted input still has no path to run as script: a visitor's question renders as React text, and the model's Markdown goes through Streamdown's sanitizer. The same change (MTC-12, 2026-09-30) set `object-src 'none'` and chose, among three options, to send `upgrade-insecure-requests` only where `VERCEL` is set, because on a page served over plain http (a local `next start` opened in Safari, say) that directive leaves Safari loading none of the page's scripts, styles or images. The policy and the comment that explains it are in `next.config.ts`; `lib/next-config.test.ts` pins its shape.

### The canonical host is the apex domain (pending)

Recorded 2026-09-12 in MTC-13, which is in Backlog. `https://matttrifilo.com` is the intended canonical host, because MTC-13 found the site also answering on `www.matttrifilo.com` and on its `vercel.app` alias, each an indexable copy. In code it is `metadataBase` in `app/layout.tsx`, and the same URL is written out in `app/sitemap.ts`, `app/robots.ts`, `app/blog/[slug]/page.tsx`, `lib/seo/rss-feed.ts` (`SITE_URL`), `lib/seo/jsonld.ts` and `scripts/new-blog-post.ts` (`SITE_URL`); `CANONICAL_HOST` in `lib/knowledge/build.ts` accepts the apex or `www.` for a corpus document's `canonical`, and `components/blog/mdx-content.tsx` treats a link to either as on-site. Blog posts, `/ask`, `/ask/evals`, `/open-source` and `/resume` declare a canonical URL; the homepage, `/blog`, `/books` and `/contact` do not yet. Still to do in MTC-13: redirecting `www` and the `vercel.app` alias to the apex, a canonical URL on every page, and pointing the GitHub repository's homepage at the apex.

### Markdown headings render one level down

Decided 2026-09-13 (MTC-4). A post's title is the page's only `<h1>`, so `components/blog/mdx-content.tsx`, which renders blog posts and the résumé, renders every Markdown heading one level down: `#` as `<h2>`, `##` as `<h3>`, and so on, with `#####` and `######` both landing on `<h6>`. A post had rendered fourteen `<h1>` elements, which flattens a screen reader's heading navigation. Doing it in the component rather than rewriting posts to start at `##` means authors keep writing `#` for top-level sections and every future post gets the same outline.

### Blog dates are the dates the author wrote

Decided 2026-09-13 (MTC-1). A frontmatter date such as `2026-03-01` parses as UTC midnight, so formatting it in a time zone west of UTC showed the day before. `formatDate` in `lib/format-date.ts` formats in UTC, so the page shows the calendar date in the file. CI runs `bun test` with `TZ=America/Phoenix` (`.github/workflows/ci.yml`) so a date that shifts outside UTC fails there, not only on a machine west of UTC. `parseFrontmatterDate` in `lib/blog.ts` (MTC-16) reads the date from the raw frontmatter line and fails the build on anything that is not a plain, real `YYYY-MM-DD`.

### The Turbopack build cache is off

Decided 2026-09-22 (MTC-62). `experimental.turbopackFileSystemCacheForBuild` is `false` in `next.config.ts`, for every `next build`. Vercel gives a branch's first build the last production deployment's cache, and with Turbopack's persistent cache on, a preview served the main branch's stylesheet under the branch's JavaScript. The cache buys little here: measured the same day, CI's cold build took 22 seconds and a cache-free Vercel build one minute including install. Turning it off only for previews was rejected, because a stale production build is the same defect. `lib/next-config.test.ts` fails if a Next upgrade stops recognizing the option, and the runbook's "The Turbopack build cache" section in `docs/career-assistant-operations.md` has the diagnosis and how to rebuild a preview without the cache.

## The Career Assistant

These are stated in full in [`CLAUDE.md`](../CLAUDE.md), [`.claude/skills/career-assistant-context/SKILL.md`](../.claude/skills/career-assistant-context/SKILL.md) and the runbook, [`docs/career-assistant-operations.md`](career-assistant-operations.md). The paragraphs below are the rules that reach beyond the assistant and point at those files rather than restating them; the assistant's own product rules (its persona, what it leads with, how the corpus is written) are in the skill.

### The evals run locally, never in CI on pull requests

Decided by Matt 2026-09-21 (MTC-35). A full run on every pull request cost more in tokens than it caught, and a one-in-a-hundred model flake reddened most runs. The suites are a local command, run before a pull request that changes anything the answers depend on; `.github/workflows/evals.yml` runs only when dispatched by hand and is not a required check. The runbook's "When they run" lists the paths that make a run due.

### Nothing a visitor writes is stored

Decided by Matt 2026-09-13 and reaffirmed 2026-09-16 (MTC-35). The assistant is stateless: on 2026-09-16 the launch checklist's option to log anonymized questions was closed as no, and improvements to the answers come from Matt's judgment and the hand-written eval goldens instead. The rule is stated in the skill, the README and the runbook's introduction; `app/ask/page.tsx` notes that the page has nothing for the server to render because a conversation is never stored.

### No em dashes, and American English, anywhere a visitor or the model reads

Decided by Matt 2026-09-23 (MTC-78) and 2026-09-28 (MTC-94; he is US based). Copy, the corpus and the prompt use a comma, a colon or a period in place of an em dash; the same text and the eval rubrics use no British spelling from the list in `lib/american-english.ts`, which is Matt's to extend. `lib/site-copy.test.ts` fails `bun test` on either in the source it scans, which leaves out `content/blog/`, Matt's own writing and his to police; `lib/dashes.ts` defines what counts as a dash; `assertNoEmDash` (`evals/assertions.ts`, attached to every eval test in `evals/promptfooconfig.yaml`) checks the assistant's answers. The runbook's "Copy rules" has the full scope.

### The kill switch, and production stays off until launch

MTC-35. `CHAT_DISABLED=1` on a Vercel environment makes `/api/chat` answer 503 and removes the assistant from the site, from the next deploy (`lib/chat/kill-switch.ts`). It was set on Production on 2026-09-15 (the runbook's table of layers) and became a standing rule on 2026-09-16: it stays until the launch checklist in MTC-35 is done, so the assistant goes live when that checklist is complete rather than when the interface exists. `vercel env ls production` is the source of truth for its current state; the runbook's "Kill switch" section has the commands.
