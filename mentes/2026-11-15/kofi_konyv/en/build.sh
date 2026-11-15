#!/usr/bin/env bash
# The Living Fire Book — English edition, recompile
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

TYPST="${TYPST:-typst}"
if ! command -v "$TYPST" >/dev/null 2>&1; then
  if [ -x /tmp/typst/typst ]; then
    TYPST=/tmp/typst/typst
  else
    echo "typst is not on the PATH. Install it: https://typst.app/install/" >&2
    exit 1
  fi
fi

FONT_PATHS=(
  --font-path "/usr/share/fonts/truetype/sand-box/google/Alegreya"
  --font-path "/usr/share/fonts/truetype/sand-box/google/Alegreya Sans"
  --font-path "/usr/share/fonts/truetype/sand-box/google/Fraunces"
)

# Project root is the parent folder so the shared assets/ directory is visible.
ROOT="$(cd "$DIR/.." && pwd)"
"$TYPST" compile --root "$ROOT" "${FONT_PATHS[@]}" "$DIR/living_fire_book_en.typ" "$DIR/living_fire_book_en.pdf"
echo "Ready: $DIR/living_fire_book_en.pdf"
