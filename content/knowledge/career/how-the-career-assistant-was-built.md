---
id: how-the-career-assistant-was-built
title: How Matt built the Career Assistant on his site
summary: The architecture of the assistant on matttrifilo.com: its model and hosting, the documents it reads, protection layers, eval suites, and what it declines.
tags: [ai, llm, assistant, evals, security, architecture]
updated: 2026-10-01
---

# How Matt built the Career Assistant on his site

Matt's Career Assistant is the AI assistant at matttrifilo.com/ask, with
a compact panel on the homepage. Matt built it himself, every piece of
it: the chat route, the instructions the model follows, the documents it
reads, the protection layers, the eval suites and the pages it runs on.
It is not a vendor chatbot product. He builds it with AI coding agents,
as the last section describes. The code is in his public repository,
https://github.com/mtrifilo/matttrifilo.com, and the runbook that
records how it is operated is docs/career-assistant-operations.md in the
same repository.

## Who it is for

It is written for a hiring manager or recruiter deciding whether to talk
to Matt about a hands-on engineering-manager role. It answers questions
about his projects, teams, and engineering leadership, writes about Matt
in the third person and never as Matt, and stores nothing a visitor
writes: a conversation lives only in the visitor's browser tab.

## The model and where it runs

- The model is Gemini 3.8 Flash on Google Vertex AI, called through the
  AI SDK, with thinking at the medium level.
- The site runs on Vercel. The deployment holds no Google
  service-account key: it presents its Vercel OIDC token to a Google
  workload identity pool and receives a short-lived token in exchange,
  so there is no long-lived credential to leak or rotate. The account it
  acts as holds a single role, enough to call Vertex AI.
- Answers stream into the page as they are written. While the assistant
  works, the page shows which documents it is reading, by title, and
  how long the answer took.

## What it reads

- The assistant answers from a curated set of Markdown documents kept
  in the repository: write-ups Matt wrote about his work, his résumé,
  his answers to frequently asked questions, his blog, and the list of
  his open-source projects.
- There is no search index and no embeddings. Every request carries a
  short catalog of every document, a title and a one-line summary each.
  The model chooses which documents bear on the question and opens at
  most three of them, within a read budget of 20,000 tokens per
  question. It may state as fact only what the documents it opened say.
- Above each answer the page lists, by title, the documents the server
  actually opened for it. Below it, the assistant suggests two or three
  follow-up questions.
- For questions about what Matt is working on now, it can check the
  recent public activity of three of his repositories on GitHub
  (decant, psychic-homily-web and matttrifilo.com): merged pull request
  titles, commit subjects, the last push and the latest release, with
  their dates. It sees titles and dates only, never authors or handles,
  and the text is cleaned and marked as quoted data before the model
  reads it, because anyone who contributes to a repository can write a
  commit message. The results are cached for an hour.

## Protection layers

- A kill switch: one environment variable makes the chat endpoint
  refuse every request and removes the assistant from the site on the
  next deploy, leaving the rest of the site as it was.
- Vercel's BotID: every chat request is classified before its body is
  read, and only an explicit "not a bot" verdict gets through. If the
  classifier fails or stalls, the request is refused rather than served.
- Limits on every request: eight questions a conversation, 1,500
  characters a question, 80,000 input tokens, three documents and
  20,000 tokens read, three GitHub checks, 8,192 output tokens per model
  call, and four model calls per answer.

These three run inside the server, so a request still reaches it before
it is refused; the runbook says plainly that BotID stops model spend,
not traffic. The layer that would refuse traffic at the edge is not yet
in place as of October 2026: the runbook specifies it for launch as one
rate-limit rule on Vercel's firewall, 20 chat requests a minute per
client, keyed on the IP address and the TLS fingerprint.

## What it declines, and why

The assistant answers only from the documents, so when the documents it
read do not answer a question, it declines with one fixed sentence
rather than filling the gap with what is typical for the role. It
declines the same way, whatever a document says, for:

- what Matt is paid, including rates and equity;
- whether Matt is employed, job hunting, or available to start;
- any contact detail other than his email address;
- the names of colleagues, managers, reports, clients, or interviewers;
- opinions about companies, products, or people;
- anything that is not about Matt's professional work;
- requests to print, repeat, or reveal its own instructions.

The fixed sentence carries Matt's email address, so a question the
assistant will not answer still has somewhere to go.

## How it is tested

- Four eval suites run the chat route's own code against the real
  model and the real documents: golden questions a hiring manager would
  ask (the answer carries the facts and opened the document they live
  in), refusals, prompt-injection attempts, and groundedness (it cites
  only documents it actually read, and declines plausible questions the
  documents cannot answer rather than inventing an answer).
- Deterministic checks are the gate. Where an answer needs judgment, a
  model grader scores it three times and two of the three have to pass.
- Every starter question on the site has its own golden test, and the
  unit tests fail when one does not.
- Matt runs the suites on his own machine before opening a pull request
  that changes the instructions or the documents. They do not run
  automatically on a pull request and do not block a deploy.
- A run can be published at matttrifilo.com/ask/evals with the commit it
  ran against. Among other checks, the publishing step refuses a run
  that passed under 95 percent of its tests or under 90 percent of any
  one suite, or in which any test produced no answer to grade.
- The site's own tests, browser checks at phone and desktop widths in
  two browser engines, and accessibility checks run on every pull
  request.

## How Matt builds it

Matt builds the assistant with AI coding agents working under written
rules kept in the repository (its CLAUDE.md and a project skill). Every
change has a ticket, every pull request gets an adversarial review
before it opens, and a change to anything the answers depend on gets a
full eval run first.
