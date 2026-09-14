#!/usr/bin/env bash
# Greps content/knowledge/*.md against a private denylist and fails if any
# denied term made it into the career assistant's knowledge base.
#
#   scripts/knowledge-denylist-check.sh
#
# The denylist lives OUTSIDE this repo, at ~/docs/career/.chatbot-denylist,
# because the terms themselves are the private information: a list of the
# people, projects, vendors and topics that must never reach the model is a
# map of exactly what to look for. It is one term per line; blank lines and
# lines starting with # are ignored. Matching is case-insensitive and
# whole-word.
#
# Each file is flattened to a single whitespace-normalised line before
# matching. The knowledge files are hard-wrapped at about 76 columns, so a
# two-word term lands astride a line break often enough that line-by-line
# grep would miss it silently — "Project\nNimbus" is invisible to grep and
# obvious to a reader and to a model. Flattening costs nothing and removes
# the whole class of miss. scripts/knowledge-denylist-check.test.ts pins
# that behaviour with a wrapped fixture.
#
# Never commit the denylist. .gitignore blocks the filename, and the file
# belongs in ~/docs, not here.
#
# On a machine without the denylist — CI, a fresh clone, anyone but Matt —
# this prints one line and exits 0. It is a local backstop for a human
# author, not a CI gate. The gate that runs everywhere is
# lib/knowledge/knowledge.test.ts (`bun run knowledge:check`), which only
# needs patterns that are safe to publish.
#
# Wiring it up as a git pre-commit hook (do this by hand; nothing in this
# repo writes to .git/hooks):
#
#   printf '%s\n' '#!/usr/bin/env sh' \
#     'exec scripts/knowledge-denylist-check.sh' \
#     > .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Or, if you already keep hooks in a managed directory:
#
#   git config core.hooksPath .githooks   # then add the same two lines there
#
# Bypass a single commit with `git commit --no-verify` when a term is a
# false positive; fix the denylist rather than making a habit of it.
#
# Two environment overrides, both for the self-test and for a dry run:
#
#   KNOWLEDGE_DENYLIST=/tmp/terms.txt KNOWLEDGE_DIR=/tmp/fixture \
#     scripts/knowledge-denylist-check.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KNOWLEDGE_DIR="${KNOWLEDGE_DIR:-$ROOT/content/knowledge}"
DENYLIST="${KNOWLEDGE_DENYLIST:-$HOME/docs/career/.chatbot-denylist}"

if [ ! -f "$DENYLIST" ]; then
  echo "knowledge denylist: none at $DENYLIST; skipping (expected off Matt's machine)"
  exit 0
fi

shopt -s nullglob
files=("$KNOWLEDGE_DIR"/*.md)
if [ ${#files[@]} -eq 0 ]; then
  echo "knowledge denylist: no files in $KNOWLEDGE_DIR" >&2
  exit 1
fi

# Read the terms once, so each file is flattened once rather than per term.
terms=()
while IFS= read -r term || [ -n "$term" ]; do
  term="${term#"${term%%[![:space:]]*}"}"
  term="${term%"${term##*[![:space:]]}"}"
  case "$term" in '' | '#'*) continue ;; esac
  terms+=("$term")
done <"$DENYLIST"

if [ ${#terms[@]} -eq 0 ]; then
  echo "knowledge denylist: $DENYLIST has no terms" >&2
  exit 1
fi

hits=0
for file in "${files[@]}"; do
  # One line, single-spaced: line breaks inside a multi-word term vanish.
  flat="$(tr '[:space:]' ' ' <"$file" | tr -s ' ')"
  for term in "${terms[@]}"; do
    if printf '%s' "$flat" | grep -F -i -w -q -e "$term"; then
      hits=1
      # The file, never the term and never the surrounding text: terminal
      # scrollback and CI logs are both less private than the denylist.
      echo "knowledge denylist: hit in ${file#"$ROOT/"}" >&2
    fi
  done
done

if [ "$hits" -ne 0 ]; then
  echo "knowledge denylist: a denied term is in the knowledge base; remove it before committing" >&2
  exit 1
fi

echo "knowledge denylist: clean (${#terms[@]} terms against ${#files[@]} files)"
exit 0
