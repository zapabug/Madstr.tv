#!/usr/bin/env bash
# Put the web app into the pleb.world site (spec feat-plebworld-deploy §D3): the /madstr/ build into
# public/madstr/, the RSS proxy into api/. It does not commit or push pleb.world; that deploys, so it is a
# separate step.
set -euo pipefail
cd "$(dirname "$0")/.."
PLEB="${PLEB:-$HOME/Projects/plebworld}"
[ -d "$PLEB/public" ] || { echo "pleb.world repo not found at $PLEB" >&2; exit 1; }
pnpm build:pleb
mkdir -p "$PLEB/public/madstr" "$PLEB/api/_lib"
rsync -a --delete dist-pleb/ "$PLEB/public/madstr/"
cp dist-pleb-api/rss.js "$PLEB/api/rss.js"
cp dist-pleb-api/_lib/rssProxy.js "$PLEB/api/_lib/rssProxy.js"
echo "Copied into $PLEB: public/madstr/, api/rss.js, api/_lib/rssProxy.js"
