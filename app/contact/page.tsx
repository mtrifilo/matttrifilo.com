import type { Metadata } from 'next'
import { Github, Linkedin, Mail } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Matt Trifilo.',
}

const contactLinks = [
  {
    href: 'mailto:hi@matttrifilo.com',
    label: 'hi@matttrifilo.com',
    icon: Mail,
    description: 'Send me an email',
  },
  {
    href: 'https://github.com/mtrifilo',
    label: 'github.com/mtrifilo',
    icon: Github,
    description: 'Check out my work',
    external: true,
  },
  {
    href: 'https://linkedin.com/in/matttrifilo',
    label: 'linkedin.com/in/matttrifilo',
    icon: Linkedin,
    description: 'Connect with me',
    external: true,
  },
]

export default function ContactPage() {
  return (
    <div className="flex min-h-screen items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-12 md:px-8">
        <h1
          className="font-bold mb-4"
          style={{ fontSize: 'clamp(1.75rem, 4vw + 0.25rem, 3rem)' }}
        >
          Contact
        </h1>
        <p className="text-muted-foreground mb-8">
          Want to get in touch? Reach out through any of the channels below.
        </p>

        <div className="space-y-4">
          {contactLinks.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              className="contact-card animate-fade-in-up flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
              style={{ '--index': i } as React.CSSProperties}
            >
              <link.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              <div>
                <div className="font-medium group-hover:text-primary transition-colors">
                  {link.label}
                </div>
                <div className="text-sm text-muted-foreground">
                  {link.description}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
