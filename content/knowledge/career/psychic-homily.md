---
id: psychic-homily
title: Psychic Homily, Matt's music site, and what he delivered on it in 2026
summary: What Psychic Homily (psychichomily.com) is, its stack and hosting, and what Matt delivered on it in 2026, citing pull requests and public CI records.
tags: [side-projects, psychic-homily, music, next.js, go, ai-agents, code-review]
updated: 2026-10-03
---

# Psychic Homily

Psychic Homily (psychichomily.com) is Matt's website to document and
amplify new music releases, shows, and cultural events from Arizona
musicians and beyond, which his résumé lists as a production site he
built solo in Next.js/React and Go.

Pull request numbers below (#N) refer to his public repository,
mtrifilo/psychic-homily-web on GitHub. Figures cover January 1 to
October 3, 2026, and months are the month a pull request merged, in UTC.

<!--
PLACEHOLDER for Matt's draft (MTC-114): what the site does for a visitor,
and its features. Nothing is written here until his draft lands. The build
strips this comment, so the model never reads it.
-->

<!--
PLACEHOLDER for Matt's draft (MTC-114): who the site is for, and why he
built it. Nothing is written here until his draft lands. The build strips
this comment, so the model never reads it.
-->

## Stack and hosting

- Front end: Next.js 16, React 19, TanStack Query, Tailwind CSS 4 and
  shadcn/ui.
- Back end: Go, with the Chi router, the Huma framework, GORM and
  PostgreSQL.
- Tests: Vitest for unit tests, Playwright for end-to-end tests, and
  Go's testing package for the back end.
- Hosting: the Next.js front end deploys on Vercel, and the Go back end
  on Railway, built from a Dockerfile. A stage environment deploys from
  the main branch; production deploys from a separate production branch.

## What Matt delivered in 2026

Between January 1 and October 3, 2026, 1,800 pull requests opened from
Matt's GitHub account were merged into the repository. He builds with AI
coding agents working under rules written into the repository's agent
skills (#526, #907). The figures that qualify that count, the decisions
not to build, the product itself and the agent workflow follow. Counts
and percentages come from the repository's public pull request and CI
records; a specific change is cited by its pull request number.

### Review and quality under the volume

- Merges of his pull requests peaked at 348 in May 2026 and fell to 138
  in September, while
  an adversarial review section in the pull request body went from none
  before May to 137 of September's 138 (99 percent). The two moved
  together; the record does not establish that one caused the other.
- 1,719 of the 1,800 pull request bodies (95.5 percent) carry at least
  one review or verification section: Test plan, Manual repro, Code
  review, Adversarial review, or Coverage gaps. In a recent body (#2173)
  the adversarial review section lists each round's reviewer lenses,
  verdicts, findings and the commit that fixed them.
- One revert in 1,800 merges: #1325, in June 2026, reverted #1321
  because live verification showed the change rested on a misreading of
  WFMU's broadcast schedule.
- The median time from opening a pull request to merging it is about 20
  minutes. That figure is merge latency, not delivery speed: in his
  agent workflow the work, its tests and its review happen on a branch
  before a pull request is opened.
- Pull request runs of the CI workflow passed 84.4 percent of the time
  in 2026 (2,284 of the 2,706 runs that passed or failed).
- Test counts grew from 8 TypeScript and JavaScript unit tests and 40 Go
  tests in January 2026 to 12,640 and 4,353 at the start of October.
  These are counted by searching the code for test declarations, not by
  running the suites.

### What he chose not to build, or removed

- Tag categories: two pull requests expanding tag categories from three
  to eight were closed unmerged in April 2026 (#307, #333). The closing
  comments say several of the proposed categories were
  speculative, with no prior art behind them, and that the five new ones
  were invented by the agent without design input and need explicit
  definitions first.
- Verified Attendee badge: removed in June 2026 (#1000), because
  attendance was a self-claimed, unverifiable checkbox that rendered an
  authoritative-looking badge.
- Legacy venue AI-extraction pipeline: stopped (#1193) and then removed
  (#1225) in June 2026, after a spike found it complete and scheduled
  but unused, with no configurations and no runs on stage. The /ingest
  agent skill had superseded it.
- Community "suggest a match" on radio playlists: removed in July 2026
  (#1661), because its table had zero rows in production and on stage.

### The product: from a Hugo site to a music knowledge graph

When 2026 began, the site was a static Hugo build hosted on Netlify,
documenting music releases and shows from Arizona; a Go back end and a
new front end had been started beside it in the same repository. In
2026 Matt rebuilt it as a Next.js and Go site:

- Release and festival services and their API routes (#20, #37, March
  2026).
- Contributor profiles (#41, March 2026).
- A similar-artist graph with an interactive view (#118, March 2026).
- Playlist providers for the KEXP, WFMU and NTS radio stations (#262,
  #265, #267, April 2026).
- The homepage tagline "Your music knowledge graph." (#1417, July 2026).
- Arizona-scoped wording retired from the blog and DJ-set pages at the
  start of August 2026, because the site was listing shows across
  multiple metro areas (#1763).

### The agent workflow

- Parallel agent sessions run in isolated git worktrees, dispatched by a
  skill (#526, May 2026). Each worktree gets a stack mode chosen for its
  change: no local stack, a shared one, or its own database and back end
  when the change needs them (#569, May 2026).
- That skill carries a written rule: "Agents never merge their own PRs.
  PR creation is the agent's last step; merging is the user's." (#526)
- Adversarial review before a pull request opens was wired into both
  agent workflows in May 2026 (#907). By September each review round ran
  as a panel of fresh sub-agents with lenses such as Saboteur,
  Future-Maintainer, Security and Completeness (#2173).
- A decision Matt makes as the owner during the work can be recorded in
  the pull request body, as in the Owner decisions section of #2173.

The workflow has costs on the record. Parallel sessions sometimes built
the same thing twice, and the later pull request was closed unmerged
(#862, #863, #909). Since April 2026 CI files a GitHub issue for each
failing commit on main (#432), where the full end-to-end suite runs after
merge, with a smoke suite on each pull request (#381); 224 of those
issues were still open on October 3, 2026.
