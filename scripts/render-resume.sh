#!/usr/bin/env bash
# Regenerates public/Matt-Trifilo-Resume.pdf from the private Markdown source.
#
#   scripts/render-resume.sh /path/to/matt-trifilo-resume-em.md
#
# The source lives outside this repo (docs/career/assets/resume) next to its
# md2html.py. The source contains a phone number and a personal email; this
# script strips the phone and swaps the email for the site address before
# rendering, and lib/resume-pdf.test.ts asserts the result stays clean.
set -euo pipefail
SRC="${1:?path to the résumé .md}"
SRC_DIR="$(cd "$(dirname "$SRC")" && pwd)"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/Matt-Trifilo-Resume.pdf"
TMP="$(mktemp -d)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

sed -E \
  -e 's/matt\.trifilo@gmail\.com · [0-9]{3}-[0-9]{3}-[0-9]{4} · /hi@matttrifilo.com · /' \
  -e 's/ · [0-9]{3}-[0-9]{3}-[0-9]{4}//; s/[0-9]{3}-[0-9]{3}-[0-9]{4} · //' \
  -e 's/matt\.trifilo@gmail\.com/hi@matttrifilo.com/g' \
  "$SRC" > "$TMP/resume.md"

if grep -Eq '[0-9]{3}-[0-9]{3}-[0-9]{4}|gmail' "$TMP/resume.md"; then
  echo "refusing: phone number or gmail address still present after redaction" >&2; exit 1
fi

python3 "$SRC_DIR/md2html.py" "$TMP/resume.md" "$TMP/resume.html"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "file://$TMP/resume.html" 2>/dev/null
echo "wrote $OUT"
echo "now run: bun test lib/resume-pdf.test.ts"
