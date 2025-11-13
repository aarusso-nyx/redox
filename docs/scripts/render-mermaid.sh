#!/usr/bin/env bash
set -euo pipefail
if ! command -v mmdc >/dev/null 2>&1; then
  echo "mmdc (mermaid-cli) not found. Install with: npm i -D mermaid-cli"
  exit 1
fi
mmdc -i "docs/ERD.mmd" -o "docs/ERD.png"
echo "Rendered docs/ERD.png"
