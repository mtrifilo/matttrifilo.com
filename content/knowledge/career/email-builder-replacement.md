---
id: email-builder-replacement
title: Contributing to the new email builder, 2021 to 2022
summary: Matt was one of the core engineers replacing the product's ageing email-authoring surfaces, with 108 pull requests of his own.
tags: [frontend, email, product, vue, java, migration]
updated: 2026-09-21
---

# Contributing to the new email builder, 2021 to 2022

> **Attribution, in Matt's own correction:** "I helped with this effort, but
> I didn't lead it. Others did a lot more work on this than me." Any
> "built" or "led" phrasing about this program should be read as
> "contributed to." His résumé says "contributed."

## The problem

The founding epic names the technology and the risk: "The different
builders have different features and functionality and users have
different experiences in different parts of the app. The company must
maintain all the builders that use different tech stacks. The current
modern builder is built on Polymer which is outdated and may soon be made
obsolete by modern browsers. Feature set is not up to date with
competitors and industry-leading builders."

Two side quests ran alongside the phase work and are not user-interface
parity work:

- **The confirmation email.** The double opt-in confirmation template was
  hard-coded and could not be edited. The work opened it up only as far as
  the platform's deliverability constraints allowed: a deliverability
  constraint expressed as an editing constraint.
- **File upload.** "Customers need a way to store and link to downloadable
  files. For security reasons these should be limited to document and
  spreadsheet formats."

## The numbers

**108 ticket-linked pull requests**, adding about 11,900 lines and removing
about 2,400, across the monolith (56), the web app (42), its
backend-for-frontend (6), a shared tools package (3), and the design system
(1). One hundred tracked tickets: 39 tasks, 30 stories, 23 defects, seven
epics. About a quarter of the ticket volume was defect and hotfix work,
which is the honest shape of a production migration at this size. Matt was
a Software Engineer III, becoming player-coach in July 2022 near the tail
end of the build.

## What he built, phase by phase

**Phase one, parity and polish for templates and broadcasts.** Deleting a
broadcast with its template, renaming templates in the gallery, a
save-as-template modal focus fix, an onboarding video, HTML export, and a
simple-text template card added to the design system. Small usability
defects in the same window: an infinite recipient-loading loop, a close
button that did not return to the gallery predictably, and a template-fetch
count reduced from 50 to 25 for performance.

**Phase two, compliance and cross-surface parity.** The centrepiece is
content-risk integration: a backend client, then the modal in the broadcast
wizard gating sends on a spam, warn, or acceptable quality signal behind a
flag, then the same modal ported into the campaign builder. Anti-spam
compliance followed the same pattern: a form blocking sends until a
business profile carries every legally required field, checked against the
design and against the regulator's own published text before merging. Two
defects in this phase were deliverability-adjacent rather than cosmetic: a
tracking-link defect and a double-unsubscribe-link defect, both traceable
to the new builder emitting links or opt-out footers the legacy logic did
not expect.

**The confirmation-email signature defect, eight iterations.** The clearest
example in the set of visible debugging rather than a clean one-shot fix.
He tried the contact owner's signature, then the owner identifier instead
of a merge field, then added debug logging to a specific tenant to catch
the failure live, then swapped which merge field was used entirely, then
refactored to merge the signature directly rather than through the legacy
pipeline, noting in the pull request that this "should resolve the defect
behavior until confirmation email merge fields are able to be merged using
the merge service" and that he "hasn't been able to reproduce the defect
behavior locally." The final change widened the fix to match any valid user
identifier. The flag and debug logs were removed five weeks later.

**Phase three, the largest and most defect-heavy.** Test-send support,
adding a single contact to the send step, merge-field filtering to remove
meaningless label rows, and a wizard header refactor with new preview and
feedback actions. That last pull request honestly documents an unresolved
problem: "I attempted to add a new unit test suite... but I've been unable
to get the related tests to pass despite the expected behavior working... if
anyone has any ideas on what sorts of setup might be missing, let me know,"
with a technical-debt ticket filed rather than tests faked or skipped
silently. The defect volume in this phase was real: preview links not
resolving, hotfixed the next day; a campaign email marked not-dirty
incorrectly; the legacy builder freezing on emails authored in the new one,
hotfixed the same day; duplicated-template link collisions; and a
signature-and-compliance bug that resurfaced twice, five months apart.

**Two capabilities the old builder never had.** Links that apply a tag on
click, built first in the web app and then deliberately relocated into a
shared package so both the broadcast and campaign builders could use one
implementation, with a same-week fix to a field-name mismatch that broke
existing links. And file attachments, sequenced deliberately: backend
endpoints first with the pull request noting "these endpoints don't have
consumers yet," then a proof of concept, then a delete endpoint, then
pagination, then infinite scroll in the upload modal.

## Options considered

| Option | Taken? | Why |
|---|---|---|
| Build the tag-applying link type in the web app only | No, moved | Relocated to a shared package once two builders needed it |
| Fake or skip the unit tests that would not pass | No | Documented honestly, filed a technical-debt ticket |
| Block the confirmation-email fix until root cause was understood | No | Shipped an interim fix and iterated in production behind a flag with debug logging |
| Build file upload as one large change | No | Infrastructure, then proof of concept, then pagination and polish |
| Flag the anti-spam compliance form | No | A compliance gate should apply universally once ready, not be tested against a control group |

## The long tail

Isolated fixes continued for years: a duplicate custom-domain dropdown bug
in late 2023, an invalid merge-field constant fix in late 2024, and a
broadcast-template-preview flag finally removed in December 2024, over two
years after the feature it gated shipped.

## Caveats

- No adoption or migration-completion metric exists. There is nothing in
  the record showing what fraction of customers or sends moved to the new
  builder, by when, or whether the legacy builder was ever fully
  decommissioned for these surfaces.
- No defect-rate comparison against the old builder exists either.
- The third phase's epic has no resolution date; it appears to have been
  used as a rolling iteration container.
- The confirmation-email fix describes itself as an interim measure pending
  merge-service integration, and no later ticket confirms that follow-on
  work happened.

## Why this thread matters

The largest customer-facing program Matt shipped as a Software Engineer III,
and the substance behind the player-coach line about working across teams to
deliver a new email builder.
