---
id: deliverability-and-sender-identity
title: Deliverability and sender-identity protections, 2020 to 2025
summary: The mechanisms Matt built to keep customers' mail out of the spam folder, each with a documented problem and a named mechanism.
tags: [deliverability, dkim, spf, email, reliability, compliance]
updated: 2026-09-21
---

# Deliverability and sender-identity protections, 2020 to 2025

Separate efforts that add up to one argument: Matt was building the
protections that keep other people's mail out of the spam folder before he
led the team. Each has a documented problem statement and a mechanism.

## Tracking-domain rotation (2020 to 2021, 12 pull requests)

**The problem, in the epic's words:** "Link tracking domain gets on block
lists and email gets bounced for valid customers. Delisting can take weeks.
Delisting is out of our control but the more often a domain gets listed the
longer it takes to delist."

**2020, the groundwork.** A second tracking domain was added and applied to
a configurable random sample of outbound links via a datastore-backed
threshold, so exposure could ramp slowly without flooding the new domain
and getting it listed. Matt then separated the log line recording which
domain was actually used from the feature-toggle decision feeding it; the
two had been conflated, making the early rollout metrics unreliable.

**2021, the system.** The largest single change built a round-robin scheme
injecting the next warming-status domain into outbound links, driven by a
warming-domain record with per-domain daily usage counts and phased warming
thresholds modelled on the published guidance of the major sending
providers, plus a manual allow-list of tenants known to send clean mail to
speed the ramp. A daily scheduled job reset each domain's counter at
midnight and cleaned up orphaned counters; the same change broke a growing
domain service into smaller services.

Then the correction that matters: the allow-list could not generate enough
volume to warm domains on schedule, so Matt **replaced it with an exclusion
list** behind a new toggle, defaulting all tenants into warming traffic
except roughly 200 known-bad accounts, and added a separate probability
gate to throttle the ramp independently of the exclusion list. Once the
exclusion model proved out he deleted the inclusion-list code rather than
leaving both.

Two operability fixes landed alongside: a stale personalisation regex
updated for the new domain family (after checking dashboards and the code
search to confirm the endpoint had no active external consumers), and an
expected log line that had been firing as an error on every request,
because numbered domain configuration keys are read in an open-ended loop
by design until the first missing key. The production idle-instance floor
was raised so the service could absorb daily spikes without queuing during
autoscaling.

**The outcome the epic asked for:** pulling a listed domain became a
configuration change instead of a deploy. Matt does not claim a measured
deliverability improvement; no blocklist-incident or bounce-rate data
before and after exists in the record.

## Engagement-tracking hardening and the first peak season as lead (2022, 13 pull requests)

Three kinds of strain, all documented by Matt as the tickets' reporter.

- **Unnecessary work per link.** "A different tracking link domain is
  retrieved and used for each individual link in each email sent. This has
  been not very performant, and unnecessary since it risks multiple domains
  losing reputation when present in a bad-actor's email." Fixed by
  accepting a base URL up front, so a bulk request for one message uses one
  domain.
- **Memory.** "Engagement Tracking Service has been struggling to scale in
  recent days, with many pods being killed." Fixed the same day it was
  filed: the pod memory limit raised and the heap-size ratio lowered across
  every environment, on the basis of a published article on JVMs in
  containers that Matt cited in the ticket.
- **Datastore contention on the hot path.** A two-layer cache, in process
  per pod backed by Redis backed by the datastore, in front of the
  domain-status check. A rarely-changing boolean per domain did not need a
  live lookup on every link creation.

**The security response.** When an outside site abused the redirect for a
phishing campaign, Matt shipped a hard-coded block the same day, with the
pull request stating the priority plainly: "top priority is to protect the
affected user from a phishing campaign as soon as possible." Three weeks
later he replaced the hard-code with a real system: a blocked-domain
service backed by the datastore, checked before every redirect, and an
admin endpoint letting on-call add or
remove domains without a deploy. The runbook was updated in the same change
with an operator fallback path. The pull
request documents a manual validation pass: block a domain, confirm the
redirect fails, unblock, confirm the cache invalidates.

**Observability.** Custom trace parameters, including tenant identifier and
link-request counts, added to the bulk link-creation call so on-call could
triage a spike without guessing which tenant was driving it.

A later fix, two years on, corrected a drift between two autoscaler
configuration files, the same class of problem the 2022 work had handled by
hand. The 2022 fix was operationally sound; keeping two files in sync
manually was not.

## Send-time suppression (2022 to 2024, 16 pull requests)

