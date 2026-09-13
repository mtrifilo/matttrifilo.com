#!/usr/bin/env bash
# Regenerates content/resume.md and public/Matt-Trifilo-Resume.pdf from the
# private Markdown source.
#
#   scripts/render-resume.sh /path/to/matt-trifilo-resume-em.md
#
# The source lives outside this repo (docs/career/assets/resume) next to its
# md2html.py. The source contains a phone number and a personal email; this
# script strips the phone and swaps the email for the site address, refuses
# to write anything if a phone/personal-email shape survives, renders the
# PDF, writes both artifacts only after both succeeded, and then runs the
# tests that guard the published copies.
#
# Heading contract shared by both outputs: `#` name, `##` section, `###`
# employer, `####` role line, `#####` sub-group label within a role. The
# private md2html.py styles h4 bold at body size and h5 as a small
# uppercase label; components/blog/mdx-content.tsx does the same on the
# site (one level deeper after its demotion), and lib/resume-pdf.test.ts
# asserts every heading survives into the PDF.
set -euo pipefail
SRC="${1:?path to the résumé .md}"
SRC_DIR="$(cd "$(dirname "$SRC")" && pwd)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_PDF="$ROOT/public/Matt-Trifilo-Resume.pdf"
OUT_MD="$ROOT/content/resume.md"
TMP="$(mktemp -d)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME" >&2; exit 1; }

sed -E \
  -e 's/matt\.trifilo@gmail\.com · [0-9]{3}-[0-9]{3}-[0-9]{4} · /hi@matttrifilo.com · /' \
  -e 's/ · [0-9]{3}-[0-9]{3}-[0-9]{4}//; s/[0-9]{3}-[0-9]{3}-[0-9]{4} · //' \
  -e 's/matt\.trifilo@gmail\.com/hi@matttrifilo.com/g' \
  "$SRC" > "$TMP/resume.md"

# Guards are deliberately broader than the sed above (any separator, any
# case, any personal-mail provider) and mirror lib/resume.test.ts.
if grep -Eqi '[0-9]{3}[-. ()]*[0-9]{3}[-. ()]*[0-9]{4}|\+1[ -]?[0-9]|gmail|yahoo|hotmail|outlook|icloud|proton|matt\.trifilo@' "$TMP/resume.md"; then
  echo "refusing: a phone number or personal email shape survived redaction" >&2; exit 1
fi
if grep -Eio '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' "$TMP/resume.md" | sort -u | grep -qv '^hi@matttrifilo\.com$'; then
  echo "refusing: an email address other than hi@matttrifilo.com is present" >&2; exit 1
fi

python3 "$SRC_DIR/md2html.py" "$TMP/resume.md" "$TMP/resume.html"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$TMP/resume.pdf" "file://$TMP/resume.html" 2>/dev/null
[ -s "$TMP/resume.pdf" ] || { echo "Chrome produced no PDF" >&2; exit 1; }

# Only now, so a failed render never leaves the two artifacts out of step.
cp "$TMP/resume.md" "$OUT_MD"
cp "$TMP/resume.pdf" "$OUT_PDF"
echo "wrote $OUT_MD and $OUT_PDF"

cd "$ROOT" && bun test lib/resume.test.ts lib/resume-pdf.test.ts
