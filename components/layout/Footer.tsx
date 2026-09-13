import Link from 'next/link'
import { Github, Linkedin, Mail } from 'lucide-react'
import { CopyrightYear } from './copyright-year'

export default function Footer() {
  // Server component: evaluated at build time, so this is the year that
  // ends up in the static HTML. CopyrightYear corrects it on the client.
  const prerenderedYear = new Date().getFullYear()

  return (
    <footer className="w-full border-t border-border/30 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>
            &copy; <CopyrightYear prerenderedYear={prerenderedYear} /> Matt
            Trifilo
          </p>
          <nav className="flex items-center gap-4">
            <Link
              href="https://github.com/mtrifilo"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </Link>
            <Link
              href="https://linkedin.com/in/matttrifilo"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-4 w-4" />
            </Link>
            <Link
              href="mailto:hi@matttrifilo.com"
              className="hover:text-foreground transition-colors"
              aria-label="Email"
            >
              <Mail className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
