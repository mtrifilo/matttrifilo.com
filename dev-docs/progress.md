# matttrifilo.com — Build Progress

## Phase 1: Project Init & Config
- [x] Initialize Next.js with bun
- [x] Install dependencies (gray-matter, next-mdx-remote, next-themes, lucide-react, cva, clsx, tailwind-merge, geist, tw-animate-css)
- [x] next.config.ts — security headers, optimizePackageImports
- [x] vercel.json — framework, bun install/build
- [x] components.json — shadcn new-york, slate, CSS vars
- [x] .prettierrc — match PH conventions
- [x] postcss.config.mjs — @tailwindcss/postcss

## Phase 2: Theme, Layout Shell & Navigation
- [x] app/globals.css — Tailwind v4, light slate defaults, cool blue dark mode
- [x] lib/utils.ts — cn() helper
- [x] Install shadcn components (button, card, sheet)
- [x] components/layout/theme-provider.tsx
- [x] components/layout/mode-toggle.tsx
- [x] app/layout.tsx — root layout with Geist fonts, ThemeProvider, Nav, Footer, metadata, PersonSchema
- [x] app/nav.tsx — desktop + mobile Sheet nav (Home, Blog, Contact, ModeToggle)
- [x] components/layout/Footer.tsx — copyright + social links

## Phase 3: Blog System
- [x] content/blog/ directory
- [x] lib/types/blog.ts — BlogPostFrontmatter, BlogPost, BlogPostMeta
- [x] lib/blog.ts — filesystem blog (getBlogSlugs, getBlogPost, getAllBlogPosts, etc.)
- [x] components/blog/mdx-content.tsx — MDXRemote with styled elements
- [x] app/blog/page.tsx — listing page
- [x] app/blog/[slug]/page.tsx — individual post with generateStaticParams, generateMetadata, BlogPostingSchema
- [x] content/blog/2026-02-14-hello-world.md — sample post
- [x] scripts/new-blog-post.ts — CLI scaffolding tool

## Phase 4: SEO Infrastructure
- [x] lib/seo/jsonld.ts — PersonSchema, BlogPostingSchema
- [x] components/seo/JsonLd.tsx — script tag renderer
- [x] app/sitemap.ts — static pages + blog slugs
- [x] app/robots.ts — allow all, point to sitemap

## Phase 5: Content Pages
- [x] app/page.tsx — hero, latest posts, social links
- [x] app/contact/page.tsx — email, GitHub, LinkedIn links
- [x] app/not-found.tsx — 404 page

## Phase 6: Polish & Deploy
- [x] Favicon (default from create-next-app, replace with custom later)
- [ ] Default OG image (public/og-image.jpg) — needs design asset
- [x] Test build: `bun run build` — all routes compile, static blog generated
- [x] Verify: all pages render, blog generates, sitemap/robots work, titles correct
- [ ] Deploy to Vercel
