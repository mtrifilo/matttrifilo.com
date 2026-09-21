---
id: support-requests-and-data-fixes
title: Support escalations, incident fixes, and tenant data corrections, 2018 to 2024
summary: Seven years of being the person called when one customer's data broke in a hard-to-reproduce way, and the three shapes that took.
tags: [support, defects, incident-response, customer-impact, operations]
updated: 2026-09-21
---

# Support escalations, incident fixes, and tenant data corrections, 2018 to 2024

## What this is

Not one story, but a recurring pattern spanning seven years: a customer or
a support agent hits something broken in one specific account's data, and
it lands on Matt because he knows the email-sending and contact-data
internals well enough to fix it quickly and safely.

**39 ticket-linked pull requests** between April 2018 and December 2024,
adding about 1,650 lines and removing about 700. Thirty-eight tickets, 19
tasks and 18 customer-reported defects plus one epic; 29 marked deployed, 9
done. Four repositories, with the monolith accounting for 31. The
distribution across years: six in 2018 and 2019, five in 2020, six in 2022,
twelve in 2023 (the heaviest year), and ten in 2024.

The tell is one repository in that list: an operations repository, where
five of the 39 changes are audited, tenant-scoped data corrections rather
than product code.

## Three recurring shapes

**Root-cause a customer-reported defect from its symptom in one account.**
A broadcast that silently double-sent when the sending API timed out. An
opt-out status flipping incorrectly on a feedback event. A drill-down
custom field merging as a raw number. A reschedule query returning wrong
results, hotfixed the same day. In 2020, a scheduler deadlock that was
skipping contacts in batch sends, diagnosed from log data across 173
accounts.

**Ship behind a flag, then close the loop.** Six of the tickets in this set
are flag-removal tickets tied to an earlier fix here, which is why the
ticket count tracks the pull-request count so closely. Every flagged fix in
this record has a matching removal, so each was confirmed stable before the
scaffolding came out; none are left flagged off.

**Go directly at the data when the fix is not code.** Reverting roughly
12,000 contacts out of an administrative opt-out status that had locked
them out of re-opting in through a web form, after support had advised the
customer into it. Purging stale rows that were slowing one contact record.
These are one-time, audited operations with no follow-up, consistent with
closed support requests.

## Caveats

- This is a long tail of one-off fixes, not a single narrative. The counts
  describe volume and pattern, not one outcome.
- All 39 changes are ticket-linked; no keyword matches inflate the numbers.
- No customer-impact or revenue figure attaches beyond "ticket closed."
- The record cannot show who did the underlying investigation before Matt
  coded each fix, or any teammate's parallel triage on the same tickets.
- Whether any of these were recurring problem classes rather than recurring
  symptoms in one account, and therefore needed a systemic fix, is an open
  question.

## How he describes it

Matt has written:

> Across several years I was the person my team called in when a customer's
> data broke in some hard-to-reproduce way: a broadcast that quietly
> double-sent, an opt-out status flipping incorrectly, a merge field
> rendering the wrong value, a query returning wrong results for one
> tenant. I root-caused the actual mechanism rather than patching the
> symptom, shipped the fix behind a flag, and came back later with a
> cleanup once production confirmed it held. A handful weren't code fixes
> at all: direct, audited corrections to one customer's data, the fastest
> safe way to unblock them. Not one big project; a long tail of small,
> high-trust interventions that added up to a lot of customers not staying
> stuck.

## Why this matters

It is the unglamorous half of a reputation. Being the person other
engineers tag with merge questions and being the person support escalates a
stuck account to are the same fact seen from two directions: sustained,
detailed ownership of systems most people would rather not open.
