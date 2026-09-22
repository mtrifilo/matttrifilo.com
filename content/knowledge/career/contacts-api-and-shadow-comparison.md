---
id: contacts-api-and-shadow-comparison
title: The Contacts API program and the shadow-comparison harness, 2019
summary: Matt's first end-to-end decomposition, verified field for field by a shadow-comparison harness before any customer saw the new path.
tags: [decomposition, api, verification, mobile, java, platform]
updated: 2026-09-21
---

# The Contacts API program and the shadow-comparison harness, 2019

The first decomposition Matt worked end to end, two years before the merge
service. Contacts lived entirely inside the core monolith and were read
through two different legacy paths: a servlet API used by the web front end
and a front-facing controller used by the mobile app. A newer internal
Contacts API had been partly built the year before but was not
production-ready, and nobody had proven it matched the legacy behaviour
field for field.

The trigger was a decision to make it real. Two tickets opened the same day
in March 2019: one to review unit, integration, and end-to-end coverage and
write the stories needed to bring testing up to standard, and one to
determine production readiness outright. The rollout epic states the
business motive plainly: start consuming the new endpoint "to start testing
our new API and learn quickly about any changes we may need to make in
terms of design, and to deliver customer value," and to save money by not
routing internal calls through the monolith.

## The numbers

**75 ticket-linked pull requests** between February and September 2019,
adding about 17,200 lines and removing about 2,800, across the monolith
(47), the mobile app (14), the web backend-for-frontend (7), and the web
app (7). Six epics; five closed Done in 2019. Matt was a Software Engineer
II throughout.

## Discovery before code

Before any migration code was cut, Matt reviewed existing test coverage and
feature-flag state (confirming the new path was still at zero percent in
production), ran a formal production-readiness audit that he split into
"stable and reliable" and "observable" sections and wrote up himself, and
interviewed the product managers and engineers on the consuming teams,
recording the notes in a shared findings document. He repeated that
interview-and-write-up pattern at every major decision point in the
project.

## Parity work before any traffic switch

The new API had to match the monolith's field-level behaviour exactly, not
approximately. Matt fixed mismatches across the three email fields and two
fax fields, and separately across address fields, and closed unit-test gaps
in the health controller, the country-code service, the auth utility, and
the list endpoint itself.

## The shadow-comparison harness

Rather than cutting the mobile controller over to the new API directly,
Matt built a shadow request: the legacy path kept serving the real response
while a background thread also called the new API and diffed the two,
without affecting the customer-facing result. He wrote the architecture
decision record justifying the pattern, then built it:

- the shadow call itself, after first extending the schema to support the
  ordering parameters the comparison needed;
- the comparator wired into the shadow flow, with count-mismatch logging;
- a null-pointer fix for a request-context holder that was only available
  on the main thread, a bug that only appeared once the call moved off it;
- a character-encoding fix so contacts with international characters came
  back correctly instead of as replacement characters;
- scoping the shadow request to token-authenticated calls only, so the
  comparison population was well defined;
- guaranteed candidate and control list ordering, skipping comparisons when
  the control contact was absent, and teaching the count comparator to use
  the legacy path's own count call rather than a proxy for it.

Critically, the comparison executor used a **discard rejection policy**, so
an overloaded task queue would drop excess shadow work instead of blocking
real requests. A colleague co-owned the comparator refinement; Matt built
the initial shadow request and the decision record and was a mutual
reviewer throughout. He does not claim sole authorship of the pattern.

The diffs found real fidelity bugs, in character encoding, address and
email fields, and ZIP+4 codes, before any customer saw the new path.

## Making the endpoints production-grade

Separately from the comparison, Matt made the API operable: production-grade
logging on contact creation, a contact-count query that used a database
count instead of paging through every row, header forwarding so shadow
requests carried authorisation values rather than a servlet-request
reference across threads, and de-duplicated metric histogram names that had
been throwing exceptions and surfacing to customers as 400 responses. He
wrote the on-call runbook for Contacts API alerts before the endpoint
carried real traffic.

## Migrating the consumers

**Mobile first.** Once the list endpoint's comparison stayed clean, the
mobile backend consumed it behind a feature flag, then a "get all contacts"
pagination flow using page tokens instead of offsets, then a circuit
breaker modelled on the web backend's own implementation and scoped to trip
only on server errors so client errors would not false-positive it, plus an
end-to-end test for the whole path. Two mobile engineers did substantial
implementation alongside him; this was a genuine team effort. The seventeen
mobile-app pull requests are the first production consumer of the new API,
and they are absent from every earlier career document.

**Web in parallel.** The web backend-for-frontend and web app moved their
contact-load actions off the legacy servlet one call at a time: a new
backend query and domain for the Contacts API, the single-contact fetch
behind a flag, a sales-pipeline query set, an activity-feed events query,
and finally the largest single change in the dataset, refactoring the
contact-details view to resolve entirely through the new path. Along the
way Matt recorded a deliberate trade-off in a decision record about the
legacy custom-fields model, which the team chose not to re-model given it
was expected to be deprecated the following year.

## What is not claimed

- Adoption beyond mobile and the web backend is unconfirmed in the record.
- Whether the legacy servlet and controller paths were ever fully
  decommissioned is not confirmed.
- The epic's "save money by not routing internal calls through the
  monolith" goal was never quantified anywhere in the record.

## Why this thread matters

Verify-before-cutover became the template Matt reused on the merge service,
the content-risk service, and later decompositions. It is also the "I have
done this before" receipt underneath the merge decomposition.
