# Matt Trifilo

**Hands-on Engineering Manager · Email infrastructure at scale · AI-agent enablement**
Phoenix, AZ · Open to relocation (Chicago preferred) · In-office, hybrid, or remote (US)
matt.trifilo@gmail.com · linkedin.com/in/matttrifilo · github.com/mtrifilo · matttrifilo.com

Hands-on Engineering manager with 5 reports for Thryv's Email Reliability team. Accountable for sending, compliance, and 24/7 on-call as an Email Service Provider for up to 1B emails a month at 99.9%+ uptime. Nine years of experience, and still ships code daily. Led AI enablement for the org and team, reducing lead time from over a week to 2.3 days.

---

## Experience

### Thryv (formerly Keap / Infusionsoft) · Remote (Phoenix, AZ) · Jul 2017 – present

Small-business marketing automation and CRM. Joined a founder-led company of ~400; acquired in 2024 by Thryv, a public company of ~3,000. Teams: Strategy Builder, which became Keap Pro's Easy Automations (2017 to early 2019); Platform (2019); Email Reliability since September 2019, including a 2020 to 2021 tour of duty leading the Merge API decomposition effort for Platform Services.

#### Manager, Product Engineering, Email Reliability · May 2025 – present

##### Team and delivery

- Manage 5 direct reports: 3 engineers, Thryv's deliverability Postmaster for all Keap products, and an email-compliance analyst. Hired 2 in 2025 who became high performers within months; zero voluntary attrition as manager.
- Coach through regular 1:1s, starting from each report's long-term goals, and performance management; onboard on a 30/60/90 plan that aims for a first merged PR within days; wrote a report's promotion case (2026).
- Partner with the product manager weekly to commit to milestones the team can deliver with confidence; delivered engineering and executive business cases for the email platform to VP-level leadership (2026).

##### AI enablement

- Cut median lead time to production from over a week to 2.3 days and the open customer-defect backlog from 28 to 12 by leading the team's adoption of human-reviewed AI coding agents and independent deploys; the rest of the team's merged PRs per week rose 2.9x (2026 Q3 vs 2025 Q1).
- Ran the company's Claude Code pilot (late 2025); results informed the org-wide decision to adopt Claude Code and Cursor as primary AI tooling for ~50 engineers.
- Proposed, designed, and built the AI Email Engagement Summary (Gemini on Vertex AI, RAG over Postmaster-written help content), which diagnoses a user's last 30 days of sending practices and recommends fixes. Proof of concept in 1 week, 100% rollout 2 months after build kickoff; wrote the Promptfoo eval suite that gates every model change.
- Adapted OpenAI's open-source Symphony harness (via an internal fork two colleagues built) to dispatch Claude Code agents that pick up opted-in CVE tickets within a minute of intake and open PRs with the team's security-fix skill: 17 PRs across 7 services, ~80% hands-free, in month one.
- Wrote the governance and architecture decisions for Thryv's Claude Code plugin marketplace; the team's marketplace (16 plugins, 130 merged PRs in under 8 weeks) became the company template.

##### Platform and operations

- Moved all 9 team microservices (Java/Micronaut, Python, Go) off the weekly release train onto independent, gated production deploys, finishing in 9 weeks, 4 months ahead of schedule. Any engineer can now ship to production as soon as end-to-end, contract, load, and manual readiness tests pass.
- Own the team's 24/7 on-call program and take shifts; escalation lead for unacknowledged alerts; backup Incident Commander for org-wide P0/P1s in the Engineering Manager rotation. Built an on-call agent plugin (triage, mitigation, runbooks) and a weekly operator handoff skill.
- Forecast 2026 sending volume for the annual mail-transfer (MTA) software license renewal, quoted at +48%; matched the vendor's own reporting within ~1%, and the renewal closed at the recommended tier, roughly flat year over year.

