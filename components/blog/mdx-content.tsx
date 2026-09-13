import { MDXRemote } from 'next-mdx-remote/rsc'

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement>

// Every markdown heading is demoted one level: the page title is the only
// <h1>, so `#` renders as <h2>, `##` as <h3>, `###` as <h4>, `####` as
// <h5>, and `#####` and `######` both land on <h6>. Authors keep writing
// `#` for top-level sections; the outline never skips a level.
//
// `#####` and `######` render as small uppercase labels rather than titles:
// at that depth a heading marks a sub-group within a section (the résumé's
// "Team and delivery" bullets under a role, say). One shared definition
// keeps the two from drifting apart.
const labelHeadingClass =
  'text-sm font-semibold uppercase tracking-wide text-muted-foreground mt-6 mb-2'

const DeepestHeading = (props: HeadingProps) => (
  <h6 className={labelHeadingClass} {...props} />
)

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
  // `####` is a run-in title such as a résumé role line: body size, bold,
  // and a larger top margin than the labels beneath it so the gap between
  // two roles reads wider than the gap between a role's sub-groups.
  h4: (props: HeadingProps) => (
    <h5 className="text-base font-semibold mt-8 mb-2" {...props} />
  ),
  h5: DeepestHeading,
  h6: DeepestHeading,
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="my-4 leading-relaxed" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    // Off-site links open in a new tab; the site's own absolute URLs and
    // relative links stay in this tab.
    const external =
      !!props.href &&
      /^https?:\/\//.test(props.href) &&
      !/^https?:\/\/(www\.)?matttrifilo\.com/.test(props.href)
    return (
      <a
        className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors"
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        {...props}
      />
    )
  },
  // Preflight zeroes list padding, so `pl-6` (not the browser default) is
  // what gives wrapped bullets a hanging indent. Markers stay outside the
  // text block: do not add `list-inside`, or continuation lines run back
  // under the dot.
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-6 my-4 space-y-2.5" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-6 my-4 space-y-2.5" {...props} />
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
