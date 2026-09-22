---
id: splunk-exit-email-compliance
title: The Splunk exit for the email compliance system, 2020
summary: Under a hard vendor-exit deadline, Matt rebuilt the data pipeline and alerting behind the compliance system's actions and dashboard.
tags: [observability, bigquery, new-relic, migration, compliance, python]
updated: 2026-09-21
---

# The Splunk exit for the email compliance system, 2020

## The problem

The company decided to stop using Splunk for logging. The epic states the
consequence plainly: the email compliance system "must be refactored to use
the new logging data source. Without the data source the auto email
compliance will not work. The email dashboard for internal reporting also
sources from warehouse data that is ingested from Splunk currently." The
success metric was a smooth transition by the end of the second quarter.

Both the system's automated compliance actions and its internal reporting
dashboard read warehouse tables populated from Splunk-ingested logs. If
Splunk went away before the pipeline was replaced, both went dark. Matt did
not originate the decision; it was a company-level infrastructure call.

One discrepancy he keeps attached: the epic's success metric names one
observability vendor as the destination, but every subsequent ticket and
change built against a different one plus native warehouse scheduled
queries. Nothing in the record explains the pivot, and he does not resolve
it in a packet.

## The numbers

**46 ticket-linked pull requests** between March and October 2020, adding
about 5,800 lines and removing about 1,200, mostly in the compliance
service (41) plus configuration-management repositories. Thirty-three
tickets under one epic; Matt was the assignee on 28 of them, including
every scoped-query, alert-migration, and reliability-hardening ticket after
the initial harness. He was a Software Engineer II, becoming a Software
Engineer III partway through.

The epic opened more than twenty per-query sub-tickets on the same day,
each targeting one Splunk query needing a replacement. Later tickets came
from defects and hardening found once the new pipeline was live: alerts
silently not firing, a logging client that no longer existed, missing
resource quotas. This was a planned migration followed by a real
production-hardening pass, not a single cutover.

## What he built, in five phases

**Phase one, the harness.** Matt built the pipeline harness first, a
scheduled cloud endpoint writing into warehouse tables that mirrored the
old schemas, with a **plug-in registry of queries**, explicitly so multiple
engineers could build replacement queries in parallel "without frequent
merge conflicts." Every per-query ticket plugged into it afterwards. A
colleague owned the underlying log ingestion; Matt contributed the
reception-log parsing sub-task, parsing a pipe-delimited log format field
by field from sample lines.

**Phase two, the query-by-query rebuild.** He rebuilt each Splunk query as
its own scheduled warehouse query with an infrastructure-as-code schema:
engagement, spam traps, sender score, feedback comments, volume by sending
address, sender domains, subject lines, problem contacts, and email batch
times. He caught schema mismatches before they reached production, dropping
a redundant date column across five queries and fixing a string-versus-
numeric mismatch between two joined identifiers.

**Phase three, the risky cutover.** Switching the application's query layer
from the old dataset to the new one is where a bug could silently corrupt
the dashboard. Matt gated eleven query functions and nine per-account
classes behind feature toggles, so the old and new data could run side by
side while a colleague validated integration against production. When that
cutover surfaced fallout he found and fixed it: a broken per-account page
and three more page-load defects.

**Phase four, alerting.** Every Splunk-based alert, seven in total, moved to
scheduled-job-driven alerts feeding the on-call paging tool. He then hardened
them: query-parity fixes; an **enable flag on the alert configuration so
on-call could silence a bad alert without a deploy**; dashboard links in
each alert body; resource quotas and staggered cron timings after tracing
resource contention affecting a shared authentication service; and removal
of the alert jobs from pre-production entirely.

**Phase five, cutting the last cord.** He replaced the service's cloud
logging client with standard output and rewrote the end-to-end test suite
that depended on its output, then made CI fail the build on failing tests,
a gap the migration had exposed. The toggle constants came out in August
once the new path had been the only path for months; the epic closed in
December.

## Options considered

| Option | Taken? | Why |
|---|---|---|
| A separate streaming pipeline per query | No | Floated in the epic's notes; nothing documents why it was not used |
| A hard cutover of the query layer | No | Feature-toggle gating instead, enabling side-by-side parity checks |
| Remove the toggle as soon as the new path worked | No | Constants stayed until August, months after the implied target |
| Keep the old logging client since it still worked | No | It was retiring alongside Splunk; removed in the same pass |

## Division of labour

Owned end to end: the ingestion harness, essentially every per-query
replacement, both feature-toggle cutovers, the alert migration and its
hardening pass, the logging swap and test refactor, and the flag removal.
Contributed to but did not own: the log-ingestion pipeline (a colleague's
ticket, to which Matt contributed one sub-task) and the
integration-versus-production parity verification (another colleague's).
Peer recognition at the time named Matt and one other engineer together for
the initial development work being complete.

## Caveats

- The business reason for exiting Splunk, beyond "business decision," is
  not in the record, nor is any cost figure, nor the date Splunk was
  actually decommissioned company-wide.
- The defects found during the toggle-gated transition show real bugs
  existed and were caught; nothing shows whether any reached a customer
  first.
- Any incident avoided by the resource quotas or the enable-and-disable
  flag shows up only as an absence, not as evidence.

## Why this thread matters

The first time Matt owned a compliance-system data plane under a hard
vendor-exit deadline. The 2024 move to Google Cloud Operations and the 2026
Salesforce migration both sit on top of it.
