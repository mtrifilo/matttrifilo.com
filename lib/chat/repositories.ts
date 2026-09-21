import { openSourceRepos, type CuratedRepo } from '@/content/open-source'

/**
 * The repositories Matt's Career Assistant may ask GitHub about (MTC-45).
 *
 * Derived from the `assistant` flag on the curated list rather than from the
 * list itself, so showing a project on /open-source and letting the chat
 * route fetch its activity stay two separate decisions.
 *
 * Pure data with no runtime imports beyond the curated list: the prompt, the
 * tool, the fetcher and the progress narration all read the allowlist from
 * here, and none of them may disagree about which repositories exist or what
 * they are called.
 *
 * Two boundaries it draws:
 *
 *   - `id` is the only thing the model is given and the only thing it may
 *     hand back. It is never an owner, a slug, or a URL, so nothing the model
 *     says can widen what is fetched; `slug` is assembled here from the
 *     curated owner and name.
 *   - `description` is Matt's reviewed `summary`, not GitHub's description.
 *     The one line the model is shown about a repository is therefore text a
 *     person wrote, not text fetched from a third party.
 */
export interface AssistantRepository {
  /** The short key the model uses. The curated repository name. */
  id: string
  owner: string
  name: string
  /** "owner/name", assembled here so no caller builds a path of its own. */
  slug: string
  /** Matt's reviewed one-line description from the curated list. */
  description: string
}

/**
 * A curated entry with the flag and a reviewed summary. The summary is
 * required because the model is shown it in place of GitHub's description; an
 * entry that is flagged without one is a configuration mistake rather than a
 * repository to describe with third-party text, and `repositories.test.ts`
 * fails on it.
 */
function toAssistantRepository(
  repo: CuratedRepo
): AssistantRepository | undefined {
  const description = repo.summary?.trim()
  if (repo.assistant !== true || !description) return undefined
  return {
    id: repo.name,
    owner: repo.owner,
    name: repo.name,
    slug: `${repo.owner}/${repo.name}`,
    description,
  }
}

/** The allowlist, in curated order. */
export const ASSISTANT_REPOSITORIES: readonly AssistantRepository[] =
  openSourceRepos
    .map(toAssistantRepository)
    .filter((repo): repo is AssistantRepository => repo !== undefined)

const byId = new Map(ASSISTANT_REPOSITORIES.map(repo => [repo.id, repo]))

/**
 * The repository an id names, or `undefined`. The single place an id from the
 * model is resolved, so a caller cannot accidentally accept one that is not
 * on the list.
 */
export function assistantRepository(
  id: string
): AssistantRepository | undefined {
  return byId.get(id)
}
