---
id: 'faq'
title: 'FAQ'
summary: "Matt's answers to what hiring managers ask most: his next role, hiring and growing engineers, working with Product, and delivery with AI agents."
tags: [faq, hiring, management, ai-agents, product, process, next-role]
updated: '2026-09-28'
---

# FAQ

Matt wrote these answers himself. They are given here in the third person, the way the assistant speaks about him. They are the questions
hiring managers and engineering leaders ask him most often.

<!--
Notes for whoever edits this file. lib/knowledge/build.ts strips HTML
comments, so nothing in here reaches the model. Keep authoring process
talk inside these fences and out of the prose above.

The build drops a whole question, answer included, when its heading is a
placeholder, its body is empty, or any line of its answer starts with TODO
or contains "TODO (Matt)". A half-written answer with a note left in it is
dropped, not shipped in part. With no question answered it drops this
whole document, so a placeholder never reaches the model. To publish an
answer, replace the "TODO (Matt)" line under a question with the answer
itself, then bump updated and add its topic to the tags and the summary,
rewording the summary to stay under its 160-character limit: the index
line is how the assistant decides whether to open this file.

The answers about leading people are in faq-leading-people.md, next to
this file, because one file cannot hold every answer under the read
budget: the re-read check in lib/knowledge/knowledge.test.ts fails when
twice the largest document plus the next one exceeds it. Every rule in
these notes applies to both files.

This folder is the ONLY place where the build drops an unfinished section.
Everywhere else a TODO is a build error, on purpose: a career document is
written elsewhere and pasted in whole, and a silent deletion there would
look like nothing at all. `bun run knowledge:check` prints every question
dropped from this file on every run, so the deletion here is visible too.

Answers are written in the third person about Matt, the way the assistant
speaks about him, never as Matt: the persona rule in
.claude/skills/career-assistant-context/SKILL.md. First person appears only
inside a block quote introduced as his own words, as in the next-role
answer. Job-search topics beyond the next-role answer (MTC-40) are out of
scope. An answer long enough to need its own page is a new
document in content/knowledge/career, not a longer answer here.
-->

## What is he looking for in his next role?

Matt is ideally looking for a hands-on software engineering manager role, or a player-coach role, where he can lead a product engineering team while actively contributing to software projects: new product betas, iterations on existing products, and system design for back-end stacks, both greenfield and brownfield. He has served in that role for years, collaborating closely with his team's Product Manager, design partner, and senior leadership to prioritize the product efforts that can deliver the most impact for the business based on current resources and the company's north-star strategy.

He is also ready to take on an individual-contributor role as a Senior Software Engineer, full stack. He still codes every day and actively contributes to the team's engineering commitments. He mostly codes in Java, TypeScript, and Python, and also contributes to a few Go cloud functions. He uses AI heavily for implementation, testing, code review, verifying deployment success, triaging on-call issues, and investigating bugs. He is most familiar with Claude Code and Cursor, and can adapt to any AI tooling available.

He has nine years of experience on marketing automation and email sending products (MarTech), on the Email Reliability team and across many cross-functional efforts for the marketing automation products, though he is open to any new business domain where he can learn and grow while delivering the kind of business outcomes he has delivered for years. He would pass on crypto and sports-betting platforms.

In his first year he would want to be measured on the tangible outcomes he has delivered for the business that helped move the needle on top-level company goals and KPIs, along with how his own DORA metrics trend as he gets more comfortable with the software systems and the teams.

In his own words:

> Over the past nine years, I've been fortunate to deliver many high-impact projects that have helped many thousands of small businesses follow up more effectively with their customers and leads, leading to growth that helps not only their businesses, but their families and communities too. Effective email marketing automation lets small business owners focus on their core business problems and opportunities instead of managing email communications manually. They can then provide great service and availability to their customers even while they sleep.

