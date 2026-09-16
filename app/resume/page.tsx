import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JOB_TITLE } from '@/lib/seo/identity'
import { MDXContent } from '@/components/blog/mdx-content'
import { getResumeMarkdown } from '@/lib/resume'

export const metadata: Metadata = {
  title: 'Résumé',
  description: `Résumé of Matt Trifilo, ${JOB_TITLE}. Download as PDF.`,
  alternates: { canonical: '/resume' },
}

/**
 * The PDF in public/ is a redacted export of the private Markdown résumé:
 * regenerate it with `scripts/render-resume.sh <path-to-.md>`, which strips
 * the phone number and prints via headless Chrome. lib/resume-pdf.test.ts asserts the published
 * file stays clean and stays two pages. Keep the filename so shared links
 * survive updates.
 */
const RESUME_PDF = '/Matt-Trifilo-Resume.pdf'

export default function ResumePage() {
  const markdown = getResumeMarkdown()

  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-12 md:px-8">
        <h1
          className="font-bold mb-4"
          style={{ fontSize: 'clamp(1.75rem, 4vw + 0.25rem, 3rem)' }}
        >
          Résumé
        </h1>
        <p className="text-muted-foreground mb-8 max-w-2xl leading-relaxed">
          Full résumé below, or download the two-page PDF. Questions?{' '}
          <a
            href="mailto:matt.trifilo@gmail.com"
            className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors"
          >
            Email me
          </a>
          .
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <a href={RESUME_PDF} download="Matt-Trifilo-Resume.pdf">
              <Download aria-hidden="true" />
              Download the PDF
            </a>
          </Button>
          {/* The assistant exists for the depth two pages cannot hold, and
              this page is where that depth is missed (MTC-33). */}
          <Button asChild variant="outline">
            <Link href="/ask">
              <Sparkles aria-hidden="true" />
              Ask about my work
            </Link>
          </Button>
        </div>

        {/* Same Markdown the PDF is rendered from; see scripts/render-resume.sh. */}
        <article className="mt-12 border-t border-border pt-8 text-base leading-relaxed">
          <MDXContent source={markdown} />
        </article>
      </div>
    </div>
  )
}
