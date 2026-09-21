---
id: email-sync-and-analytics
title: Email sync stabilisation, email analytics, and the public mail API, 2022 to 2025
summary: Three smaller programs: a fragile mailbox-sync integration owned for years, the bounce and complaint pages, and public mail endpoints.
tags: [integration, gmail, microsoft, analytics, api, email]
updated: 2026-09-21
---

# Email sync stabilisation, email analytics, and the public mail API, 2022 to 2025

## Email sync (2022 to 2025, 21 pull requests)

**The mechanism, and why it broke.** Email sync lets a user connect a Gmail
or Microsoft mailbox so emails to and from their contacts appear on the
contact record. It depends on the providers' push-notification "watch"
subscriptions, which expire on a provider-set schedule and must be
refreshed before they lapse or the sync silently stops. Through 2022 this
kept breaking in ways users could not see or fix: a watch expired, the sync
went quiet, and the customer's only signal was that contact emails stopped
appearing. Support's only remedy was disconnect-and-reconnect, which also
destroyed the diagnostic trail.

The stabilisation epic states the goal: "to stabilize the email sync
feature to ensure the connections remain stable long-term. Also so that
users can self-correct when an edge case occurs affecting any connection,"
with a success metric of support volume "reduced to almost zero."

A support escalation from late 2022 shows the pattern: a customer reported
the sync had stopped, support had them disconnect and reconnect, it worked
for a few days, and it stopped again; both addresses showed a watch
expiration and last-sync-complete date on the same day with a null
last-sync-attempt. And the design gap behind it: "watches are only
refreshed by a cron job one hour prior to expiration. This is problematic,
since if any issues happen with that flow, there is very limited time
before the watches expire," against provider documentation recommending
refresh "well in advance."

**What Matt built, in layers, over about three years.** 21 pull requests,
about 4,100 lines added, across four repositories; he was reporter,
assignee, or both on all but two of the 22 tickets.

- Fixed the authentication strategy the refresh jobs used, which a
  framework upgrade had broken, then fixed the job configuration twice more
  after modelling it on a reference implementation elsewhere in the fleet.
- Added a **second, independent refresh mechanism**: a task queue scheduling
  a follow-up refresh every time a watch is created or renewed, so the
  scheduled job became a catch-all rather than the only line of defence.
- Tightened the refresh cadence from three days to one after watching how
  quickly one provider's watches actually expired in the datastore.
- Fixed a payload bug where task objects were parsed as literal strings
  instead of typed objects, breaking follow-on queries.
- The largest change: a new second-version endpoint and an explicit
  watch-expired status so users could see and act. He **reused the existing
  first-version data objects rather than doing a full domain refactor**,
  saying so directly in the pull request: "fixing the customer pain is the
  top priority at this time," and filing the decoupling separately. He then
  propagated the status through the backend-for-frontend behind a toggle
  argument, the newer product's integrations page, and the legacy product's
  interface, each behind its own flag.
- Closed two false-positive edge cases: do not mark a watch expired on an
  empty expiration field, and only check expiration for enabled, active
  integrations so a more specific error is not overwritten. Rewrote a
  confusing generic "disconnected" message to name the provider rather than
  the company. Cut a cache lifetime from three hours to one so status
  changes surfaced faster.
- Removed the flag once it had run at full rollout for over thirty days.
- Later work covered provider-specific failures, including removing an
  optional field from one provider's watch-creation call after tracing a
  service-unavailable error to a publicly documented fix, improved logging
  on the same class of failure, and a cross-origin misconfiguration blocking
  one product tier.
- The most recent change closed a multi-tenant administration gap: an admin
  could not remove a connection set up by a now-deactivated teammate,
  because the disable logic keyed off the logged-in user's identifier
  rather than the connection owner's. He shipped a flag-gated fix rather
  than scope-creep a defect.

**Options he rejected, with reasons in the record:** a full domain refactor
before shipping the visible status; a separate new query for the backend
rather than a toggle argument on the existing one, reworked "to follow
GraphQL best practices more closely"; and relying solely on the existing
scheduled job.

**The honest limits.** The stabilisation epic was never formally closed and
no ticket reports a number against its "almost zero" target, so the metric
is unconfirmed. A 2026 production incident, caused by the prior week's
framework upgrade, is the same class of failure as the 2022 authentication
break; one of Matt's engineers triaged the alert wave and Matt diagnosed
and fixed it. Whether it traces to the same underlying gap or a new one is
not established. Matt describes this honestly as owning a fragile
integration for years: much better and self-diagnosable, not immune to
recurrence.

## Email analytics, second version (2023, 8 pull requests)

**The problem, from the epic:** surface email analytics in-product with
calls to action "to aid in self remediation to, one, be proactive to help
prevent compliance ticketing and, two, to aid in higher deliverability
metrics." A first version had been attempted in 2020 in the legacy product
only. The individual stories fill in what customers needed: a way to click
through from the dashboard's bounce and complaint counts into a details
page, a page for that click to land on, and a plain-language explanation of
what a bounce even is, phrased from the user's point of view: "if I have
email bounces, I want to see an explanation of what an email bounce is, so
that I can improve my email delivery rate."

Matt built the details-page skeleton first, deliberately unreachable by
real user journeys until the surrounding pieces existed, then wired the
routing and back buttons from the health widget. He shipped the explanatory
tile as a page-specific component, then refactored it into a shared card
component as soon as a second page needed it rather than letting the
duplication persist. He added accessible labels to the widget's icon
buttons, which also made the two identically-iconed buttons distinguishable
in click tracking.

The one change in this set with real backend mechanism: the engagement
details page was returning permission errors in staging because the metrics
module was using the wrong token provider. He traced it, adopted a pattern
another team had already validated elsewhere in the codebase rather than
inventing a one-off fix, and discussed it with them before shipping.

Months after launch he corrected a factual error in the complaint-rate
explanation, from "one complaint per 1,000 emails sent per provider" to
"one complaint per 1,000 unique email addresses sent per provider": a
one-line change that needed the postmaster's sign-off first, because it
changes what customers are told about how their own compliance metric is
computed.

No usage or adoption number exists against the epic's own "weekly customer
usage" metric. This is the direct ancestor of the AI Email Engagement
Summary in surface and problem space; the code lineage is not claimed.

## Public API mail endpoints (2023 to 2025, 8 pull requests)

The company ran two generations of public API side by side and set a
standard for a third. Matt's team owned the mail domain's endpoints. He
built send, record-create, record-delete, and email-address status on the
new REST standard, plus a version-specific identifier object so the new API
would not inherit the old one's data shapes, on the stated principle "we
should not use V1 objects for the V2 REST API if we can avoid it."

On the status endpoint he changed the behaviour rather than copying it
forward: a non-existent email address now returns a proper 404 instead of
the old API's fabricated non-marketable status, resolving an open question
the story itself had left unanswered.

Two years later a customer reported that the sent-date returned for
scheduled broadcasts was the time the record was created, not the time the
email actually sent, correct for immediate sends and silently wrong for
anything scheduled. Matt traced it to which timestamp column the query
used, rewrote the query chain across the data-access and service layers,
and shipped it behind a flag with before-and-after evidence for both API
versions in the pull request. He also named a testing gap in that same pull
request rather than hiding it: a class he could not mock for unit tests.

This is a small thread among many. The broader epic continued past his
involvement and was owned by others; he does not claim it. One change in
the set is an unexplained same-day revert of a version rollout, and he says
plainly that the record does not show why.
