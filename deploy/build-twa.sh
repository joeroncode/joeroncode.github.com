#!/usr/bin/env bash
# Wrap the hosted Reel PWA as an Android app (Trusted Web Activity) for Play.
#
# Prereqs:
#   - Reel deployed over HTTPS (e.g. your Cloud Run URL or a custom domain).
#   - Node.js installed. Bubblewrap is invoked via npx (no global install).
#   - A JDK + Android SDK (Bubblewrap will offer to install them on first run).
#
# 1. Edit deploy/twa-manifest.json: set "host", "webManifestUrl", the icon
#    URLs to your HTTPS host, and pick a "packageId" (e.g. com.yourco.reel).
# 2. Run this script. It produces a signed .aab and prints the signing
#    fingerprint you need for assetlinks.json.
set -euo pipefail

MANIFEST="${1:-deploy/twa-manifest.json}"
HOST="$(python3 -c "import json,sys;print(json.load(open('${MANIFEST}'))['host'])")"

if [ "${HOST}" = "reel.example.com" ]; then
  echo "Edit ${MANIFEST} first — 'host' is still the placeholder." >&2
  exit 1
fi

echo "Initialising Bubblewrap from ${MANIFEST} (host: ${HOST})"
npx @bubblewrap/cli init --manifest "${MANIFEST}"

echo "Building signed app bundle…"
npx @bubblewrap/cli build

echo
echo "Built app-release-signed.aab"
echo "Now publish deploy/assetlinks steps: take the SHA-256 printed above and"
echo "serve it at https://${HOST}/.well-known/assetlinks.json"
echo "(set PV_ASSETLINKS=/path/to/assetlinks.json on the server, or host the file)."
