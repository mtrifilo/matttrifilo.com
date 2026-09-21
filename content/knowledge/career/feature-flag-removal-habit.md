---
id: feature-flag-removal-habit
title: The feature-flag removal habit, 2020 to 2024
summary: Nearly forty changes over four years removing feature flags and dead code, at roughly three lines deleted for every one added.
tags: [technical-debt, feature-flags, cleanup, maintenance, craft]
updated: 2026-09-21
---

# The feature-flag removal habit, 2020 to 2024

## The pattern, not the event

There was a named cleanup epic in the winter of 2021 to 2022, a sprint of
flag removals and dead-code deletion that ran from December to March, but
the underlying habit is bigger than that one event. Nearly every ticket in
this record is a "remove feature flag" task, filed as a follow-up once a
fix or feature's flag had run stably at full rollout.

**39 ticket-linked pull requests** between June 2020 and December 2024,
adding about 820 lines and removing about 2,460: **net code removal by
roughly three to one**. Seventy-two tracked tickets, across the monolith
(35), the web app (3), and its backend-for-frontend (1). Matt was a
Software Engineer III, becoming player-coach in July 2022 partway through.

Two bursts stand out: eight flag-removal changes in the first two weeks of
January 2022, closing out defects from the initial builder rollout, and
nine changes explicitly labelled as hackathon work merged in a single week
in May 2022, cleaning up flags from the tag-applying-link and
campaign-merge-field features.

## The mechanism

The mechanism is unglamorous and consistent across all 39: find a shipped,
stable feature or fix behind a flag; remove the flag and its dead branches;
and **file the matching removal ticket at fix time** so the cleanup does
not get lost. That last part is the whole habit. One removal cleared debug
logging left over from a signature defect fixed nearly two years earlier.
The largest single removal in the set took out 205 lines.

The most recent changes, in December 2024, removed flags for a 2019 defect
and a 2024 sender-authentication fix, which shows the habit persisted into
his manager period.

## What it is not

- It is not a single project, and it is not all Matt's work. At least two
  of the underlying features whose flags he removed were built by another
  engineer; his changes there are cleanup only.
- One change in the set is not a removal at all: a 374-line refactor of a
  contact-add modal for the new builder's send page.
- **No incident or defect-rate metric ties this habit to a measurable
  reliability outcome.** What would prove it is a count of stale-flag
  incidents before and after, or a flag-count-over-time chart, and neither
  exists.
- Whether this was a documented team policy or a personal habit is an open
  question Matt would have to answer.

## How he describes it

Matt has written:

> Our team built a lot of features behind feature flags, the right way to
> ship safely, but flags that never get removed become their own source of
> bugs and confusion. I made a habit of filing a flag-removal ticket the
> same day I shipped any flagged fix, then coming back to delete the flag
> and its dead code once it had run stably in production. Over about four
> years that habit produced nearly forty pull requests that, net, removed
> roughly three lines of code for every line added. It's not glamorous
> work, but a codebase where nobody removes old flags gets slower and
> riskier to change over time, and I'd rather pay that cost in small
> increments than let it become a rewrite.

## Why this matters

Every other document in this record describes a feature shipped behind a
flag. This is the one that describes the flags coming back out. The
three-to-one net deletion ratio across four years, sustained through three
different roles, is the evidence that the flag-and-clean-up loop he
describes is a practice rather than an intention.
