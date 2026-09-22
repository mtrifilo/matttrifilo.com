---
id: ai-email-engagement-summary
title: The AI Email Engagement Summary, from proof of concept to every user
summary: How Matt proposed and built one of the product's first LLM features, with the timeline, stack decisions, eval discipline, and known gaps.
tags: [ai, llm, gemini, rag, promptfoo, evals]
updated: 2026-09-21
---

# The AI Email Engagement Summary, from proof of concept to every user

The same arc as the Merge API decomposition, on a compressed timeline.
Counting only the time the work was in Matt's hands: a proof of concept in
one week; from build kickoff to a production beta in about five weeks; and
100 percent of users two months after kickoff. Seven weeks between the
finished proof of concept and the green light were a prioritisation
decision, not build time, and Matt is explicit that they should not be
counted as delivery.

## The problem the feature answers

The product already showed small-business senders their bounce rate,
complaint rate, average engagement age, and a distribution of contacts by
how recently they had engaged. What it did not do was explain what those
numbers meant or what to do next. A confused sender was more likely to
file a support ticket than to fix the underlying list-hygiene problem, and
the mailbox providers that bounce mail sent to long-dormant contacts do
not wait for anyone to catch up. The 2023 bounce- and complaint-details
pages were the first attempt at that explanation; this feature is the
second.

## The proposal, August 2025

Matt proposed three experiments in the company's AI projects forum:

1. An AI analysis and summary of a user's current email-engagement data,
   with recommended actions, on the engagement details page. Estimated at
   about a week to prototype.
2. A chatbot for users to ask questions about their engagement and how to
   fix problems, grounded in the product's documentation, playbooks, and
   proven re-engagement campaigns. About a sprint.
3. A single speedometer-style engagement score, on the model of a credit
   score, to replace several dashboard health scores, with a brief AI
   summary. About a sprint.

Goals were defined before any code:

- implement rapid prototypes to start testing as experimental betas;
- productionise the betas that prove traction, **even if that involves a
  full rewrite**;
- throw away the experiments that do not gain traction and move on.

## Stack decisions, and why

- **Gemini Flash Lite on Vertex AI**, a Cloud Run service, and Vector
  Search, chosen deliberately for cheap, throwaway-ready iteration over the
  more "production-ready" Java and Kubernetes path.
- The front end sat behind a feature flag on the engagement details page of
  the legacy product's dashboard.
- A threat-model analysis was ticketed up front, before the build.
- The proof of concept used a local Postgres vector store, local embeddings,
  local markdown files, and manual indexing. The production build replaced
  every one of those: the managed Vertex AI RAG engine, documents in cloud
  storage, managed embeddings, and an automated daily sync of help-centre
  articles. Matt wrote that table of differences into the plan before
  building, so "productionise, even if that means a rewrite" was a stated
  expectation rather than a surprise.
- The service reads the engagement data the monolith already fetches from
  two internal reporting services, aggregates it, and posts it to a
  streaming analysis endpoint. No new data pipeline was built for the beta.

## Timeline

- **October 2025, one week:** proof of concept implemented and shared with
  a demo video.
- **October to December 2025, about seven weeks:** waiting on a
  prioritisation decision. No beta work was approved.
- **December 2025:** green light. A research spike on a viable RAG approach
  over the help-centre articles, plus the beta deployment strategy,
  resolved in early January with a written summary: architecture, a cost
  model, a four-to-five-week plan, and an explicit "determine if this
  feature is viable; if not, throw it out" goal.
- **January 2026:** beta build kickoff. A skeleton service was up for
  review the same day; the analysis endpoint, service-to-service security,
  cloud infrastructure, RAG storage, backend SDK, and UI tickets followed
  within two days. Deployed to the integration environment at the end of
  January.
- **February 2026, five weeks from kickoff:** beta in production behind a
  feature flag, then released to an initial cohort of about 110 active
  users. A model upgrade shipped the same week, and the first Promptfoo
  eval was merged.
- **March 2026, two months from kickoff:** the flag raised to 100 percent
  of users in production to gather feedback, at product leadership's
  direction.
- **September 2026:** the rapid-experiment epic closed.

## Follow-through, in order

- Fixed the model hallucinating bounce and complaint rates, and added
  numerical-accuracy evals.
- Moved the production model to a newer Gemini Flash release at its minimal
  reasoning level after evals showed full correctness and average latency
  falling from about 20 seconds to about 9. It was promoted through
  integration, staging, and production with testing at each stage.
- Curated a directory of help-article links to stop hallucinated links.
- Ran a head-to-head eval of the next Gemini Flash release the day after
  its general availability: zero correctness failures across thirty cases,
  with the minimal-reasoning variant clearing the twenty-second latency
  gate.
- Audited the eval suite itself and wrote up what it did not cover. The
  five original cases all varied one axis, the metric values, and held
  everything else constant; they tested numerical fidelity on well-formed
  input. Matt proposed behavioural personas the suite was blind to: a
  brand-new sender with no history at all (does the model invent metrics or
  pivot to onboarding advice?), a sender in crisis well above every
  threshold (does it under-react or catastrophise?), and input shapes
  outside the well-formed happy path. His stated standard: coverage that
  surfaces real failure modes before customers do, not test count for its
  own sake.
- A designer refreshed the beta's UI twice; "designed" in Matt's claim
  refers to the system and the stack, not the visual design.
- Prototyped a multi-turn chat experience over the same RAG corpus, reusing
  the existing infrastructure rather than standing up new infrastructure; it
  remains an experiment rather than a shipped feature.

## Known gap

No financial return-on-investment figure or adoption metric has been
produced for this feature yet. Matt names this openly as the next piece of
analysis to do.

## Why this thread matters

Proof that the hackathon-to-production pattern scales to LLM work.
Throw-away versus productionise criteria were defined before writing code,
the rewrite from prototype to production stack was planned rather than
discovered, and the model-upgrade discipline, eval first and then switch,
is one other teams can copy.
