/**
 * The heading a topic directory gets on the /knowledge pages.
 *
 * Title-casing the slug is right for almost every topic ("open-source" →
 * "Open Source"), so only the ones it gets wrong are listed. A topic added
 * to TOPIC_ORDER in lib/knowledge/build.ts without being listed here still
 * renders a sensible heading rather than breaking the page.
 */
const OVERRIDES: Record<string, string> = {
  faq: 'FAQ',
  resume: 'Résumé',
}

export function topicLabel(topic: string): string {
  return (
    OVERRIDES[topic] ??
    topic
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )
}
