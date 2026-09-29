#!/usr/bin/env bash
# Build the Android agent in Docker. This server has no JDK or Android SDK installed.
#
#   ANDROID_SDK_DIR=/path/to/android-sdk ops/build-agent.sh                 # debug, emulator server
#   ANDROID_SDK_DIR=... ops/build-agent.sh debug -PmdmDevServer=http://10.10.10.241:5001
#   ANDROID_SDK_DIR=... ops/build-agent.sh release -PmdmPinPrimary=... -PmdmPinBackup=... \
#       -PmdmStoreFile=... -PmdmStorePassword=... -PmdmKeyAlias=... -PmdmKeyPassword=...
#
# The APK is copied to build-output/. Unit tests run as part of every build.
# Getting an SDK: docs/android-agent.md#one-time-setup
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
VARIANT="${1:-debug}"; shift || true
SDK="${ANDROID_SDK_DIR:?set ANDROID_SDK_DIR to an Android SDK with platforms;android-35 and build-tools;35.0.0}"
GRADLE_HOME="${GRADLE_CACHE_DIR:-$HOME/.gradle-mdm}"
mkdir -p "$GRADLE_HOME" "$REPO/build-output"

case "$VARIANT" in
  debug)   TASKS="assembleDebug testDebugUnitTest" ;;
  release) TASKS="assembleRelease testReleaseUnitTest" ;;
  *) echo "variant must be debug or release"; exit 1 ;;
esac

docker run --rm \
  -v "$REPO/android-app:/work" -v "$SDK:/opt/android-sdk" -v "$GRADLE_HOME:/gradle-home" \
  -e ANDROID_SDK_ROOT=/opt/android-sdk -e GRADLE_USER_HOME=/gradle-home -w /work \
  eclipse-temurin:17-jdk ./gradlew --no-daemon $TASKS "$@"

# Gradle runs as root in the container; hand the build tree back.
docker run --rm -v "$REPO/android-app:/work" alpine chown -R "$(id -u):$(id -g)" /work

APK=$(ls -t "$REPO"/android-app/app/build/outputs/apk/"$VARIANT"/*.apk | head -1)
OUT="$REPO/build-output/mdm-agent-$VARIANT-$(date +%Y%m%d-%H%M).apk"
cp "$APK" "$OUT"
echo "Built $OUT"