World-class email deliverability is critical for those businesses to communicate with their customers, and his current team has built up an email service provider and sending system that handles up to a billion messages a month at 99.9%+ uptime while remaining very cost-efficient. At this stage of his career he is looking for new opportunities with bigger challenges, where he can deliver similar transformative business impact for growing software products and teams and begin the next growth phase of his career: continuing to deliver AI features, both user-facing and internal AI enablement for teams, and taking on new leadership and engineering challenges he can drive.

## What does Matt's team own?

TODO (Matt)

## How does he use AI coding agents day to day?

TODO (Matt)

## How does he keep quality high when agents write most of the changes?

TODO (Matt)

## How does he stay hands-on while managing a team?

TODO (Matt)

## How does he hire and grow engineers?

Matt's preference in interviewing is first to find candidates with demonstrated experience or high potential related to the role, and then to look for signals of high agency and strong autonomy in what they have owned and delivered in previous roles. His philosophy of people leadership comes from many trainings and books, Multipliers and Extreme Ownership among them. He wants team members who will confidently take ownership of a goal within the scope of their role and execute without needing to be told what to do and how to do it, while staying open to coaching. The best teammates support each other, do what it takes to get the job done, solve hard problems, and keep learning and growing. That lets individual contributors bring their full creativity, intelligence and potential to problems and solve them in ways that he and other leaders might never have thought of: the experts closest to a problem generally find the best solutions when given the trust and the opportunity to do so. His own role has mainly been to make sure everyone is aligned and bought into the highest priorities for the team and the business, while actively contributing to those priorities by their side. His deal-breakers are any sign of dishonesty, an unwillingness to collaborate effectively with others, a lack of the bare-minimum skills or experience, or a temperament of wanting to be told what to do with the intent of doing the bare minimum.

When he ramps a new hire, he first reviews the team's current 30/60/90-day plan to make sure it is up to date, then tailors it to the person, the team's current needs, and the role. For software engineers, the goal is to merge their first pull request within the first few days. Once they have gone through the complete lifecycle of picking up a ticket, implementing the change, passing the team's formal code review, and deploying, they have learned the software development lifecycle, the testing culture, the coding practices, the tooling, the team's AI bots and how they are used, and what working alongside the team is like. After that first pull request is deployed, everything falls into place much faster, and it builds confidence: they have already delivered their first piece of value for the team and the business, and learned a lot along the way. The 30/60/90 document then becomes a reference as they settle into a day-to-day routine and their first round of Scrum ceremonies and sprints.

For career development and growth, his first one-on-one with a new hire always centers on their long-term goals: what they want their career to become over the coming years, what they want to learn, what they are passionate about in technology at work and outside it, and their hobbies. Those insights help him find projects and opportunities that align with their goals and passions while they contribute to team and business objectives. Not everyone can always work on what they would prefer, but projects that align with an engineer's growth and interests bring out their most productivity and engagement, which is a win for the team, the business and the engineer. He encourages his reports to have skip-level one-on-ones at any time, and his own leaders are usually proactive about quarterly skip-levels with every developer, which he supports: he wants every individual contributor to feel comfortable talking with any leader at any level, so that he is never a bottleneck. It also gives them visibility beyond the team and the organization for their growth, and helps make sure perceptions are accurate when calibration and promotion discussions come up with senior leaders who have not spoken to them before.

## How does he run on-call and incident response?

TODO (Matt)

## How does he work with Product to decide what the team builds?

The first step is to understand the business's top goals and priorities as fully as possible, and where his organization and team can help achieve them. If he needs clarity on business objectives, it is his job to ask questions and learn until his understanding is fully aligned with senior leadership. From there he works with his team's Product Manager on the goals they would like the team to own, as they align with senior product leadership. At Thryv the team has most recently defined its deliverables and timelines on a six-week cadence. Collaborating with the Product Manager and the Tech Lead, they negotiate and align on the deliverable milestones the team can commit to with high quality and certainty while still achieving the business goals with the resources they have, so that commitments are challenging yet attainable with high confidence. The process varies with which product efforts are prioritized in a given quarter and how many are customer-facing and need design collaboration. When designs are not yet ready, or product decisions still need to be made before scoping, they note those risks and communicate them to senior leadership. Ideally the team commits only to milestones that are fully scoped and ready for development, and plans and scopes the next efforts while the current milestone is in development. In reality there is always some ambiguity when milestones are set, but communicating the risks and trade-offs, during planning and in an ongoing way as realities change, means senior leadership knows each project's status in real time and can help with any scope change or pivot as business priorities evolve.

