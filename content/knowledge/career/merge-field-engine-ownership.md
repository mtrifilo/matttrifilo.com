---
id: merge-field-engine-ownership
title: Six years of owning the merge-field engine, 2019 to 2025
summary: Six years owning the monolith's Liquid merge-field implementation, the ticket stream that made Matt the engineer other teams still tag.
tags: [liquid, templating, java, ownership, defects, email]
updated: 2026-09-21
---

# Six years of owning the merge-field engine, 2019 to 2025

The merge decomposition is the extracted service. This is the monolith's
Liquid implementation that kept running in parallel, and the six-year
ticket stream that made Matt the person other engineers still tag with
merge questions.

## The shape of it

This is not one defect or one project. The monolith kept its own legacy
Liquid merge-field implementation, the fields customers type into a
template, running alongside the extracted service, and it kept generating a
steady stream of customer defects and one-off feature requests that landed
on Matt year after year, regardless of what team or role he was in.

**70 ticket-linked pull requests** from October 2019 to December 2025,
adding about 17,000 lines and removing about 3,150, across six
repositories, with the monolith accounting for 65 of them. Sixty-nine
distinct tickets; **Matt was the assignee on 66 of them**. Ticket types are
mostly customer-reported defects and planned engineering stories. The
cadence per year: one in 2019, eleven in 2020, four in 2021, eight in 2022,
six in 2023, seventeen in 2024, twenty-three in 2025. Every year in the
span has activity, and the two busiest years are exactly where the
address-merging and new-context work concentrated, which is also when the
work shifted from bug-fixing to feature-parity ownership.

The epic that finally tried to name the pattern, opened in 2024 by the
team's product manager, reads: "Fix outstanding defects and improve merge
service to avoid additional defects related to merge fields."

A representative defect, open nearly three years: emails in one account
sometimes carried the wrong first name, and nobody could duplicate it. The
contact's name had not been changed after the message sent. It took three
instrumentation pull requests just to characterise the bug. That is why
this work kept landing on Matt: not reproducible on demand, and it requires
understanding how a cached contact object flows through the merge pipeline.

## By theme

**Custom field types merging incorrectly.** Type-specific fields kept
merging through code paths that did not match the type's semantics.

- *Currency.* Dynamic content used a different data model than the merge
  button and truncated values. Matt's first fix converted dynamic content to
  the legacy model, which broke other filters, so he **reverted it** and
  instead fixed the formatting at its source two years later, matching the
  extracted service's own currency logic.
- *Drill-down fields.* Four changes: the base merge, a database lookup and
  null-handling bug found afterwards, invalid option identifiers, and then
  extracting the path into its own method as technical debt.
- *Day-of-week, yes-or-no, and text-area line breaks.* The same bug shape
  three times: a raw stored value rendered instead of its human-readable
  form. The text-area fix ported logic from an existing formatter class so
  old and new builders stayed consistent.
- *A drill-down field with no category*, whose null label broke the parser
  and failed the whole send.

**Locale and format handling.** Birthday and anniversary fields merging in
US format for UK-locale accounts, fixed across three repositories in three
days by adding a localised date filter to the shared short filter and
wiring it in. The same symptom recurred in the new builder years later as a
full timestamp where a date was expected. A date-and-time field merging as
date-only at exactly midnight. A company-country field emitting the postal
code instead.

**To-address and from-address merging, the newest and highest-stakes
theme.** Here merge fields moved from rendering into send validation and
delivery routing.

- *To-address.* Liquid support added to broadcast recipient validation,
  previously literal-only. It immediately surfaced a defect where multiple
  recipients each received one recipient's merged address, because the sent
  object was not cloned before the per-recipient merge. Fixed the same week.
- *From-address.* Backend Liquid support added for parity with the
  sunsetting legacy builder, which cascaded into a case that worked from a
  debugger but not the front end, then two hardening tickets, the second of
  which enforced a single resolved sending address after the merge, the
  same failure class as the to-address clone bug.
- *Sender display names.* A comma in a sender's name broke sends entirely,
  fixed across three changes including a same-day patch.
- *Reply-to caching.* A stale object reference.

**New merge contexts and fields, built from scratch.** Affiliate context
mirroring the extracted service's, later extended with a site identifier;
company name, added for parity and to unblock the legacy builder's sunset;
an expanded user-field set in late 2025, the largest single feature push,
going from first name, last name, and email to a second email, website, job
title, company name, and five social fields; contact context added to
test-send paths; legacy campaign merge fields ported into the new builder;
and a referral code added after it silently failed to populate.

Each of these existed so the product could ship builder parity without
waiting on the full decomposition, and each had to match the extracted
service's syntax so the two paths would not diverge.

## The recurring trade-offs

| Recurring trade-off | What he chose | Why |
|---|---|---|
| Fix at the call site, or in the shared merge model | Reverted the call-site fix after it broke other filters; fixed the shared formatting logic | A call-site patch risks every other filter on that path |
| Patch in place, or extract a reusable method | Extracted drill-down handling and custom-field formatting into their own method and service | Both had needed multiple follow-on fixes inside one monolithic method |
| Locale formatting in the filter, or in the client layer | Inside the shared short filter | Legacy and new builders call the same filter, so it had to live there once |
| New contexts as extracted-service features, or monolith-only parity shims | Built directly in the monolith's legacy domain | The product needed parity before the decomposition was ready, and the syntax had to match so the paths would not diverge |
| Validate an address merge field as literal text, or as evaluable Liquid | Evaluable | A direct product requirement, and the honest cost: it produced the set's two highest-severity bugs |

Fourteen feature-flag-removal tickets in this set show that every fix
shipped behind a flag was cleaned up once verified.

## What it proves

Nobody assigned this as a project. It accreted across three roles, from
Software Engineer III through player-coach to manager, and across two
employers. When the extracted service itself had an equivalent parity bug
in 2026, silently dropping user-linked contacts from a bulk merge, Matt was
the one who traced it to a filter in the monolith's REST layer and fixed it
with a new query parameter, on the other side of the boundary he had spent
years working the first side of.

## Caveats

- No adoption or incident-avoidance data exists. There is no customer-impact
  figure before any fix, no support load generated, and no proof that the
  three-year defect did not recur after its fix.
- Reviewers, a consistent small group of monolith engineers, read every one
  of these changes. They reviewed this work; they did not do it.
- Whether the multi-year gap on the hardest defect was genuine
  unreproducibility or deprioritisation is an open question.
- No part of the legacy engine has been decommissioned. The monolith's path
  and the extracted service still run in parallel, and retiring the legacy
  path is what the V2 decomposition intends.

## Why this thread matters

"Merge subject-matter expert" is a reputation claim. This is the receipt.
