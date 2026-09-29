# Changelog

Notable changes to UBOS MDM. Dates are the date the work landed.

This file starts at 13 September 2026. Earlier history is in `git log`; the status
documents that previously served as an informal changelog were withdrawn because several
recorded work as complete that was not (see `SECURITY.md`).

---

## 2026-09-29 — Code-quality audit, deployment, sign-in

Merged to `main` and deployed. Details in each commit; the headlines:

### Correctness
- **Suspension held.** Heartbeats, disconnects and the stale sweep wrote ACTIVE or
  INACTIVE over SUSPENDED and WIPED, so a suspended tablet reinstated itself. Presence
  and lifecycle status are now separate rules, and suspending, wiping or retiring cuts a
  device off at once.
- **The offline path works.** None of the agent's HTTP calls reached a working endpoint,
  queued commands expired after 5 minutes, and the agent could not renew its token after
  an hour. The device API, a 7-day command TTL and agent-side token refresh fix these.
- **One command vocabulary.** The server queued five commands the agent did not
  implement. `AGENT_COMMANDS` is now the single list, checked against the Kotlin.
- **No more simulated work.** Bulk app deployment and field configuration marked
  devices COMPLETED without sending anything. Both now send real commands and settle
  from the devices' own reports, setting by setting.
- **Tablets can enroll.** The agent never asked for the (mandatory) enrollment code.
- Transactions for enrollment, transfers and retirement; device progress reports were
  never recorded (a JSON column written with a list-only operation).

### Security
- Admins could make themselves super admin through the user-edit API. Closed.
- The live JWT secret was the placeholder published in the compose file. Rotated.
- The login screen advertised `admin / admin123`. Removed.
- Release builds allowed cleartext HTTP to several hosts. Now HTTPS-only.

### Operations
- **Active Directory sign-in**, using the same directory as AMS.
- **Migrations** now build a working database; a reconciliation migration repaired
  the live one, which lacked the certificate and security tables.
- **`ops/deploy-backend.sh`**, `ops/build-agent.sh` and `ops/set-password.sh`.
  Settings are in `ops/backend.env`.
- **Documentation consolidated.** `README.md` is the master document, supported by
  `ARCHITECTURE`, `SECURITY`, `CHANGELOG`, `docs/operations.md`,
  `docs/android-agent.md` and `docs/plans/`. Fifteen overlapping or outdated guides and
  fourteen root scripts were removed; they remain in git history.

### Not done
- The agent has not been run on a real tablet, and is still a Device Admin.
- The Asset Management System link is planned only (`docs/plans/ams-integration.md`).

---

## 2026-09-13 — Phase 2 (agent correctness)

### The agent had never compiled

Verified by building commit f93cab8 — the one the readiness review examined — in a
container with JDK 17 and the Android 35 SDK. It fails with two Kotlin compile errors: a
duplicate `AppInstallationPackage` shadowing the one the installer actually takes, and a
call to an `MDMService.sendMessage` that does not exist.

Nothing in this repository had ever built the Kotlin, because the CI job that would have
began by `chmod`-ing an `android-app/gradlew` that is not checked in. Every claim the
withdrawn status documents made about agent behaviour described code that could not be
compiled.

Both errors are fixed, the Gradle wrapper is committed, and `assembleDebug` +
`testDebugUnitTest` are now blocking CI gates.

### Agent fixes

- **F-07** — policy application no longer reports success for settings that were never
  applied. Calls are gated on the privilege the platform actually reports; a call above
  it is not attempted, and results name the setting, the privilege required and the
  privilege held.
- **F-08** — real certificate pinning. Pins are supplied at build time and the
  configuration fails closed; `assembleRelease` refuses to produce an APK without two
  valid pins. The previous code returned a literal `false` from `shouldEnablePinning()`,
  used placeholder pins, and had a `verifyCertificatePins()` that returned `true` without
  comparing anything.
- **F-09** — commands execute in the foreground service, not the Activity. Also fixed
  `CommandPollingWorker`, which fetched pending commands and discarded them — so the FCM
  wake and periodic poll paths, the ones that matter for a tablet returning from days out
  of coverage, did nothing at all.
- **F-11** — release builds are signed, from a keystore supplied by properties or
  environment. New `printProvisioningChecksum` task emits the DPC signature checksum the
  Device Owner QR payload needs.
- **F-12** — `<queries>` and `QUERY_ALL_PACKAGES` declared, so app inventory stops
  silently returning a fraction of what is installed.
- Provisioning progress was emitted as a generic `message` the server does not route;
  it now uses the `provisioningProgress` event the server listens for.

### Agent dependencies

Updated to current versions, each verified by a successful build: core-ktx 1.15.0,
coroutines 1.9.0, lifecycle 2.9.0, room 2.7.1, work 2.10.0, gson 2.11.0, firebase-bom
33.7.0, socket.io-client 2.1.1, security-crypto 1.1.0-alpha06. OkHttp 5 and Retrofit 3
deliberately deferred as majors needing a device test.

Note: `androidx.security.crypto`, which stores the device token and enrollment code, is
deprecated by Google. A migration path still needs choosing.

### Tests

32 Android unit tests, 0 failing — the first meaningful ones in the agent. The previous
suite asserted tautologies (`assertTrue(true)`) and was removed.

### Decided

