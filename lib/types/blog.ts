export interface BlogPostFrontmatter {
  title: string
  date: string
  categories?: string[]
  description?: string
  /**
   * `YYYY-MM-DD`, validated like `date` and never before it. Not shown on
   * the page; the sitemap, the structured data and og modifiedTime read it
   * through postLastModified().
   */
  updated?: string
}

export interface BlogPost {
  slug: string
  frontmatter: BlogPostFrontmatter
  content: string
  excerpt: string
}

export interface BlogPostMeta {
  slug: string
  title: string
  date: string
  categories: string[]
  description?: string
  /** As in BlogPostFrontmatter. */
  updated?: string
  excerpt: string
}
