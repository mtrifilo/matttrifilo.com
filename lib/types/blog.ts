export interface BlogPostFrontmatter {
  title: string
  date: string
  categories?: string[]
  description?: string
  /**
   * `YYYY-MM-DD`, validated like `date`. Not shown on the page; the sitemap
   * and the post's structured data read it through postLastModified().
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
