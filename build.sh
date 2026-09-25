#!/usr/bin/env bash
# Stamp the deploy time (UTC) into the app, and publish it so running copies can tell whether they are current.
set -e
T=$(date -u +%Y-%m-%dT%H:%M:%SZ)
sed -i "s/__BUILD_TIME__/$T/" public/index.html
printf '{"build":"%s"}\n' "$T" > public/version.json
echo "Stamped build $T"
