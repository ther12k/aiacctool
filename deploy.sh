#!/usr/bin/env bash
# Deploys the AI Usage Monitor GNOME extension and reloads it.
#
# GNOME Shell caches extension ES modules for the whole session, so a plain
# disable/enable does NOT re-read changed code. The entry file (extension.js)
# is a tiny stable loader; each deploy stamps the implementation into a
# uniquely named impl-<timestamp>.js, which bypasses the module cache when
# the extension is re-enabled. No logout needed after the first install.
#
# Usage: ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

SRC=ai-usage-monitor@ther12k
EXT="${HOME}/.local/share/gnome-shell/extensions/ai-usage-monitor@ther12k"
STAMP="$(date +%Y%m%d%H%M%S)"

python3 -c "import ast; ast.parse(open('ai-collector.py').read())" \
    && echo "collector: syntax OK"
node --input-type=module --check < "$SRC/extension.js" \
    && echo "loader: syntax OK"
node --input-type=module --check < "$SRC/impl.js" \
    && echo "impl: syntax OK"

mkdir -p "$EXT"
cp ai-collector.py "$EXT/ai-collector.py"
cp "$SRC/metadata.json" "$SRC/stylesheet.css" "$SRC/zhipu-logo.png" "$EXT/"
cp "$SRC/extension.js" "$EXT/extension.js"
# impl.js derives its GType stamp from its own filename at runtime
cp "$SRC/impl.js" "$EXT/impl-$STAMP.js"
find "$EXT" -name 'impl-*.js' ! -name "impl-$STAMP.js" -delete
chmod +x "$EXT/ai-collector.py"

gnome-extensions disable ai-usage-monitor@ther12k 2>/dev/null || true
sleep 1
gnome-extensions enable ai-usage-monitor@ther12k
sleep 3
gnome-extensions info ai-usage-monitor@ther12k | grep -E "State|Version"

echo "--- last journal lines (build tag + errors):"
journalctl --user -b /usr/bin/gnome-shell --since "-1 min" 2>/dev/null \
    | grep -E "AI Monitor|JS ERROR" | grep -v "downloading update" | tail -6 \
    || true
echo "done. If the build tag line is missing above and the badge did not"
echo "change, log out and back in once so the shell picks up the loader."
