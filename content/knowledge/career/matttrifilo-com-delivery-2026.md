---
id: matttrifilo-com-delivery-2026
title: What Matt delivered on matttrifilo.com in 2026
summary: The 2026 delivery record of matttrifilo.com: the Career Assistant launch, its eval, test and change-failure figures, eval cost choices, and what was not built.
tags: [ai, delivery, quality, evals, incidents, cost]
updated: 2026-10-03
---

# What Matt delivered on matttrifilo.com in 2026

In 2026 Matt shipped Matt's Career Assistant on matttrifilo.com, built
with AI coding agents under his direction, from research spike to launch
in about three weeks; the document "How Matt built the Career Assistant
on his site" gives the dates and how the assistant works (its model, the
documents it reads, its protection layers and its eval suites), and none
of that is repeated here. The launch pull request is #128. This document
gives the quality record that goes with that pace, all of it public:
eval records, a test suite built from none, claims corrected against
Matt's own account, and the change failures with their causes and
restore times. Numbers in parentheses are pull requests in his public
repository, https://github.com/mtrifilo/matttrifilo.com.

## Quality evidence a reader can open

- **Eval records.** The eval records published in the repository from
  September 28 to October 3, 2026 passed between 95 and 98 percent of
  their tests, while the suite grew from 171 tests to 188. The
  publishing step refuses a run that passes under 95 percent of its
  tests or under 90 percent of any one suite (#42), so that range
  describes the runs that cleared the bar, not every run made. The
  refusal and prompt-injection suites passed every test in every
  published record. Each record states how many tests passed out of how
  many in each suite, so the failure count is published with the passes,
  at matttrifilo.com/ask/evals.
- **Tests.** The repository had no tests until the first pull request of
  the year added CI and its first test files on September 13 (#11). On
  the launch pull request, October 3, Bun reported 1,953 passing tests
  (#128). Along the way came accessibility checks with axe and Lighthouse
  in CI (#81) and browser checks in Chromium and WebKit at phone and
  desktop widths (#80).
- **Claims held to Matt's own account.** When an answer or a document
  credited him with more than he did, the corpus was corrected to his
  account: OpenAI's Symphony harness is something he adapted, not built
  (#46, #55), and a 2019 decomposition project is one he contributed to,
  not led (#64).
- **Green at merge.** Of the 121 pull requests merged in 2026, 117 had a
  passing CI run on their final commit when they merged. The four that
  did not are three Dependabot dependency updates (#104, #107, #108),
  described below, and one (#114) whose only failure was the break one of
  those updates had already put on main.
- **Review.** 115 of Matt's 116 pull requests carry an
  adversarial-review section: fresh AI reviewer agents attack the change
  before its pull request opens, and the section records what they found
  and what was fixed. The other five of the 121 are Dependabot's. The
  one without that section is a one-line change to the résumé's index
  summary (#37), which records a privacy review in its verification
  instead. The production hotfix below (#29) has the section, which
  records that Matt directed it be opened without review; its review was
  posted as a comment after the merge. The fixes those reviews prompted
  landed as 179 separate commits titled as review fixes. GitHub itself
  records no formal pull-request reviews: the review is those AI
  reviewer agents plus Matt's own decisions, which the pull request
  descriptions quote with their dates.

## Change failure and the October 2 restore

Of the 120 pull requests merged into main in 2026 (one more, #85, merged
into a feature branch), three broke main's build and tests with a real
defect, 2.5 percent, in two incidents. All three were Dependabot
dependency updates merged while their own CI was failing, in batches
with other pull requests, and main had no branch protection to stop
them. A third incident, the production hotfix below, is not in that
count: its cause (#22) passed CI and reached production. Times are UTC.

- **October 2, 03:51.** A grouped dependency update (#104) changed the
  CSS optimizer's output, and a stylesheet test failed. The fix (#116)
  had main green again 12 hours 16 minutes after the break.
- **October 2, 16:06.** ESLint 10 (#108) and TypeScript 7 (#107) merged
  together, although an evaluation the day before had deferred TypeScript
  7. Lint crashed, type checking failed, and tests failed. The restore
  (#126) reverted the TypeScript 7 merge exactly and carried an ESLint 10
  configuration already reviewed in another pull request, with its
  verification tabled in the description. It named the open risk and
  left the decision to Matt rather than hiding it: nothing stops
  Dependabot from proposing TypeScript 7 again. Main was green again 2
  hours after the break.
- **Production hotfix, September 16.** The chat interface reached
  production while the assistant was switched off there, so the live
  site showed an assistant that refused every question. The fix (#29)
  quotes Matt's instruction, "Hide this from Production immediately,"
  and merged the same day.

## Cost discipline in the eval loop

Two dated decisions traded how often the eval suites run for what they
cost, each with its reason recorded:

- On September 21, 2026, Matt took the eval suites off every pull
  request and made them a local command, to save on model tokens (#34).
- On October 2, 2026, because Vertex AI spend had grown too expensive, he
  budgeted live runs at a few a month, scheduled by him. A change merges
  on its deterministic tests, and the next scheduled run covers it
  (#127).

Both decisions, and the first two items below, are in the repository's
decision log, docs/decisions.md (#119, #131).

## What was not built

- **Nothing a visitor writes is stored.** On September 16, 2026, Matt
  closed the option to log anonymized visitor questions as no. The
  assistant is stateless, and its answers improve through Matt's
  judgment and hand-written eval questions instead.
- **Production stayed off until the launch checklist was done.** The
  kill switch was on in production from September 15, 2026 until the
  launch, so the assistant went live when its launch checklist was
  complete, not when the interface existed.
- **The knowledge pages and source chips were removed** (#27, September
  16, 2026). The public page for each corpus document went, and the
  chips that linked to those pages went with them; the list of documents
  the assistant read, shown above each answer, became the record of what
  it used.
- **The chat was not code-split.** Matt took other Lighthouse
  opportunities for the assistant's page on a phone on September 30,
  2026, but not the unused-JavaScript split (#92). The pull request
  records the choice, not the reason.
