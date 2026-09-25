#!/usr/bin/env bash
# Stamp the deploy time (UTC) and this site's settings into the app, publish the build time so running copies
# can tell whether they are current, and write the security headers (with a hash of the app's inline script).
set -e
T=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# Settings come from the site's environment variables; the public app's IDs are the defaults.
PUBLIC_URL=${PUBLIC_URL:-https://academic-reader.initialloop.com}
DROPBOX_APP_KEY=${DROPBOX_APP_KEY:-}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
sed -i -e "s|__BUILD_TIME__|$T|" -e "s|__PUBLIC_URL__|$PUBLIC_URL|" -e "s|__DROPBOX_APP_KEY__|$DROPBOX_APP_KEY|" -e "s|__GOOGLE_CLIENT_ID__|$GOOGLE_CLIENT_ID|" public/index.html
printf '{"build":"%s"}\n' "$T" > public/version.json
node scripts/headers.mjs public > public/_headers
echo "Stamped build $T for $PUBLIC_URL"