**The problem, from the follow-on epic:** spam-trap and suppression-list
checks ran at import time, so a customer importing a list containing a
previously bounced or spam-trapped address saw the contact flip immediately
to a system opt-out with no context. "This can be frustrating to users who
see an immediate opt-out without understanding that this email address has
been rejected by the receiving provider." Support and partner channels
carried more than a hundred documented complaints from customers who
believed the company was blocklisting their contacts by choice.

Matt moved the spam-trap and suppression checks to send time: a new
optional argument on the existing bulk-scan query routing to a new endpoint
that checks only the default lists, with spam traps checked at send time
instead. He then wired that argument into four separate web surfaces, the
add-contact modal, the phone-and-email edit, the custom-field edit, and the
undeliverable-email modal, each behind the same flag, plus the
backend-for-frontend and the action that loads email validity statuses.

Alongside it he closed a related defect where the public REST API could
silently re-opt-in a contact who had already unsubscribed or reported spam,
by removing a manual opt-out status from the allow-list of statuses
eligible for re-opt-in.

Two attribution notes he keeps attached: one of his engineers built two of
the interface stories that a later flag-removal change closed out, and the
team's product manager owned the epics. When a test-harness race condition
in one component could not be resolved cleanly, he filed it as its own
research spike rather than shipping without coverage.

The epic's own success metric was "no support calls" about the status. No
before-and-after support-ticket count exists, so the outcome is unproven.

## Authenticated sender identity (2022 to 2025, 38 pull requests)

**The 2022 problem statement:** major providers had started rejecting
unauthenticated mail, including mail from free consumer domains. "If no
action is taken this will impact around 57 percent of email sent" and a
substantial share of the customer base. That percentage is an internal
estimate.

**The 2023 deadline.** Two major mailbox providers published requirements
taking effect February 1, 2024: SPF or DKIM authentication for every
sender, DMARC for bulk senders, and From-header alignment, or the mail is
rejected.

**The enforcement wall, June 2024.** Domain validation added to the
builder's review-and-send checks, so an unauthenticated sending domain
produces a critical error and blocks the send. Shipped behind a flag and,
per the pull request, "intended to be hotfixed to Stage as soon as we can",
and it was,
twice in the same week, then extended to campaign publish and the ready
toggle, then made case-insensitive.

**The release valves,** because a hard block with no fallback breaks real
workflows:

- **Test-send sender selection**, so a user whose account login is a
  personal address, which cannot be authenticated on behalf of the
  business, can still send a test broadcast.
- **Reply-to routing end to end**, for franchise and multi-location
  businesses that send from a subdomain but need replies centralised in a
  monitored inbox. Built through the broadcast objects, then moved onto the
  template object once ownership was clear, then given merge-field
  personalisation and backend validation.
- **A per-tenant default authenticated sending address**, the largest and
  most cross-service piece, so a legacy automation hitting an
  unauthenticated address falls back instead of dying. The settings
  interfaces were built first against mocked data; the real backend added a
  new tenant-settings resource following the architecture guild's REST API
  guide; the front end and its backend were wired to it; the monolith's SDK
  and its token scope were upgraded to reach it. A first design for the
  partial-update endpoint was replaced with a field-mask approach on a
  senior engineer's advice, because the original pattern did not generate
  reliably through the SDK tooling.

**Explicitly not taken:** automatic DKIM setup for every user (too large
for the initial epic, though named as something to strive for), guaranteeing
acceptance after authentication (delivery to a third-party inbox can never
be guaranteed), and running a domain-registration service for customers
without one (a registrar function the team did not want to own).

Four of five epics closed; the default-sending-address epic remains open in
the record. The enforcement flag ran eight months in production with no
rollback and was then removed entirely. A hyphenated-domain parsing bug
recurred a year apart and was fixed both times.

## Engagement enforcement for the 2025 peak season (8 pull requests)

Before an eighteen-month marketing-engagement policy could go live, four
known blockers had to be fixed so transactional mail still reached
customers after a contact's marketing status flipped. The urgency is in the
pull request: the policy is "urgently needed" because of an ongoing known
issue with a mailbox provider bouncing more mail sent to contacts who had
not engaged in years, and "when it has dropped to 90 percent, that means 10
percent of all sends were blocked."

Matt built a new transactional send endpoint for quotes and wired the
quote-send action to it behind a flag, then switched the invoice, receipt,
and legacy-quote strategies from a best-for-account routing to transactional
routing, each behind its own flag. The work closed months before the
sending window.

## Why this thread matters

Deliverability credibility is this list, not a slogan. Each item has a
documented problem, a mechanism, a record, and where the outcome was never
measured, a note saying so.
