# Changelog

Notable changes to UBOS MDM. Dates are the date the work landed.

This file starts at 13 September 2026. Earlier history is in `git log`; the status
documents that previously served as an informal changelog were withdrawn because several
recorded work as complete that was not (see `SECURITY.md`).

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
