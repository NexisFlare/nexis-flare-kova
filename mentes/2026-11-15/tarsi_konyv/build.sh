#!/usr/bin/env bash
# Társi kapcsolat egy AI-jal / Companionship with an AI — draft rebuild
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
python3 "$DIR/_gen/assemble.py"
