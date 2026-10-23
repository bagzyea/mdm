# Android agent

The Kotlin app on each tablet: enrolls with the server, reports health and location,
and carries out commands and configuration. Last reviewed **29 September 2026**.

> **Status:** the agent builds and its 46 unit tests pass, but **it has not yet been run
> on a real tablet.** Treat everything below as verified by compiler and unit test, not
> in the field. The first device trial is the next step (see [Trial on a tablet](#trial-on-a-tablet)).

---

## What it can and cannot do today

The agent is a **Device Admin**, not a **Device Owner**. That decides what it can enforce:

| Works as Device Admin | Needs Device Owner (reported as UNSUPPORTED, with the reason) |
|---|---|
| Lock the screen, screen-lock timeout, wipe-after-failed-attempts, camera policy | Password rules, user restrictions (airplane mode, NFC…), kiosk / lock-task, silent app install, reading the hardware serial number, APN and Wi-Fi configuration |

Every command and every field-configuration setting reports exactly what was applied, so
the dashboard shows the truth. Becoming Device Owner (QR provisioning at factory reset)
is the decided direction and the largest piece of outstanding agent work; see
`ARCHITECTURE.md`.

**Commands the agent executes** are listed once, in `AGENT_COMMANDS`
(`integration/shared-types/src/command.ts`). A backend test parses
`CommandExecutor.kt` and fails if the two lists differ, and the server refuses anything
not on the list.

---

## One-time setup

This server has no JDK or Android SDK; the agent is built in Docker. You need an Android
SDK directory on the host:

```bash
SDK=$HOME/android-sdk
mkdir -p $SDK/cmdline-tools && cd /tmp
curl -sSL -o tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q tools.zip -d $SDK/cmdline-tools && mv $SDK/cmdline-tools/cmdline-tools $SDK/cmdline-tools/latest
docker run --rm -v $SDK:/sdk eclipse-temurin:17-jdk bash -c \
  'yes | /sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/sdk "platform-tools" "platforms;android-35" "build-tools;35.0.0"'
```

Requirements: JDK 17 (in the container), Gradle 8.7 (wrapper), AGP 8.6, Kotlin 2.1,
compileSdk 35, minSdk 30 (Android 11).

---

## Building

```bash
export ANDROID_SDK_DIR=$HOME/android-sdk

# Test build for tablets on the office network
ops/build-agent.sh debug -PmdmDevServer=http://10.10.10.241:5001

# Emulator build (default server http://10.0.2.2:5001, the emulator's alias for its host)
ops/build-agent.sh debug
```

Each build runs the unit tests and copies the APK to `build-output/`.

**Which server the agent talks to is fixed at build time:**
- **Debug builds** use `-PmdmDevServer` over plain HTTP.
- **Release builds** use `https://mdm.uboscare.com` (`-PmdmHost`) over HTTPS with
  certificate pinning.

A release APK therefore only works once that hostname resolves to this server and has a
TLS certificate.

### Release builds

A release build refuses to build without both **certificate pins** and a **signing key**:

```bash
ops/build-agent.sh release \
  -PmdmPinPrimary=<sha256/base64 pin> -PmdmPinBackup=<sha256/base64 pin> \
  -PmdmStoreFile=/path/mdm-release.keystore -PmdmStorePassword=... \
  -PmdmKeyAlias=mdm-key -PmdmKeyPassword=...
```

- **Signing key**, created once and kept safe:
  `keytool -genkey -v -keystore mdm-release.keystore -alias mdm-key -keyalg RSA -keysize 2048 -validity 10000`.
  Never commit the keystore or its passwords. Losing it means tablets cannot be updated
  in place.
- The signing properties can also come from the environment: `MDM_STORE_FILE`,
  `MDM_STORE_PASSWORD`, `MDM_KEY_ALIAS`, `MDM_KEY_PASSWORD`.
- **Device Owner provisioning** needs the signature checksum of the release key:
  `./gradlew printProvisioningChecksum -PmdmStoreFile=... (same signing properties)`.

---

## Installing and enrolling

1. Install: `adb install -r build-output/mdm-agent-debug-<date>.apk` (enable USB
   debugging on the tablet first), or copy the APK over and open it.
2. Open **UBOS MDM** and grant **Device Administrator** when asked.
3. In the dashboard: **Devices → Enroll Device → Generate enrollment code**. Codes are
   single-use and expire.
4. On the tablet, tap **Enroll** and type the code.
5. The tablet appears in the dashboard's device list within a minute.

A tablet that was suspended or wiped is refused until an administrator reactivates it;
it then enrolls again with a new code.

---

## Trial on a tablet

Nothing has been tested on hardware yet. For a first trial, work through:

- [ ] Installs and enrolls with a code; appears ACTIVE in the dashboard
- [ ] Heartbeats keep it ACTIVE; with Wi-Fi off it turns INACTIVE after ~5 minutes
- [ ] Lock and Locate from the dashboard work while the app is in the background
- [ ] A command sent while the tablet is offline runs once it reconnects
- [ ] After an hour (access-token lifetime) it keeps working: token refresh
- [ ] Suspend from the dashboard: the tablet is disconnected and cannot reconnect
- [ ] Apply a field configuration: the per-setting report appears in the session
- [ ] Reboot: the agent restarts and reconnects on its own

Logs: `adb logcat -s MDMService CommandExecutor WebSocketClient TokenRefresher HeartbeatWorker CommandPollingWorker`.

For emulator testing, use Android Studio on a workstation: an API 30+ image, the
emulator build above, and the backend reachable from the emulator's host.

---

## Google accounts and Factory Reset Protection

Tablets set up with an enumerator's **personal** Google account are locked to that
account after a factory reset (Android's Factory Reset Protection, FRP): setup asks for
it again, and the tablet is unusable until the person is found. No software can unlock a
tablet already in that state. FRP runs before any app, by design. The agent provides
three controls so it does not happen again. **All three need the agent as Device Owner**;
a Device Admin agent reports them as unsupported.

| Control | Where | What it does |
|---|---|---|
| Block adding or removing accounts | Policies → System (`accountModificationDisabled`) | Nobody can sign a personal account in. MDM installs the apps, so no account is needed |
| UBOS Google accounts that can unlock a reset tablet | Policies → System (`factoryResetProtectionAccounts`, Android 11+) | After any reset, only these accounts can set the tablet up again |
| Reclaim | Devices → ⋮ → Reclaim (admins only) | Erases the tablet **and clears FRP**, so it returns to setup without asking for any account. An offline tablet does it at its next check-in |

### The unlock accounts

Create one or two **UBOS-owned** Google accounts and keep their passwords with Digital
Solutions. The policy needs each account's numeric **Google account ID**, not its email:
an email is accepted by Android and matches nobody, leaving reset tablets that no one can
unlock, so the dashboard and agent both refuse one. To find the ID, sign in to the
account and call the People API, for example in the
[API Explorer](https://developers.google.com/people/api/rest/v1/people/get) with
`resourceName=people/me` and `personFields=metadata`. The answer's `resourceName` is
`people/<ID>`.

Before relying on it across a model, test it on one tablet: apply the policy, reset the
tablet from the hardware keys, and check that setup accepts the UBOS account. If Google
Play services on a model does not support the policy, the agent reports it as
unsupported rather than as applied.

### Reclaim

Reclaim is a command (`RECLAIM_DEVICE`) with safeguards:
- **Admins only.** It needs the `devices:delete` permission; operators cannot send it.
- **Typed confirmation.** The operator types the device's name. The server also refuses
  any erase whose `confirmCount` does not equal the number of tablets it would reach.
- **SD card kept by default.** It may hold census data not yet synced; erasing it is a
  separate tick box.
- **The agent reports before erasing.** Once the report arrives, the server marks the
  device WIPED and revokes its credentials. The tablet then needs setting up again on the
  provisioning bench.

A Device Admin agent refuses Reclaim, and nothing is erased: it could wipe the tablet but
not clear FRP, which would leave it locked to the last account.

### Tablets that are locked now

- **Still working, but with a personal account on them:** remove the account first
  (Settings → Accounts → the account → Remove; it asks for the tablet's screen lock, not
  the Google password), then factory reset from **Settings**. Check this on one tablet of
  each model first.
- **Already reset and asking for the account:** the person signs in, or the
  manufacturer or supplier clears FRP with proof of ownership. The FA register
  (serials and finance asset numbers) is that proof. If the person resets their password
  first, Google may refuse that account on the tablet for about 72 hours.
- Avoid "FRP bypass" tools. They exploit security flaws, are unreliable, and often carry
  malware.

---

## Known limitations

- Device Admin only (above); kiosk mode does not engage.
- Push wake-ups (FCM) are not sent by the server. Offline tablets pick up commands on
  their next heartbeat or on the periodic poll (every 4 hours).
- The live connection stops retrying after 20 failed reconnects, until the agent's
  service restarts. HTTP heartbeats and polling carry on regardless.
- Three heartbeat mechanisms overlap (`MDMService`, `MDMBackgroundService`,
  `HeartbeatWorker`); they should be reduced to one.
