---
id: keap-pro-frontend-2018
title: The early product front-end years, 2017 to 2019
summary: Matt's first two years: a campaigns experience, an assisted follow-up feature, design-system components, and the flag-and-clean-up habit.
tags: [frontend, vue, design-system, product, early-career, feature-flags]
updated: 2026-09-21
---

# The early product front-end years, 2017 to 2019

Matt joined as a Software Engineer I in July 2017, hired onto a team
building a strategy-builder product that never released on its own and
evolved into the simpler automation experience of the company's newer
product edition. He took part in the large hackathon project that became
that newer edition: a Vue front end that started as a replacement for the
legacy product's ageing interface and turned into a separate product with
easier-to-use features on the legacy back end, plus a set of new
microservices and a web backend-for-frontend. The official name of that
2017 hackathon did not survive message retention and remains unconfirmed.

This document covers the ticket-linked work that followed.

## The numbers

**48 ticket-linked pull requests** between October 2017 and February 2019,
adding about 12,400 lines and removing about 3,700, across the web app, the
monolith, the design system, a hosted-page service, and the web backend.
Three epics, all resolved Done. A further 81 pull requests sit in the same
repositories and window without a matching ticket key; they are context, not
counted.

## The problems

Three epics, each with a stated user problem:

- **The campaigns page did not explain itself.** Small-business owners
  installing pre-built "wizardised" campaigns or hand-building advanced
  ones needed different explanations and different setup paths, and the
  page did not distinguish them.
- **The product could not act on the owner's behalf.** The assisted
  follow-up epic asked for a feature that would nudge a newly added contact
  toward a next step automatically.
- **Owners were reactive rather than methodical.** The third epic's
  business case: small-business owners "are often putting out fires and
  their work is often reactionary than a methodical plan," so they
  sometimes do not know the next step to move a contact through their
  funnel. The answer was to extend the assistant into appointment
  scheduling.

## What he built

**The campaign page and details modal.** The wizardised and advanced
campaign-card and detail flows in the monolith, then ported into the newer
web front end, then the details modal itself.

**Compliance detection in the wizard.** Automatic detection of whether a
business profile had the mailing address required by anti-spam law, gating
wizard completion on it, so a business without one is stopped before its
messages would fail deliverability requirements. Matt was building
compliance gates into authoring surfaces in his first year; he did the same
thing again in the email builder three years later.

**Design-system components, because they did not exist yet.** A
notification dot badge, category labels and custom label and value
properties on a button dropdown, and multi-select modifiers. The
nested-modal work records a real design decision: he first tried adding
slots to the modal so callers could customise its header, found that "too
complex of an undertaking for our use case," and reverted to boolean props,
choosing a smaller, easier-to-reason-about interface over a more flexible
one.

**The assisted follow-up feature, the bulk of the volume.** The button
entry point on add-contact, a preview modal with an A/B template toggle, a
rich-text editor for the template body, a feature flag on both the web app
and the monolith, and, once live, the flag-removal change. That flag, build,
verify, remove sequence appears here first and repeats through the rest of
his record.

The harder sub-problem was merge fields: a template's signature block has
to resolve to the sending user's own merge fields while leaving the rest of
the template's merge fields untouched for the owner to edit. Matt
implemented the split and flagged the risk directly in the pull request:
"my local app only has one user at the moment, so this will need to be
tested with an account with two or more users ideally," and confirmed the
parsing swap was verified manually before merge. A follow-on help-bubble
interface for merge fields extended the pattern to mobile.

**Hosted pages and forms.** A hosted-form thank-you page, plus two small
changes to a separate service's cross-origin allow-list after a ticket
titled "CORS policy is blocking form submission, please fix". That is
backend infrastructure on another team's service, fixed directly because it
blocked a front-end feature he owned.

**Assisted appointment nurture.** A multi-step flow: the owner's contact
clicks a link from an assisted-action email, is routed to an
appointment-booking template, and, where more than one booking link exists,
sees a decider screen. Matt built the link handling and loading state, the
decider interface, the no-booking-link fallback, the booking-link setup
call to action, and the full selection and resolution flow, the largest
single change in the set at 24 files. The email templates themselves credit
a designer for the markup, which Matt cleaned up rather than authored.

## What it led to

The three epics resolved between July 2018 and May 2019. This period spans
Matt's promotion from Software Engineer I to II in July 2018, which the
career record attributes to this era's front-end delivery plus the start of
his back-end and Java work. He learned Java on the team's
backend-for-frontend and back-end services with supervision from the team's
senior engineers, and presented an internal talk on the
backend-for-frontend and GraphQL pattern in 2019 or 2020, the first entry
in what became a seven-year speaking habit. The Contacts API program picks
up in February 2019, immediately after this project's last pull request,
moving his primary work into the monolith and Java.

## Caveats

- No adoption or outcome metrics exist in the record. There is no figure
  for how many owners used the assisted follow-up feature, no
  appointment-booking conversion rate, and no evidence the thank-you page
  changed completion rates.
- Several teammates were assignees on sibling stories under the same epics.
  Matt built the pieces above; he did not build the epics alone.
- A December 2018 pair of pull requests tagged "hackathon" shows the same
  hackathon-to-product pattern, but whether it shipped further cannot be
  confirmed. It is a separate, later event from the 2017 origin hackathon.

## Why this matters

The early-career receipts under a pattern that never changed: ship behind a
flag, verify manually where automated coverage cannot reach, remove the
flag once proven, and fix the infrastructure underneath a feature when that
is what is actually broken.
