---
title: "The End of the Software Developer Role.\nA Message of Hope."
date: '2026-03-01'
description: 'The End of the Software Developer Role. A Message of Hope.'
---

We are deep in an inflection point like I've never experienced before. The closest comparison I can remember is when the [personal computer](https://medium.com/@madmedic11671/behind-the-spots-the-story-of-gateway-computers-ce3263bcd07f) became affordable to the middle class in the late 90's.

I'll never forget when my Mom drove middle school me to three libraries around Milwaukee's suburbs to find the books I needed for homework, because my classmates had gotten there first, and checked out all of them. [I wrote that paper with a pencil. On paper.](https://www.youtube.com/watch?v=q8L86Z8YgeQ)

I had used computers before at school for Computer Class, where we played [Oregon Trail](https://oregontrail.ws/games/the-oregon-trail/), [Number Munchers](https://classicreload.com/number-munchers.html), and learned to type, but I never knew of actual software that wasn't for middle school kids.

Suddenly, I was playing [Starcraft](https://github.com/TheEngineeringBay/Awesome-Broodwar-Resources) multiplayer with people from all over the world. I never needed [encyclopedias](https://www.encyclopedia.com/) or [dictionaries](https://www.merriam-webster.com/) again. I could research online for my homework, and stop writing with pencil. I could chat with friends. Even troubleshooting all the [Windows 98](https://98.js.org/) software slop was exciting, and felt like a sci-fi dream.

As I grew older and [fell in love with music](https://wfmu.org/), I found that computers could help me [discover artists and records](https://bandcamp.com/) I would have never been able to find or hear otherwise. I encountered the world beyond my immediate surroundings thanks to computers and the Internet.

# What we're living through right now is bigger than the Personal Computer, the digitization of information, and the Internet itself.

We now have LLMs that can automate most information work, and a lot of physical work too. Not "one day", right now. The transition has already started, and will escalate. Computer use has been dominating AI discussions lately, but consider what [Waymo](https://waymo.com/) is doing right now to [Uber](https://www.uber.com/us/en/u/waymo-on-uber/) and [Lyft](https://investor.lyft.com/news-events/press-releases/detail/89/lyft-and-waymo-launch-partnership-to-expand-autonomous-mobility-to-nashville). Amazon warehouses have [fleets of AI robots](https://www.aboutamazon.com/news/operations/new-robots-amazon-fulfillment-agentic-ai). Drones are [delivering packages](https://smartdev.com/ai-and-autonomous-drones-transforming-delivery-and-transportation/). You may have seen [robots delivering food](https://www.starship.xyz/) in your neighborhood.

This sea change includes most software implementation work, which was my primary role for the first two+ years of my career. "Implementation" is the key word, since these models have been trained on the majority of implementation detail work that is common for most applications. Most enterprise software has common, repeatable patterns. A data layer, service layer, adaptors for many consumers, and UIs to allow end users to use the system in a delightful way.

# The complexity varies, but the patterns repeat.

Most of this data plumbing and composition has been solved, and implemented, millions of times, in millions of codebases, to solve millions of different, evolving problems.

All publicly available code is likely in the training of every major LLM. Soon, the free, small, open source models that [can run on a laptop](https://venturebeat.com/technology/alibabas-new-open-source-qwen3-5-medium-models-offer-sonnet-4-5-performance) will be as capable as the State Of The Art models of today. Claude Opus 4.6 High Effort, and GPT-5.3 Codex High and Extra High. I bet this will happen before 2027, and I bet these models will be running locally on our phones in a few years.

On the Monday before the US's Thanksgiving holiday three months ago, November 24th, 2025, Anthropic made an announcement that became the moment software engineering would change forever. [Enter Opus 4.5](https://x.com/claudeai/status/1993030546243699119).

Everyone knew this moment was coming, but no one knew how or when. Now we know, and it has already happened.

The [benchmarks](https://x.com/claudeai/status/1993030546243699119) were fine. Boring even. Every new model showed modest improvements in the benchmark numbers in 2025, and they all were sold as "The best model in the world".

# In this case, Anthropic was [absolutely right](https://github.com/anthropics/claude-code/issues/3382).

In my own experience trying Opus 4.5, it was immediately my new go-to for coding. It would just work, and work elegantly for coding areas that Sonnet 4.5 failed at. I started giving Opus larger function tasks in one prompt. Then complete unit test suites for new [Java](https://aws.amazon.com/what-is/java/) and [JavaScript](https://deno.com/blog/deno-v-oracle) files. Then a complete Python backend microservice for an AI feature POC. Then a complete backend SDK generation and implementation spanning multiple modules with auth for that new microservice.

While these weren't "one-shot" implementations, I was able to build out not just features, but small systems with a few Opus sessions within a few hours that would have taken me multiple days or even weeks pre-AI. It was difficult to find the limits of Opus 4.5, though it did reveal its imperfections eventually.

Opus 4.5 was very good at unblocking itself, so it would go off the rails at times if you didn't monitor what it was doing. Instead of reworking a failed terminal command, it would try writing a small python application as a workaround. It would miss obvious, important details that other models would catch easily. It was very token hungry, and could eat up all its context before writing its plan doc. All of those limitations were easily solved by managing context intentionally.

After getting to know the model well, I learned exactly how to scope tasks for Opus, just like how I scope tasks for myself and other human engineers depending on their level and skillset.

# The new bottleneck today is how fast humans can make decisions, and how fast we can review and test the code.

Yes, you **must** still read and test production code if real human users depend on it for their livelihood. [Don't repeat GitHub's mistakes](https://getsecureslate.com/blog/what-the-github-outage-taught-us-about-resilience-and-compliance-2026).

With Opus 4.5's constraints in mind and solved, you could suddenly treat it like a collaborator. You could be the "Tech Lead" delegating well-defined and scoped tasks to a highly intelligent and capable LLM engineer that could generate a working implementation in one shot, as long as the [scoping and planning was well thought out first](https://www.barnesandnoble.com/w/code-complete-steve-mcconnell/1100354307). Any issues were usually small enough to correct with one or two follow up prompts. If issues were worse than that, the problem was generally my fault for not providing the exact details the LLMs need for the task. Every word in a prompt matters, and will steer the output in significant ways.

With the latest models, I've now been learning to ask the model what workflows and specs would work best for them, not me. The current frontier I'm exploring is how to create LLM-first codebases and LLM-first documentation. If the LLM can't navigate a codebase well, that's a sign that the codebase should be refactored to work better for LLMs, not humans. Code comprehension is still essential for humans, but the organization and structure of the code can be designed intentionally to work well for LLMs with a limited context budget. That's the constraint of today. That may change with the next generation of models. We need to be willing to learn and adapt in real time.

# The ongoing speed and scale of these advancements are where companies have a generational challenge to navigate.

Much of the expense of the physical and mental practice of writing code using a keyboard has been erased. And fast. I mean since Thanksgiving 2025. [It already happened](https://metr.org/).

It will take years for the majority of engineers and companies to fully process and adapt to this new reality. Everyone will need to learn how to trust and use these LLMs at the new ceiling of their capabilities. And that's only considering the current state of the art models, not the next ones that will be released within months.

Model improvements will [continue to accelerate](https://openai.com/index/introducing-gpt-5-3-codex/), and the State Of The Art models right now are **the worst they'll ever be**, as many much smarter people have said. New model releases will likely continue to see [logarithmic improvements](https://metr.org/) in intelligence and capability. Perhaps within weeks, or even already if you're reading this in the future.

[This](https://www.linkedin.com/pulse/mourning-developer-why-your-engineers-secretly-grieving-noah-lindner-nprec/) [is](https://kvz.io/blog/2026-01-21-ai-grief) [already](https://dev-tester.com/my-five-stages-of-ai-grief/) a [mourning](https://nolanlawson.com/2026/02/07/we-mourn-our-craft/) [process](https://newsletter.pragmaticengineer.com/p/when-ai-writes-almost-all-code-what) for developers. I went through the gamut of emotions as I realized the [craft I love](https://github.com/mtrifilo/notes-wiki/wiki), and devoted years of my life to, has now been abstracted away. LLMs can now produce better production code than I'd ever be capable of writing myself given the time constraints of real-world company goals. I've lost sleep, I've doom scrolled the internet looking for answers that no one can possibly know. Even AI researchers have no idea what this will lead to in the coming years.

No one knows, and anyone who claims to know is [probably an AI CEO praying to go viral to gain investor attention for the next fundraising round](https://x.com/mattshumer_/status/2021256989876109403). All of my speculations in this post are wild guesses, except for what has already happened which is more than enough to change the global economy.

After the mourning period, I thought about this from a different perspective.

# _Why_ do I love to code?

Is it because I like seeing the compiler show clean builds? Good performance metrics? High test coverage? Elegant system implementations for architectures with many domains? Contributing to systems that process hundreds of millions of requests per month?

I love all of those challenges, and I miss getting lost in flow states for hours late at night fighting build failures, waterfalls of red error states in the logs, and solving problem after problem while learning new things all the time. It's addictive, and this was my superpower.

This was millions of developers' superpower. This was such a superpower that I accepted my first software engineering job offer behind the dumpster of a coffee shop in Chicago while shift-leading that day. I walked out the back door to take out the trash, and by the time I walked back in, my life had fundamentally changed.

I had no CS degree (still don't), professional tech industry experience, or any credentials beyond a [Free Code Camp](https://www.freecodecamp.org/) [certificate](https://www.freecodecamp.org/certification/mtrifilo/legacy-front-end) and a Liberal Arts bachelor's degree. What I did have was a dream that felt more real than my actual life, and many working [open source app demos](https://github.com/mtrifilo/FCC-vote?tab=readme-ov-file) hosted on my website at the time that came from hundreds of hours late night coding marathons.

Behind that dumpster on a sunny spring day, I was given an offer to be an SEI that not only paid more than triple my pay as a barista, but was beyond my dream junior developer role. Instead of working on old, legacy jQuery or PHP web app code, I was brought onto a team building one of the company's first VueJS web applications, alongside some of the most talented engineers I've ever encountered, some of whom I still work with to this day.

My first PR's got ripped to shreds with 60+ comments and I was so grateful. They held nothing back, and treated me no different than any other professional engineer from the start, enforcing the highest standards for quality and code style. They would pull me into pair sessions when they'd see me mis-using git. They showed me how to turn my IDE into an extension of my hands so I could fly through giant codebases effortlessly. They molded me into the engineer I would later become. I am incredibly lucky and grateful to have had that experience, and that team, for my introduction to the tech industry. I was saved from learning bad habits at other companies with lower standards.

Timing-wise, I was fortunate to ride the early wave of the [tech hiring frenzy in the late 2010's](https://newsletter.pragmaticengineer.com/p/perfect-storm-causing-a-hot-tech-hiring-market). Companies were betting on future growth, and building large engineering orgs to absorb user growth before it materialized. This required a lot of hands on many keyboards. If I was in the same situation a decade earlier, I may not have been hired at all.

I learned to code on an old, cheap laptop running [Linux](https://xubuntu.org/) and free developer tools. I owe my career to open source software. I'm sure millions of people can say the same.

Now after almost 9 years, I see how my mentors saw me at the time. Some thought hiring me would be a mistake, others saw potential worth investing in based on my projects online, that leveraged the bleeding edge frameworks well. I've hosted interviews with SEI and SEII candidates without seeing any projects they've shipped online. Not even once. Demonstrable [agentic engineering](https://addyosmani.com/blog/agentic-engineering/) skills are the next frontier where we can spot emerging potential.

Junior Engineers in 2026, listen up. If you have anything online you've built with high test coverage, pleasant UX without bugs, and clear evidence you can wield AI tools effectively, you will rise above all the other candidates at your level not demonstrating their AI skills. Maybe not right away, but one day a hiring manager will actually look at what you've shipped and how, and they will move mountains to hire you.

# Ownership, curiosity, persistence and a willingness to take initiative on efforts and goals you care about are rare, exceptional traits.

[Anyone can learn how to code](https://www.youtube.com/watch?v=thkDWSUzQDo), and anyone can learn Agentic Engineering. Anyone can set themselves up for success in this new reality.

[Play](https://openclaw.ai/). Experiment. [Build things](https://github.com/steipete). Build harder things. Push these tools to their limits. Beyond their limits. Push the tools even further and faster than you may think is responsible to see where they truly break. Get into situations where they can do things you'd never imagined possible by LLMs. Have an open mind, and remove any assumptions you've formed about LLMs from last year. The latest models are a different beast, and I had to re-learn everything about LLMs this year, because the latest models changed everything.

The hard truth to acknowledge is that the Software Developer role (typing code on a keyboard by hand with no involvement in Product planning) is going extinct, just like [punch-card operator](https://www.youtube.com/watch?v=YnnGbcM-H8c) roles went extinct.

The people themselves won't disappear, but will be transitioning to agentic engineering roles and responsibilities, and will likely be orchestrating many coding agents at once very soon. I'm sure many companies are already considering new job titles to reflect this new reality.

Those who embrace this change will be very successful. Those who decide not to learn [agentic engineering](https://addyosmani.com/blog/agentic-engineering/) may decide to [leave the industry](https://sfstandard.com/2026/02/19/ai-writes-code-now-s-left-software-engineers/) altogether. Some have already left the industry over AI, and this trend will continue. For those who choose to take on this [new challenge](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf), there is a lot to look forward to. These are truly historic times that will be reflected on for decades. People are building software today they never dreamed could be possible by one person in just a weekend. People are replacing software subscriptions with self-hosted, custom applications built for their specific needs.

If you're only typing code that your team asks you to type, it's time to learn [agentic engineering](https://addyosmani.com/blog/agentic-engineering/), and how to collaborate on building products. Today. Not tomorrow, next month, or only when your leaders make these tools required.

By the time most [companies](https://www.cnbc.com/2025/04/07/shopify-ceo-prove-ai-cant-do-jobs-before-asking-for-more-headcount.html) [mandate](https://fortune.com/article/duolingo-ceo-says-getting-rid-of-contract-employees-replacing-them-with-ai/) [this](https://www.metaintro.com/blog/jack-dorsey-block-layoffs-ai-mandates-employee-backlash-2026), it may already be too late for those who don't learn these new tools. The gap is widening every day between devs who've been using AI to generate code for months, and those who refuse to trust agents for code generation.

There will always be a place for writing code by hand, but for most industrial code bases at big companies, agentic engineering is already becoming the norm for the countless tasks that can be automated away.

# Nothing can stop this change.

The good news for junior engineers is they now have access to the greatest and smartest teacher for coding, system design, data structures, and algorithms in history. Be sure to only use the latest, most powerful models. Don't bother with the free plans, or models from last year. Consider this tuition at a steep discount.

Leverage them all the time. The latest LLMs can teach junior engineers to build and deliver software better than most universities. Maybe all of them. They can teach better than any Senior engineer who only has a few minutes between tasks and meetings. These AI tools can cater to anyone's specific style of learning, and craft a bespoke learning roadmap that focuses only on what's essential for **you**. Not your classmates, and not a vague audience of thousands of people at varying levels and paid-tiers.

If junior engineers use their fresh perspective and foresight using these bleeding edge AI harnesses and LLMs to master agentic engineering workflows, and automations for the [SDLC](https://aws.amazon.com/what-is/sdlc/) **before** larger corporations and many of Senior Engineers still in denial can, the Juniors will absolutely be in the highest demand in the job market. This applies to anyone in any white collar industry involving a computer. The biggest challenge will be for junior engineers to learn proper code comprehension and patterns for large code bases. "[Vibe Coding](https://x.com/karpathy/status/1886192184808149383?lang=en)" is not going to be acceptable. [Agentic Engineering](https://x.com/karpathy/status/2019137879310836075?s=20) is about understanding everything the LLM is outputting, and driving the implementation. Not blindly trusting the outputs and hoping for the best.

If you're worried about AI taking your job, then transform your job into an AI orchestrator role before your company decides for you how your role should change. Own that for your own role, and your company will listen if they're smart. They'll hopefully be grateful for your initiative as a front-line expert, telling them how your role can be greatly enhanced with AI workflows. The productivity gains you'll see will make you one of the most valuable workers in the economy.

# That is, until everyone else catches up.

This is your window. Right now, as of early 2026. We're only 3 months in. Truly. We are still very early. Seize the head-start today, because it won't last forever. This transition will probably take years, but the sooner talented people take action, the more opportunities will be discovered early. Most industries are investing everything into catching up as fast as possible with the bleeding edge tech companies already orchestrating AI workflows at scale.

My own window for breaking into this industry was back in 2016 and 2017. While most companies were still using jQuery and PHP, I learned to build full stack React [MERN](https://www.mongodb.com/resources/languages/mern-stack) web apps with working demos in production, complete with unit tests. That might be the only reason I had interviews from tech startups and larger SaaS companies in between cleaning coffee shop bathrooms, mopping floors, and pouring latte art for regulars as my day job in 2017. That window [slammed shut in 2022](https://x.com/DonMiami3/status/2027176231561539791) when the tech hiring spree ended abruptly. Now, I believe that window [has opened again](https://x.com/DavidSacks/status/2027087693327237251).

If this window can help you, then today is the day to get to work.
