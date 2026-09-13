import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { JOB_TITLE } from '@/lib/seo/identity'

export const metadata: Metadata = {
  title: 'Résumé',
  description: `Résumé of Matt Trifilo, ${JOB_TITLE}. Download as PDF.`,
  alternates: { canonical: '/resume' },
}

/**
 * The PDF in public/ is rendered from the Markdown résumé source (outside
 * this repo) with the phone number and personal email removed; the public
 * contact is the site address. Replace the file to update; keep the name so
 * shared links stay valid.
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
        <a
          href={RESUME_PDF}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download the PDF
        </a>
      </div>
    </div>
  )
}
