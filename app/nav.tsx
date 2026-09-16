'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { ModeToggle } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { visibleSiteRoutes } from '@/lib/site-routes'

export default function Nav({
  assistantDisabled,
}: {
  /** Read from the environment by the layout; this is a client component. */
  assistantDisabled: boolean
}) {
  // Shared with the sitemap so a new page cannot be added to one and
  // forgotten in the other.
  const navLinks = visibleSiteRoutes({ assistantDisabled })
    .filter(route => !route.hideFromNav)
    .map(({ href, label }) => ({ href, label }))
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      data-scrolled={scrolled}
      className={cn(
        'sticky top-0 z-50 flex w-full items-center justify-between px-4 py-3 transition-[backdrop-filter,background-color,box-shadow] duration-200',
        !scrolled && 'border-b border-border/30'
      )}
    >
      <div className="flex items-center gap-5">
        <Link
          href="/"
          className="flex-shrink-0 text-lg font-semibold hover:opacity-80 transition-opacity"
        >
          Matt Trifilo
        </Link>

        {/* Desktop Navigation */}
        {/* Seven links no longer fit beside the brand at md (768px); switch at lg. */}
        <div className="hidden lg:flex items-center gap-1">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap hover:bg-muted/50 hover:text-primary transition-colors',
                pathname === link.href && 'bg-muted/50 text-primary'
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ModeToggle />

        {/* Mobile Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[300px] sm:w-[400px] border-l-border/50"
          >
            <SheetHeader>
              <SheetTitle className="text-left">Menu</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 mt-8">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'text-lg font-medium px-4 py-3 rounded-lg hover:bg-muted/50 hover:text-primary transition-colors',
                    pathname === link.href && 'bg-muted/50 text-primary'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
