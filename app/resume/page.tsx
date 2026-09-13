import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JOB_TITLE } from '@/lib/seo/identity'

export const metadata: Metadata = {
  title: 'Résumé',
  description: `Résumé of Matt Trifilo, ${JOB_TITLE}. Download as PDF.`,
  alternates: { canonical: '/resume' },
}

/**
 * The PDF in public/ is a redacted export of the private Markdown résumé:
 * regenerate it with `scripts/render-resume.sh <path-to-.md>`, which strips
 * the phone number, swaps the personal email for the site address, and
 * prints via headless Chrome. lib/resume-pdf.test.ts asserts the published
 * file stays clean and stays two pages. Keep the filename so shared links
 * survive updates.
 */
const RESUME_PDF = '/Matt-Trifilo-Resume.pdf'

export default function ResumePage() {
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
          {JOB_TITLE}. Two pages, PDF. For anything not covered there,{' '}
          <a
            href="mailto:hi@matttrifilo.com"
            className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors"
          >
            email me
          </a>
          .
        </p>
        <Button asChild variant="outline">
          <a href={RESUME_PDF} download="Matt-Trifilo-Resume.pdf">
            <Download aria-hidden="true" />
            Download the PDF
          </a>
        </Button>
      </div>
    </div>
  )
}