#### Software Engineer III, player-coach, Email Reliability · Jul 2022 – May 2025
- Player-coach with an engineering manager's accountability for the team, its people, delivery and operations, while coding roughly half the time.
- Owned Black Friday / Cyber Monday readiness four years running (2022–2025) with zero major incidents; 27.7M emails sent on Cyber Monday 2025.
- Incident lead for a 30-minute cloud-provider outage (Feb 2024): every send retried, none dead-lettered. Wrote the customer updates and the cross-team post-analysis.
- Hardened the engagement-tracking service ahead of Black Friday 2022: memory and cache fixes, one tracking domain per email, phishing-link blocking with an admin endpoint, and an autoscaling floor.

#### Software Engineer III, Email Reliability · Aug 2020 – Jul 2022
- Led the Merge API decomposition for the Platform Services team as a 2020 to 2021 tour of duty: moved email template rendering out of the monolith into a standalone Java service adopted by three consumers, the first step of the email decomposition roadmap.
- Contributed 108 PRs to the Unlayer email builder that replaced the legacy editor. Built tracking-link domain rotation and warm-up so a blocklisted domain is swapped by configuration instead of a deploy. On call one week in six.

#### Software Engineer II · Jul 2018 – Aug 2020
- On the Platform team (2019): helped decompose the Contacts domain out of the Core monolith, moving Mobile's and Web's contact reads onto the new Contacts API (75 PRs).
- Built the circuit breakers that held Black Friday 2019, then extracted them into a shared resilience4j fault-tolerance library with a failure-injection harness (December 2019 to February 2020), later adopted by two more email services; mitigated thousands of failed sends during traffic spikes.
- Migrated Email Compliance's logging and alerting from Splunk to New Relic: BigQuery ingestion harness, rebuilt queries, feature-toggled cutover, 7 rebuilt alerts (46 PRs).

#### Software Engineer I · Jul 2017 – Jul 2018
- Hired onto the Strategy Builder team, whose product became Keap Pro's Easy Automations; built parts of its Vue.js front end and early design-system components. Part of the hackathon whose Vue.js UI rebuild became Keap Pro; shipped initial Keap Pro features.

**Earlier:** Freelance sound design and post-production, Chicago (2009–2015), including an Intel branded film (2011 Intercom Gold Plaque).

## Recognition
- **Thryv Accelerator Award, March 2026.** Company-wide recognition (~10 recipients a month); nominated by the team's product manager.
- **Thryv Emerging Leaders Program, 2025.** One of 23 selected company-wide for a seven-month leadership cohort.
- **Keap Better Together Award, December 2019.** Team recognition for an incident-free Black Friday / Cyber Monday on legacy email infrastructure.

## Selected Projects and Writing
- **Psychic Homily** (psychichomily.com): production site for Arizona music releases and shows, built solo in Next.js/React and Go.
- **decant** (github.com/mtrifilo/decant): open-source CLI that cleans clipboard content into Markdown for LLM context.
- **Writing and talks:** "From Typing Code to Agent Factories" (matttrifilo.com, 2026); three internal talks on agentic engineering.

## Skills
- **Engineering leadership:** hiring, coaching and mentoring, performance management, capacity and roadmap planning, cross-functional and stakeholder management, Agile / Scrum, DORA metrics, on-call program ownership, incident command and postmortems, vendor negotiation
- **AI engineering:** Claude Code, Cursor, agentic workflows and orchestration, MCP, Gemini / Vertex AI, RAG, Promptfoo evals, prompt and context engineering
- **Languages and frameworks:** Java, Python, TypeScript, Go · Spring Boot, Micronaut, Flask, FastAPI · Vue.js, React, GraphQL
- **Infrastructure:** Google Cloud (GKE, Cloud Run, Pub/Sub, BigQuery, Vertex AI), Kubernetes, Terraform, CI/CD (GitHub Actions, CircleCI)
- **Email infrastructure:** MTA operations, DKIM/SPF, IP warm-up, deliverability, compliance

## Education

Bachelor's degree, Audio Arts & Acoustics, Columbia College Chicago · Certificate in Front End Web Development, freeCodeCamp, 2016
