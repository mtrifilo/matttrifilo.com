import type { Metadata } from 'next'
import { Star } from 'lucide-react'
import { openSourceRepos } from '@/content/open-source'
import { formatMonthYear } from '@/lib/format-date'
import { getOpenSourceProjects } from '@/lib/github'

export const metadata: Metadata = {
  title: 'Open Source',
  description: 'Open source projects by Matt Trifilo on GitHub.',
  alternates: { canonical: '/open-source' },
}

export default async function OpenSourcePage() {
  const projects = await getOpenSourceProjects(openSourceRepos)

  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-12 md:px-8">
        <h1
          className="font-bold mb-8"
          style={{ fontSize: 'clamp(1.75rem, 4vw + 0.25rem, 3rem)' }}
        >
          Open Source
        </h1>

        {projects.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing to show yet. See{' '}
            <a
              href="https://github.com/mtrifilo"
              className="text-primary underline underline-offset-2"
            >
              github.com/mtrifilo
            </a>
            .
          </p>
        ) : null}

        <ul className="space-y-6">
          {projects.map((project, i) => (
            <li
              key={project.repo}
              className="animate-fade-in-up border-b border-border pb-6 last:border-0"
              style={{ '--index': i } as React.CSSProperties}
            >
              <h2 className="text-xl font-semibold leading-tight">
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-muted-foreground transition-colors"
                >
                  {project.name}
                </a>
              </h2>
              <p className="mt-2 leading-relaxed text-foreground/90">
                {project.description}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {project.language ? <span>{project.language}</span> : null}
                {/* Hidden at zero, as GitHub's own repo cards do. */}
                {project.stars ? (
                  <span className="flex items-center gap-1 tabular-nums">
                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">Stars:</span>
                    {project.stars}
                  </span>
                ) : null}
                {project.pushedAt ? (
                  <span>
                    Updated{' '}
                    <time dateTime={project.pushedAt.slice(0, 10)}>
                      {formatMonthYear(project.pushedAt)}
                    </time>
                  </span>
                ) : null}
                {project.homepage ? (
                  <a
                    href={project.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors"
                  >
                    {project.homepage.replace(/^https?:\/\//, '')}
                  </a>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
