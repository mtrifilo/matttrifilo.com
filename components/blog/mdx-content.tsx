import { MDXRemote } from 'next-mdx-remote/rsc'

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement>

// `#####` and `######` both land here (see the note below), so they share
// one definition rather than two copies that could drift apart.
const DeepestHeading = (props: HeadingProps) => (
  <h6 className="text-sm font-semibold uppercase tracking-wide mt-4 mb-2" {...props} />
)

// The page title is the only <h1> on a post page, so every markdown
// heading is demoted one level: `#` renders as <h2>, `##` as <h3>, and so
// on down to `#####` as <h6>. `######` has nowhere left to go and stays
// <h6>, styled the same. Authors can keep writing `#` for top-level
// sections; the outline never skips a level.
const components = {
  h1: (props: HeadingProps) => (
    <h2 className="text-2xl font-bold mt-6 mb-4" {...props} />
  ),
  h2: (props: HeadingProps) => (
    <h3 className="text-xl font-semibold mt-5 mb-3" {...props} />
  ),
  h3: (props: HeadingProps) => (
    <h4 className="text-lg font-semibold mt-4 mb-2" {...props} />
  ),
  h4: (props: HeadingProps) => (
    <h5 className="text-base font-semibold mt-4 mb-2" {...props} />
  ),
  h5: DeepestHeading,
  h6: DeepestHeading,
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="my-4 leading-relaxed" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors"
      target={props.href?.startsWith('http') ? '_blank' : undefined}
      rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      {...props}
    />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside my-4 space-y-1" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-inside my-4 space-y-1" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-4 border-muted-foreground/30 pl-4 my-4 italic text-muted-foreground"
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
      {...props}
    />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="bg-muted p-4 rounded-lg overflow-x-auto my-4 text-sm"
      {...props}
    />
  ),
}

interface MDXContentProps {
  source: string
}

export function MDXContent({ source }: MDXContentProps) {
  return <MDXRemote source={source} components={components} />
}