One example of reshaping what was asked is the decomposition of email out of the monolith. From previous experience with the team and the stack, they understood early that the opportunity cost and the scope of the effort were much larger than leadership was aware of at the time. They proposed allocating just two engineers to a phased decomposition plan over multiple quarters, instead of investing every team member in the effort all at once for many months. That let the team keep executing on high-impact business goals while the decomposition delivered its highest-impact milestones at the same time, and it left room to pivot without the risk of a half-finished project being abandoned after months: smaller-scoped deliverables meant a pivot could not waste months of investment and effort without any positive business impact. At worst, a weeks-long project would need to be paused for the pivot.

His product partner is the team's Product Manager. They meet weekly in scheduled planning meetings, and ad hoc whenever a specific project needs discussing in depth. They review the asks and priorities from the Product organization and first align on what the team has the resources to deliver, which sets up the priorities the whole team is involved in when planning the actual tickets. Working with the Tech Lead as well, the three of them negotiate and align on what the team can deliver with high quality and confidence, without risking an unnecessary time crunch that would incentivize engineers to cut corners or quality to hit a deadline. Technical debt cannot always be avoided, but it becomes very expensive when more and more of it ships without being addressed once the business outcomes are delivering value to users. At the end of each week they hold a triad sync, Matt, the Product Manager and the Tech Lead, for whatever agenda items they want to raise; it keeps them aligned and engaged, and sometimes reveals additional discussions that need their own meeting the following week. It has been very helpful for maintaining high-trust working relationships and staying aligned on the team goals they lead together.

## How does he run the team's delivery process, and how did it change with AI agents?

Email Reliability follows the standard Agile Scrum process with two-week sprints and ceremonies like backlog refinement, sprint planning, retrospectives, and daily standups where each team member shares what they worked on yesterday, what they intend to work on today, and any blockers they are experiencing. The team also has a culture of sharing blockers and questions asynchronously in Slack without waiting for a meeting, so that other team members can jump in and help in real time. For each sprint the team defines sprint goals and brings in the tickets that represent done for those goals. In the ceremonies the team works together to define what success looks like for each sprint goal and then makes sure each goal has ownership and alignment from each team member. That also makes sure each person has plenty of work for the sprint, knows what to prioritize first and why, and knows when to flag a potential scope increase or a risk that planning did not uncover. From there each team member has autonomy and ownership of the goals they are working on, within the scope of their role and level: they define the how, based on the engineering and product organizations' best practices and the available tooling.

In the era of AI, the team now uses Claude to create Jira ticket and epic drafts for the team to refine, to perform sweeping research spikes where appropriate, and to turn planning and discovery meeting transcripts into actionable documents that give agents the context to generate tickets with far more detail and accuracy than the team would have had time for before. AI is also used heavily for research spikes that define code requirements across the many email-domain systems in the legacy monolith and across the team's microservices and data pipelines. As pull-request volume has increased, the team has emphasized keeping pull requests as small as reasonably possible, so that AI and human code reviews catch and fix more issues, and so that production deployments are more frequent and smaller, which reduces risk while improving the DORA metrics. It is much more efficient and safer to deploy many small, well-tested changes than infrequent large ones that may span many services at once. Over the same period, median cycle time to production fell from about 9 days to 2.3, and open customer-reported defects from 28 to 12. Every team member generates a significant share of their code with Claude Code or Cursor, and one or more AI bots review every pull request; an adversarial-review skill reviews each pull request without the context of its ticket, as an outside agent whose goal is to find every issue the implementing agent missed.

## What does he know about email infrastructure and deliverability?

TODO (Matt)
