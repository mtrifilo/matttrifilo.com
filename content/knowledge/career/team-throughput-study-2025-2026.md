---
id: team-throughput-study-2025-2026
title: What happened to team throughput as AI agents were adopted, 2025 to 2026
summary: The measured change in delivery, cycle time, review load, and defects across two years of agent adoption, with confounders attached.
tags: [ai, metrics, throughput, engineering-management, measurement]
updated: 2026-09-15
---

# What happened to team throughput as AI agents were adopted, 2025 to 2026

Matt built the measurement before he made the claim. In February 2026, the
same month the team received its first enterprise agent licences, he stood
up a metrics pipeline over the issue tracker and the code host so the
effect could be observed rather than asserted. This document is what it
found, and, just as importantly, what the study itself says about its own
limits.

**The framing he insists on:** this is a correlation story, not a
controlled experiment. Everything else that changed in the same window is
listed below and should be quoted with the numbers.

## Team delivery, code output, and review: the direction of travel

Delivered tickets carrying the team label moved up and down through 2025
without a trend, then rose in every quarter of 2026, the latest quarter
being the largest by a wide margin. Merged pull requests for the same five
engineers rose in every quarter of the two years and accelerated sharply
from 2026 Q2. Reviews given showed no trend across 2025 and then climbed
steeply through 2026. Median cycle time to production sat inside a seven-
to-ten-day band from 2025 Q1 through 2026 Q2 and then fell sharply in the
latest quarter, while average days to merge stayed inside a one-to-five-day
band and was at its shortest in that same quarter. The endpoints are in the
headline ratios below; the per-quarter detail is not published here.

## Headline ratios

| Measure | 2025 full year | 2026 through Sep 12 | Ratio |
|---|---:|---:|---:|
| Merged pull requests per week, five engineers | 10.3 | 28.2 | 2.7x |
| Median cycle time to production | 7.0 to 9.1 days | 2.3 days in Q3 | about 3 to 4x faster |

Over the same window, delivered tickets per week rose about 2.3x and
reviews given per quarter rose roughly 2.5 to 3.9x; the absolute rates
behind those two ratios are not published here. The pull-request gain
holds, smaller, when Matt's own output is excluded.

## Quality held while throughput rose

Customer-reported defects created fell steadily while output roughly
tripled, taking the open backlog from 28 to 12. Internally found defects
held steady quarter over quarter, which is what you want when review volume
is rising: the team is finding its own problems at the same rate across far
more code. Reverts stayed rare.

## Matt's own output

How much an engineering manager still ships is a fair question to ask him:
his median cycle time to production was **1.0 day
in the latest quarter, measured across 280 tickets**, and his merged pull
requests went from 16 a quarter to 339, because from June he was running
several agents in parallel on decomposition, deployment readiness, and
security work.

## The cost side, said out loud

Review load more than doubled, and the pooled median time to merge
lengthened rather than shrank. More code arrived, review kept up, and
merges got slightly *slower* rather than being rubber-stamped. Automated
adversarial review as a repository workflow, added in August, is the
mechanism for keeping that true as volume grows.

## What can and cannot be measured about usage

The only per-commit AI signal available is one tool's co-author trailer;
the other editor leaves no trace, so every usage figure is a **floor**, not
a count. Team commits carrying the trailer went from none in 2025 to a
substantial and rising share in 2026, with a dip in the latest quarter.
Across the whole organisation, adoption spread from a handful of engineers
to most of the organisation across 2026.

Matt's own trailer share understates his usage, because the
autonomous remediation and parts of the deployment work committed under
other paths. His interactive session activity peaks in May and then falls
as work shifted to autonomous runs, which is why he says prompts are not
the measure to quote.

## Confounders, in the order an interviewer would raise them

1. **Work mix changed.** Security and compliance tickets rose sharply, and
   the deployment programme generated many small tickets. Small tickets
   inflate counts and shrink cycle time. This is why the story leans on
   merged pull requests per person and on cycle time rather than ticket
   counts alone.
2. **Team composition changed** over the window, so the team totals are not
   like-for-like.
3. **Story-point practice changed.** Points coverage rose sharply across
   the window, and the large roll-up epics closed in 2026 are excluded from
   the points figures, so points are not like-for-like across the window.
   Points are the weakest signal of the set.
4. **The tracker project changed** mid-2026, and ticket-granularity
   conventions may differ between the two.
5. **Unassigned tickets are numerous** and sit in the team totals.
6. **Automation counts as human output.** Some agent-opened pull requests
   sit inside the human counts. Automated dependency bots are excluded by
   the author filter.
7. **Two different review measures exist**, one counting review events and
   one counting distinct pull requests reviewed. Quote one and say which.
8. **The latest quarter is 74 days**, not a full quarter; per-week rates are
   normalised, totals are not.
9. **Usage telemetry is partial**, as above.

## What Matt did, as distinct from what happened

He adopted first and in public, using the second editor daily from
mid-2025 and giving a lunch-and-learn on it. He ran the tool evaluations
honestly, including one that was rejected. He ran the organisation's agent
trial in December, secured the first enterprise licences for his group in
February, gave up his own seat on the other editor to pay for it, and asked
the group to mentor others. He built the metrics pipeline the same month.
Then he turned the workflow into shared assets: ticket-drafting skills, the
plugin marketplaces, the on-call plugin, adversarial review as a repository
workflow, and the autonomous security remediation with a human on every
merge. He taught it in three brown bags and the weekly demo series. And he
set the rule that agents write and humans review and test, modelling it by
carrying a large share of the review load alongside his own output, in
the quarter when the team's review volume peaked.

## Gaps the study names for itself

A 2025 incident baseline is not available; the defect and revert series are
the quality evidence instead. Usage telemetry for the second editor was
requested in January 2026 and never became a pipeline. And the obvious next
step, running the same queries for other teams that received licences later
as a natural comparison group, has not been done.
