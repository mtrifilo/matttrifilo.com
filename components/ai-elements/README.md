# ai-elements

Forked copies of five [Vercel AI Elements](https://ai-sdk.dev/elements)
registry components (`chain-of-thought`, `collapsible` via `components/ui`,
`conversation`, `message`, `suggestion`), taken from the registry on
2026-09-15 for MTC-33 and 2026-09-16 for MTC-42, and hand-maintained since.
AI Elements is Apache-2.0.
The registry is not configured in `components.json`, on purpose: re-running
the generator would overwrite the deviations each file's header documents.

Treat these as ours to edit. They keep the registry's formatting (double
quotes, semicolons) so a diff against the upstream component stays readable.
`components/ui/` does the same, for the same reason; those two directories are
where `.prettierrc` is not followed.

What was cut, and why, is at the top of each file. The short version: no
branch selector, no transcript download, no `role="log"` (it re-announces
every streamed token), no collapsible citations, no horizontal scroll area,
no search-result chips or images on the chain of thought, and none of the
`@streamdown/*` plugins.
