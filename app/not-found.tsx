import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center px-4">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Page not found.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 text-sm border border-border rounded hover:bg-muted transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
