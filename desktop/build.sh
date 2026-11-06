#!/usr/bin/env bash
# Builds C4SiteSheet-win_x64.exe (plus Mac/Linux builds) from the web app in app/.
# Usage: from the repo root, `npm install` once, then `bash desktop/build.sh`.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf www/css www/index.html www/icon.png
mkdir -p www/js www/css www/vendor
cp ../app/css/style.css www/css/
cp ../app/js/parser.js ../app/js/sample.js ../app/js/schematic.js ../app/js/compare.js ../app/js/programming.js ../app/js/packet.js ../app/js/app.js www/js/
cp ../node_modules/jszip/dist/jszip.min.js www/vendor/
cp icon.png www/icon.png

# Desktop page: zip library bundled locally so it works offline, plus the Neutralino client
sed -e 's#https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js#vendor/jszip.min.js#' \
    -e 's#<script src="js/parser.js"></script>#<script src="js/neutralino.js"></script>\n<script>Neutralino.init(); Neutralino.events.on("windowClose", () => Neutralino.app.exit());</script>\n<script src="js/parser.js"></script>#' \
    ../app/index.html > www/index.html

[ -f bin/neutralino-win_x64.exe ] || npx --prefix .. neu update
npx --prefix .. neu build --release --embed-resources
ls -la dist/*/
