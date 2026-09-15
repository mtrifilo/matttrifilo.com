# ai-elements

Forked copies of four [Vercel AI Elements](https://ai-sdk.dev/elements)
registry components — `conversation`, `message`, `sources`, `suggestion` —
taken from the registry on 2026-09-15 for MTC-33 and hand-maintained since.
The registry is not configured in `components.json`, on purpose: re-running
the generator would overwrite the deviations each file's header documents.

Treat these as ours to edit. They keep the registry's formatting (double
quotes, semicolons) so a diff against the upstream component stays readable;
that is the one place in `components/` where `.prettierrc` is not followed.

What was cut, and why, is at the top of each file. The short version: no
branch selector, no transcript download, no `role="log"` (it re-announces
every streamed token), no collapsible citations, no horizontal scroll area,
and none of the `@streamdown/*` plugins.
