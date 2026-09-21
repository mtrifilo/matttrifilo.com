---
id: legacy-api-sunset
title: Decommissioning legacy services, 2020 to 2026
summary: Six years of proving a system is safe to delete and then deleting it, with the research method and the honest caveats attached.
tags: [decommission, sunset, gcp, infrastructure, cost, operations]
updated: 2026-09-21
---

# Decommissioning legacy services, 2020 to 2026

Matt describes this as the thread where he volunteers to delete things. The
pattern is constant across six separate efforts: find a system nobody
depends on, prove it, stage the removal behind a flag where there is doubt,
and delete it rather than leave it as debt.

## The earlier efforts, 2020 to 2024

- **A hosted-email service (2020).** The trigger was a data-minimisation
  concern rather than cost, and almost nobody used the feature. Matt made
  the related merge fields resolve to empty strings behind a flag, tested on
  and off in both builders, and moved the tracking-artifact generation
  downstream into the monolith.
- **A monitoring integration with a flagged vulnerability (2023).** Deleted
  the package and every caller across the bounce and delivery-monitor stack
  in one pass, 41 files and nearly 4,000 lines removed. Nothing that could
  load the package was left; only the stored rows it had written remained,
  tracked as separate work.
- **A business-profile lookup service (2024).** Its one caller, the legacy
  builder's best-send-time logic, had been running on a hard-coded default
  for years, and the service needed an unfunded framework upgrade. Matt
  stripped the dependency out, leaving the builder on the default it had
  effectively been using all along.

## The 2026 tracking-service decommission, end to end

Two legacy services, one serving click redirects and one serving open
pixels, both superseded years earlier by the modern engagement-tracking
service, both still running because old emails in people's inboxes still
contain their URLs.

**The research, April 2026.** Neither service had been deployed since June
2022. The click service was still serving roughly 24,300 requests a day in
production, flat across a thirty-day sample with no decline trend, because
old emails permanently exist in inboxes and archives, search engines have
indexed the URLs, and DNS pointed the domain family straight at the
application-hosting platform. Matt ran bot detection across user-agent
fingerprints, datacentre address ranges, residential-proxy patterns, and
the time-of-day distribution, and found the daily curve flat to within four
percent, with no human peak at all. His conclusion, which is what made the
shutdown decision possible: of 24,300 requests a day, roughly 24,000 were
bots and crawlers and the likely-genuine human clicks were in the **low
hundreds per day**, and even that subset was dominated by proxy traffic.
The pixel service was serving about 44,000 renders a day, all image-proxy
fetches of old emails, and zero link-creation or stats calls in thirty
days. A disabled pixel returns a 404, which is invisible: a transparent
one-pixel image does not render either way.

**The sequence**, per service: remove the calls in the monolith behind a
flag, then delete the dead code; remove the proxy filters in the modern
service; disable the application hosting in every environment with a soak
period between them; cancel the data pipelines; remove the project
deletion-protection liens; flip the deletion policy; tear down the
infrastructure-as-code; and delete the cloud projects.

**The safety work is the interesting part.** A pre-merge risk sweep found a
real consumer nobody had accounted for: the click subscription being
removed was the input to a running streaming aggregation job that CI kept
redeploying. The warehouse table it fed had received its last row minutes
before the application was disabled nine days earlier, so the pipeline was
structurally alive and functionally dead. Matt blocked the teardown, filed
a ticket for it, had the job removed from its configuration, and cancelled
it manually in all three environments, each transition clean in about
ninety seconds with neighbouring jobs untouched, before a soak period.

He then captured the strongest pre-flight evidence available: the
destination table held **1.45 billion historical rows and zero writes** for
nine days, end-to-end proof that the whole pipeline was dead. After
cancellation he queried every environment's logs for any mention of the
cancelled pipeline and found zero matches, and noted explicitly that the
*absence* of log entries was itself the steady-state signal.

**Coordination.** A data team confirmed that three warehouse replication
subscriptions in a deactivated project were no longer used, and that when
the source topics are deleted those subscriptions become orphaned rather
than actively failing.

**One brief rollback** in June, when a legacy caller from another team
surfaced.

**Outcome.** Pixel traffic verified at zero requests after cutoff, down
from about 44,000 renders a day. The savings figures in the tickets are
internal estimates and one of them was questioned by his director; **they
are not presented as confirmed**.

## The smart-lists investigation, 2026

A colleague's pre-shutdown safety check flagged "significant usage,
including 331 API calls" in thirty days, and the question was whether an
active consumer had been missed.

Matt pulled the underlying metric directly and broke it down by day and by
service. The finding: the "331 calls" were not application traffic at all.
Roughly 80 were a daily datastore export job that had stopped running more
than seventy days earlier because the project hosting its scheduler had
billing disabled; roughly 80 more were the cloud console's own risk-
assessment panel enumerating the project when his colleague loaded it; and
roughly 60 were his and his colleague's own investigation queries that
week. The downstream warehouse tables all carried a last-modified timestamp
from the same day the exports stopped. Application traffic was zero across
the entire log-retention window, the monolith and web app had removed their
calls months earlier, and the one queue topic had zero publishes in ninety
days and no subscribers.

**He gave the all-clear**, noting that a courtesy heads-up to the owning
team was appropriate but no coordination was required, and the service was
deleted across all environments.

## The dead-feed removal, 2026

A legacy deliverability data integration that had outlived its purpose. The
nightly pipeline still ran, still ingested tens of thousands of rows a day,
and the compliance system still carried a scoring dimension fed by it.

Matt's audit found the dimension produced **zero operational signal**. The
dashboard page for it had zero hits in ninety days. Two of the warehouse
datasets had not been written to in one and a half to two and a half years.
Twenty-two other repositories were clean of any reference. The integration
was cleanly scoped to three repositories with no external consumers.

His five reasons to act, in his own framing: the integration no longer
served any business purpose, yet every nightly run kept it alive; the
scoring dimension produced no usable signal; nobody had used the dashboard
in ninety
days; every engineer touching adjacent code had to decide whether it was
still real; and the dead tables were never cleaned up. He recommended full
removal as eight independently shippable steps.

## Caveats he keeps attached

- These are separate efforts stitched together by theme, not one project.
- Cost figures in the tickets are the tickets' own estimates, not confirmed
  against billing.
- One decommission remained open at the time of writing, with its flags not
  confirmed fully off.
- He cannot show that any of these prevented an incident.

## Why this matters

Deleting a system safely is a research problem before it is an engineering
one. The method, characterise the real traffic rather than the raw count,
find the consumer the inventory missed, capture proof that the pipeline is
already dead, and stage the removal so a surprise is recoverable, is the
transferable part.
