#!/bin/sh
# Rebuild every Blender-rendered atlas, then pack the manifest and check the 8 MB budget.
set -e
cd "$(dirname "$0")/.."
for s in build_sprites build_fx build_stages build_ui; do
  echo "== $s"; blender --background --python blender/$s.py 2>&1 | grep -E "ATLAS|STAGE|DONE|Error|Traceback" || true
done
node tools/manifest.mjs
