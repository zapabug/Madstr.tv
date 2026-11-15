#!/usr/bin/env bash
# Sign the release APK for zapstore (spec feat-pwa-zapstore.md §P3). The keystore and its password live
# outside the repo: MADSTR_SIGNING_ENV (default ~/.android-keys/madstr-release.env, mode 600) sets
# KEYSTORE_PATH, KEYSTORE_PASSWORD and KEY_ALIAS. Run after `pnpm build && pnpm exec cap sync android &&
# (cd android && ./gradlew assembleRelease)`. Writes android/app/build/outputs/apk/release/app-release-signed.apk.
set -euo pipefail
ENV_FILE="${MADSTR_SIGNING_ENV:-$HOME/.android-keys/madstr-release.env}"
[ -r "$ENV_FILE" ] || { echo "sign-release: no signing env at $ENV_FILE" >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="$(ls -d "$SDK"/build-tools/*/ | sort -V | tail -1)"
OUT=android/app/build/outputs/apk/release
"$BT/zipalign" -p -f 4 "$OUT/app-release-unsigned.apk" "$OUT/app-release-aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE_PATH" --ks-key-alias "$KEY_ALIAS" --ks-pass env:KEYSTORE_PASSWORD \
  --out "$OUT/app-release-signed.apk" "$OUT/app-release-aligned.apk"
rm -f "$OUT/app-release-aligned.apk"
"$BT/apksigner" verify --verbose --print-certs "$OUT/app-release-signed.apk" | grep -E "Verifies|certificate (DN|SHA-256 digest)"
