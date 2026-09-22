---
id: security-and-supply-chain-2026
title: Security and supply-chain work in 2026
summary: How the team's security posture moved from meeting ticket targets to proactive audits, new detection capability, and automated remediation.
tags: [security, supply-chain, cve, dependencies, remediation, phishing]
updated: 2026-09-21
---

# Security and supply-chain work in 2026

Security moved from "all tickets within target" toward proactive
evaluation and new detection capability this year.

## Sustained remediation throughput

Through September 10, 2026, the team resolved 228 security-type tickets and
95 dependency-scanner tickets, 323 in total. Notable pushes:

- a thirteen-pull-request dependency batch in the week of May 22, including
  a Go runtime upgrade that resolved twelve vulnerabilities in the
  spam-scoring service;
- a coordinated bill-of-materials and build-plugin upgrade across six
  services in one pass in June, closing 21 tickets;
- about 57 percent of the third quarter's 46 security tickets cleared in
  the first week of the quarter;
- six vulnerabilities plus the compliance service's migration to
  workload-identity credentials in one week in September.

## The supply-chain audit, May 2026

In response to an active worm wave in the public package registries and a
parallel supply-chain campaign, Matt ran a rolling audit across two code
host organisations, 333 repositories in one and 195 in the other.

**Result:** zero active compromises, two high findings, and 75 findings in
total, each routed to the team that owned it. The findings themselves are
internal and are not described here.

**How it was built to be repeatable**, which is the part that matters: an
indicator-of-compromise list as the single source of truth, updated first
whenever new indicators publish; two direct-API scan scripts, one
enumerating every non-archived repository and grepping its manifests and
lockfiles against the list, one auditing every workflow directory; raw
line-delimited results per sweep so runs can be diffed to surface new
exposure rather than re-reviewed from scratch; and a shareable
self-contained briefing page for the affected teams. An earlier
code-search-based variant was kept only for reference and marked unreliable
because of indexing gaps and rate limits.

**Four severity definitions**, written down so findings could be triaged
without argument: a compromised version actively pinned in a lockfile, or
the exact exploited workflow pattern, is critical; a compromised package
referenced but pinned safe with a constraint loose enough that a re-lock
could pull a bad version is high; a mutable action tag is medium; an
unresolvable reference is low.

**Its scope limits were written down up front** rather than left implicit,
so the teams reading the briefing knew what the audit did and did not
answer, and each limit was routed to a separate piece of work rather than
assumed covered. The limits themselves are internal.

## New detection capability for phishing campaigns

**The problem.** Compromised customer applications are sometimes used to run
phishing campaigns. Existing controls caught link abuse; catching the
campaigns themselves earlier was the next capability to build.

**Matt's role.** He designed that capability with the team's postmaster,
wrote its constraints down as decisions that may not be violated rather than
as preferences, and shipped it. Detection merged on September 3 and the
whole first phase went live in all three environments the same day, with a
real page verified end to end in production and acknowledged. A second batch
followed a week later, and the postmaster can tune what is detected without
an engineer. The seeding process became a marketplace plugin so every future
batch runs the same way.

**One design correction during review is worth keeping**, because the
pattern transfers even though the mechanism does not: the bootstrap tooling
was reduced to a one-shot job whose code was deleted after use rather than
left in the repository as a standing capability. The detection content
itself never entered the repository.

What this detects, and how, is deliberately absent from this document. The
capability works only while the people it is aimed at do not know its shape,
which was the postmaster's first constraint and is the reason the design
reads the way it does.

Alongside it, immediate-effect phishing-domain blocks went live in late
August.

## The alerting audit, September 2026

When the postmaster reported that phishing applications found by hand
should have tripped an automated alert and did not, Matt ran the failure to
ground rather than re-tuning the alert and moving on. He found two
independent causes, neither of which had announced itself, and wrote the fix
order down before making any change: restore paging first, then retire a
redundant legacy detector rather than repair it. His argument for retiring
it rather than keeping both is the transferable part. Two detectors that
fail in different ways are worse than one that works, because each is an
excuse not to look at the other.

He then swept the rest of the alert estate for the same class of silent
failure and wrote down the five-step audit method so the sweep can be run by
someone else. The findings, and the shape of the alert estate, stay
internal.

## Automation

From August 2026 much of the dependency-vulnerability backlog is handled by
the autonomous remediation harness, with agents opening pull requests for
human review and merge. See that document for the mechanism and the
numbers.

## The gap he names himself

None of this is a formal security *tooling evaluation* in the sense a
senior-staff ladder would recognise. He names it as the candidate for the
next quarter rather than claiming the work already covers it.
