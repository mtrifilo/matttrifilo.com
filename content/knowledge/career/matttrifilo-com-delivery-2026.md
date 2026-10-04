---
id: matttrifilo-com-delivery-2026
title: What Matt delivered on matttrifilo.com in 2026
summary: The 2026 delivery record of matttrifilo.com: what shipped, the test, eval and change-failure figures beside it, eval cost decisions, and what was not built.
tags: [ai, delivery, quality, evals, incidents, cost]
updated: 2026-10-03
---

# What Matt delivered on matttrifilo.com in 2026

In 2026 Matt shipped Matt's Career Assistant on matttrifilo.com, from a
research spike on September 13 to a live launch on October 3, in about
three weeks, built with AI coding agents under his direction. This
document gives the quality record that goes with that pace, all of it
public: eval records that publish failures as well as passes, a test
suite built from none, and the change failures with their causes and
restore times. Numbers in parentheses are pull requests in his public
repository, https://github.com/mtrifilo/matttrifilo.com. How the
assistant works (its model, the documents it reads, its protection
layers and its eval suites) is in the document "How Matt built the
Career Assistant on his site" and is not repeated here.

## Quality evidence a reader can open

- **Eval records.** Every eval record published in the repository from
  September 28 to October 3, 2026 passed between 95 and 98 percent of its
  tests, while the suite grew from 171 tests to 188. The refusal and
  prompt-injection suites passed every test in every one of those
  records. Each record states how many tests passed out of how many, so
  the failures are published with the passes, at matttrifilo.com/ask/evals.
- **Tests.** The repository had no tests until the first pull request of
  the year added CI and its first test files on September 13 (#11). On
  the launch pull request, October 3, Bun reported 1,953 passing tests
  (#128). Along the way came accessibility checks with axe and Lighthouse
  in CI (#81) and browser checks in Chromium and WebKit at phone and
  desktop widths (#80).
- **Green at merge.** Of the 121 pull requests merged in 2026, 117 had a
  passing CI run on their final commit when they merged. The four that
  did not are three Dependabot dependency updates (#104, #107, #108),
  described below, and one (#114) whose only failure was the break one of
  those updates had already put on main.
- **Review.** 115 of Matt's 116 pull requests carry an adversarial-review
  section: fresh AI reviewer agents attack the change before its pull
  request opens, and the section records what they found and what was
  fixed. The other five of the 121 are Dependabot's. The exception is a
  one-line change to the résumé's index summary (#37), and the production hotfix below records
  that it merged before its review, at Matt's direction. The fixes those
  reviews prompted landed as 179 separate commits titled as review fixes.
  GitHub itself records no formal pull-request reviews: the review is
  those AI reviewer agents plus Matt's own decisions, which the pull
  request descriptions quote with their dates.

## Change failure and the October 2 restore

Of the 120 pull requests merged into main in 2026, three broke it with a
real defect, 2.5 percent, in two incidents. All three were Dependabot
dependency updates merged while their own CI was failing, in batches
with other pull requests, and main had no branch protection to stop
them. Times are UTC.

- **October 2, 03:51.** A grouped dependency update (#104) changed how
  the CSS optimizer writes one rule, and a stylesheet test failed. A pull
  request already open for the same group was repurposed to fix the test
  (#116), and main was green again 12 hours 16 minutes after the break.
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
  quotes Matt's instruction, "Hide this from Production immediately." It
  merged about six minutes after that instruction if the 08:17 the pull
  request gives for it is UTC minus seven; the pull request names no time
  zone.

## Cost discipline in the eval loop

Two dated decisions traded how often the eval suites run for what they
cost, each with its reason recorded:

- On September 21, 2026, Matt took the eval suites off every pull
  request and made them a local command, to save on model tokens (#34).
- On October 2, 2026, because Vertex AI spend had grown too expensive, he
  budgeted live runs at a few a month, scheduled by him. A change merges
  on its deterministic tests, and the next scheduled run covers it
  (#127).

Both decisions are in the repository's decision log, docs/decisions.md.

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
- **The chat was not code-split.** Of the Lighthouse opportunities for
  the assistant's page on a phone, Matt chose on September 30, 2026 not to
  take the unused-JavaScript split (#92). The pull request records the
  choice, not the reason.
