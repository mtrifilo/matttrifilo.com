---
id: engineering-philosophy
title: How Matt thinks about software, AI, and leading engineers
summary: The patterns Matt runs deliberately, his beliefs about agentic engineering and complexity, and the leadership principles behind them.
tags: [philosophy, leadership, agentic-engineering, complexity, voice]
updated: 2026-09-15
---

# How Matt thinks about software, AI, and leading engineers

## In his own words, on what he does

Matt has written:

> Passionate about delivering life-changing user impacts for software
> products and companies with high quality. I've excelled at bringing
> cross-functional teams with competing incentives together to solve hard
> problems, and deliver business outcomes beyond what anyone could have
> delivered alone in the same timeframe.

His public tagline: *Software Engineering Leader, Agentic Engineer.*

## The five patterns he runs

**1. Hackathon, then proof of concept, then production service.** The merge
service was the prototype and the thing that drove his promotion to senior
engineer. The AI Email Engagement Summary and the V2 sending proof of
concept are the recent applications. This is his signature pattern and it
has repeated for seven years.

**2. Resilience by design.** Fault tolerance and event-driven queueing are
not optional features; they are how systems stay up when the world goes
sideways. Built for a peak sending season in 2019, validated during a
cloud-provider outage in 2024, and now baked into the
independent-deployment gates.

**3. Rapid experimentation with throw-away criteria defined up front.**

Matt has written:

> Implement rapid prototypes to start testing as experimental betas.
> Productionize the betas that prove traction, even if that involves a full
> re-write. Throw away the experiments that don't gain traction, and move
> on to the next idea.

Cheapest to throw away wins for early experiments. Evaluate before you
upgrade a model.

**4. Distribution is the multiplier.** A skill in your own repository is
worth something; a skill in a governed marketplace any team can install is
worth much more. The AI-tools forum, the marketplaces, the subject-matter
plugin system, and the published remediation write-up are all distribution
plays. The 2026 lesson, learned the hard way: distribution needs governance
and tech-lead alignment *before* the broadcast, or it becomes a dumping
ground.

**5. Humans on the merge button.** Agents can open the pull request,
comment on the ticket, and post to the channel. A person approves. That is
where accountability lives, and it is why the automation has been accepted
rather than resisted.

## Beliefs about AI-assisted work

Matt has written:

> I am first in line to champion AI tools, and I use them all day every
> day, but we also have to acknowledge that while they can help us build
> higher scope, higher complexity products faster than ever before, they
> can also help us ship high-blast-radius, severe incidents faster and more
> often than ever before without proper safeguards.

> The most successful companies at this seem to be the ones who dedicated
> the time and effort to implement safeguards, a complete testing pyramid,
> and infrastructure to allow their agent factories to run wild within
> strict constraints.

> Our job as software engineers is to "manage complexity". As soon as we
> grant agents permission to pile on complexity we don't need or want, and
> that we would never have approved under previous circumstances, we are
> lost. Many companies are feeling this at scale.

> Using these tools intentionally while preserving quality, and limiting
> complexity, is very possible, and is happening all the time in many
> companies.

On where a mid-sized company should sit relative to the frontier, his
position is that trailing the state of the art slightly is an advantage: a
smaller organisation can adopt what much larger organisations have already
researched and proven out in production rather than running those
experiments itself.

Other positions he holds:

- "AI-assisted engineering" or "agentic engineering" is the right framing,
  not "vibe coding." Humans stay in the loop, specs are written before
  prompting, diffs are reviewed, tests run, and the agent is treated as a
  fast but unreliable junior developer who needs constant oversight.
- Context-building is the most undervalued skill of the agentic era.
  Persistent, per-service context beats rebuilding it every session.
- Skills beat tool-integration servers for coding harnesses most of the
  time. A server eats context window; a command-line tool is cheap.
- You can judge adoption by rough indicators, time-based usage, token
  counts, acceptance rates, but no single metric is sufficient, and higher
  token usage is not automatically better.
- Individuals and companies need intentional norms for how AI is used, when
  it is appropriate to stop, and how work should and should not expand in
  response to new capability.

## His rule for building context for an agent

Matt has written:

> Building up proper context for your harness can be the difference between
> a one-shot, great solution and a completely broken and unusable solution.
> Every new session, you need to teach your agent about the whole world.
> Skills, screenshots, conversations, internal docs all help with building
> up context. Think of it like this: *if I give this task to a new teammate
> who knows nothing about our team, project, and codebase, what would I
> need to share with them to ensure they're set up to do an amazing job on
> this task? What would they need to know to be able to get started?*

The 2026 corollary, from the May talk: put the right tokens in the window,
and only the right tokens.

## Beliefs about coding and complexity

- The job of a software engineer is to manage complexity.
- Agents can generate complexity faster than humans can manage it; the
  guardrails are the point.
- Being "in the code" still matters even when you are not typing every
  character. You need the deterministic checks and the felt sense of what
  is going on.
- Quality, testing, and operational readiness are not optional at scale.
  Independent deployment without contract, load, and benchmark gates is
  just faster breakage.

## Beliefs about leadership

- Hands-on coding is a feature, not a bug, of senior technical leadership.
  It preserves judgment, credibility, and signal. He did not stop coding
  when promoted to player-coach and did not stop when promoted to manager;
  it is a deliberate, defining choice.
- Grow your people. Retention and performance compound.
- Keep delivery commitments on time and at quality. Stability is a
  leadership move. Share good news fast, because
  people fill silence with the worst case.
- Write the business case for your own systems rather than waiting to be
  asked; much of the outcome is in the team's own hands.

## On competition and industry learning

Matt has written:

> I love all this competition. We all benefit.

> A lot of larger companies are sharing what they've been learning so far
> as they try out these technologies for the first time at large scale. We
> can learn from their mistakes, and discover what has truly worked in
> production.

## On why the decomposition work matters beyond one product

The decomposition work is justified by domain reusability across products.

## The books behind the operating system

Listed publicly: *The Obstacle Is the Way* (Stoic operating philosophy),
*Extreme Ownership* (ownership-based leadership), *Code Complete, 2nd
Edition* (software craftsmanship), *Multipliers* (being a leader who makes
others smarter, not smaller), *Turn the Ship Around!* (intent-based
leadership), and *Release It!, 2nd Edition* (production engineering and
resilience patterns).

The through-line: ownership-forward, intent-based, multiplier-style
leadership grounded in software craftsmanship and production resilience.
Delegate authority and context, hold to standards, and aim to grow people
rather than to be indispensable.
