#!/usr/bin/env bash
set -euo pipefail

if [ -x "tools/mermaid-cli/node_modules/.bin/mmdc" ]; then
  MMDC="tools/mermaid-cli/node_modules/.bin/mmdc"
elif command -v mmdc >/dev/null 2>&1; then
  MMDC="mmdc"
else
  echo "mmdc not found. Install repo-local CLI with: npm --prefix tools/mermaid-cli install"
  exit 1
fi

"$MMDC" -i "docs/ERD.mmd" -o "docs/ERD.png"
echo "Rendered docs/ERD.png"
