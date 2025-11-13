#!/usr/bin/env bash
set -euo pipefail
if ! command -v markdown-link-check >/dev/null 2>&1; then
  echo "markdown-link-check not found. Install with: npm i -D markdown-link-check"
  exit 1
fi
find docs -name "*.md" -maxdepth 2 -print0 | xargs -0 -n1 markdown-link-check -q