Own Device Owner DPC, rather than Google's Android Management API — AMAPI cannot deploy
the per-district data folders or the custom provisioning flow, which are the product.

### Not done

The re-platform itself: `GET_PROVISIONING_MODE`, `ADMIN_POLICY_COMPLIANCE`, QR payload
generation, silent install via `PackageInstaller`. And **nothing in the agent has been run
on a device** — there is no hardware here. All agent work is verified by compiler and unit
test only.

---

## 2026-09-13 — Phase 0 (contain) and Phase 1 (buildable)

Addresses the September 2026 readiness review. Finding numbers in brackets.

### Security — breaking

- **Enrollment now requires a single-use, expiring code** [F-02]. The endpoint previously
  accepted any `deviceId` the caller invented, and re-posting an existing one minted a
  fresh credential for that device. New `EnrollmentToken` table; codes are stored as
  hashes, may be bound to a pre-registered serial, and can be revoked.
  **Existing agents will fail to enrol until the Android client is updated to send a
  code.**
- **Device credentials are revocable** [F-13]. Short-lived access tokens (1h) plus a
  90-day refresh token that is re-checked against device status on every use; a wiped,
  suspended, retired or deleted device is refused. Replaces a 365-day token with no
  revocation path.
- **Socket.IO handshakes are authenticated** [F-03]. Connections without a valid token
  are refused; device identity is pinned from the token claim, so a payload can no longer
  name a different device. The dashboard now sends its token in the handshake.
- **APK downloads are no longer public** [F-06]. The unauthenticated static mount is
  replaced by short-lived signed URLs, minted at dispatch so they cannot expire inside a
  stored provisioning profile.

### Security

- Server refuses to start without a strong `JWT_SECRET`; `ENCRYPTION_KEY` is mandatory in
  production [F-04]. Three modules previously fell back to a literal committed in this
  repository — one of them derived the at-rest key for certificate private keys from it.
- Every API route carries its own authorization guard, with a test that walks the live
  route table [F-01].
- The APK registry is reachable by ADMIN and OPERATOR again; it was gated on an action no
  role holds [F-17].
- Uploaded APKs are parsed and their package name verified against the manifest; the
  file hash is computed by streaming rather than a synchronous 500 MB read [F-06].
- Credentials are redacted before reaching the audit table [F-16]. Passwords from
  `/change-password` and Wi-Fi pre-shared keys were being stored verbatim.
- Enrollment codes no longer reach application logs or device event rows.
- 17 mutating routes validate their bodies and parameters [F-05].
- `registerSchema` accepted roles the system does not define (`MANAGER`, `USER`) and
  rejected ones it does (`OPERATOR`, `VIEWER`); the default role is now `VIEWER`.
- Duplicate registration answers 409 rather than 400.
- Audit attribution is correct; `req.user?.id` was always undefined, so destructive
  actions were recorded as `system` or `admin` [F-21].

### Build

- **`npm run build` succeeds.** Backend type errors 231 → 0, dashboard 106 → 0, with the
  strict compiler settings (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noImplicitReturns`) left on. There was previously no production build path at all.
- **A fresh clone builds with `npm ci` alone.** The repository is now an npm workspace;
  `@mdm/shared-types` is symlinked rather than copied, so wire-contract edits take effect.
- **CI is a real gate.** Its `npm ci` previously failed outright, its Android job chmod'd
  a `gradlew` that is not in the repository, its frontend job ran a command that does not
  typecheck, and its audit step was `continue-on-error`.
- One `PrismaClient` instead of seventeen [F-24].
- Terminal error and 404 handlers, `unhandledRejection`/`uncaughtException` hooks, and
  SIGTERM draining [F-24]. A thrown async error previously hung the request until timeout.
- `@mdm/shared-types` is the single source of truth for `DeviceInfo`, with a test that
  parses the Kotlin model and fails on drift [F-19].

### Android — unverified

There is no Gradle wrapper in the repository and no Android toolchain was available, so
**none of the Kotlin below has been compiled or run on a device.**

- `UNLOCK_DEVICE` called `lockNow()` — the opposite of what it reported — and now checks
  for Device Owner privilege and fails honestly when it lacks it [F-10].
- `LOCATE_DEVICE` collected no location and sent no result while the dashboard recorded
  success; it now resolves a real fix and returns it [F-10].

### Tests

16 → 180 backend tests passing, 0 failing. Three suites were repaired: they assigned
mocks to objects the code under test never consulted, so their assertions ran against
`undefined` regardless of the implementation.

### Documentation

28 root status documents consolidated into `ARCHITECTURE.md`, `SECURITY.md` and this
file, with operational guides moved to `docs/`. Compliance claims that were not backed by
a test were withdrawn — including "Comply with NIST SP 800-124 | ✅ YES | Full
compliance", which was asserted while enrollment was unauthenticated.

### Not done

Deliberately out of scope, and tracked in `SECURITY.md`: the Android re-platform from
Device Admin to Device Owner [F-07], certificate pinning [F-08], admin MFA and login
lockout [F-14], httpOnly session cookies [F-15], telemetry retention [F-22], and
multi-instance operation [F-23].

### Migration required

`backend/prisma/migrations/20260913000000_add_enrollment_and_device_refresh_tokens`
adds two tables. It is additive — two `CREATE TABLE`s and their indexes, no existing
table altered — and has **not** been applied.
