# Security

Status of the UBOS MDM security posture. Last updated **13 September 2026**.

This document replaces eleven overlapping status reports. Several of them asserted
compliance that did not hold — one stated "Comply with NIST SP 800-124 | ✅ YES | Full
compliance" while the enrollment endpoint accepted any device identity presented to it
and the JWT signing key fell back to a literal committed in this repository.

**The rule this document follows: a control is only listed as in place if something in
CI fails when it is removed.** Everything else is listed as open, with the finding
number from the September 2026 readiness review.

---

## Threat model, briefly

This is a fleet of single-purpose Android tablets used by census enumerators, managed
over the public internet, frequently out of network coverage for days. The assets worth
protecting, in order:

1. **Census data on the devices** — personal data about Ugandan residents.
2. **The fleet control plane** — anything that can wipe, lock or re-provision devices.
3. **Enumerator location data** — personal data about staff, not just device telemetry.
4. **The software supply chain** — the APKs and per-district data folders pushed to
   every tablet.

---

## Controls in place

Each row names the test that fails if the control is removed. These run in CI on every
push and pull request.

| Control | Enforced by | Test |
|---|---|---|
| Server refuses to start without a strong `JWT_SECRET` | `backend/src/config/env.ts` | Boot-time validation; rejects unset, short, and known placeholder values |
| One validated source for signing and encryption keys | `backend/src/config/env.ts` | — (three modules previously read the env independently) |
| `ENCRYPTION_KEY` required in production | `backend/src/config/env.ts` | Boot-time validation |
| Every API route carries an authorization guard | per-route `requirePermission` / `requireRole` | `routeAuthorization.test.ts` — walks the live Express route table |
| Every router mount authenticates | `server.ts` | `routeAuthorization.test.ts` |
| No route gated on a permission no role holds | — | `routeAuthorization.test.ts` |
| VIEWER cannot perform destructive actions | `ROLE_PERMISSIONS` | `routeAuthorization.test.ts` |
| Socket.IO connections require a valid token | `backend/src/socket/auth.ts` | `socketAuthentication.test.ts` |
| A device socket cannot impersonate another device | `resolveDeviceId()` | `socketAuthentication.test.ts` |
| Enrollment requires a single-use, expiring code | `backend/src/services/enrollmentService.ts` | `enrollmentHandshake.test.ts`, `deviceController.test.ts` |
| Enrollment codes stored only as hashes | `enrollmentService.ts` | `enrollmentHandshake.test.ts` |
| Device credentials are revocable | refresh tokens re-checked against device status | `enrollmentHandshake.test.ts` |
| Wiped / suspended / retired / deleted devices cannot refresh | `refreshDeviceCredentials()` | `enrollmentHandshake.test.ts` |
| APK package name verified against its manifest | `backend/src/services/apkInspector.ts` | `apkSupplyChain.test.ts` |
| APK downloads require a signed, expiring URL | `backend/src/services/signedDownloads.ts` | `apkSupplyChain.test.ts` |
| Download links are bound to one file and expire | `verifyApkDownload()` | `apkSupplyChain.test.ts` |
| Credentials redacted before audit persistence | `backend/src/utils/redact.ts` | `auditRedaction.test.ts` |
| Enrollment codes never reach logs or event rows | `redact.ts` + `deviceController` | `deviceController.test.ts` |
| Mutating requests are schema-validated | Joi schemas on 17 routes | `requestValidation.test.ts` |
| Errors do not leak stack traces in production | `backend/src/middleware/errorHandler.ts` | `errorHandling.test.ts` |
| The device wire contract cannot drift from the agent | `@mdm/shared-types` | `deviceContract.test.ts` — parses the Kotlin model |
| No secrets committed to the repository | CI | gitleaks, blocking |

---

## Open, and why it matters

Ordered by what would hurt most. Finding numbers refer to the September 2026 review.

### Critical

**F-07 — the Android agent is on the wrong platform API.** It registers a
`DeviceAdminReceiver` (legacy Device Admin) while calling Device Owner–only methods,
guarded by `isAdminActive()`, which does not test for that. On the Android 11–15 devices
it targets, user restrictions, kiosk/lock-task mode and the password policy block will
throw `SecurityException` or silently no-op — and `applyPolicy` catches the exception and
returns a result object, so **the dashboard reports policies as applied when they are
not**. There is no provisioning path to become Device Owner: no `GET_PROVISIONING_MODE`
handler, no QR payload checksum, no zero-touch configuration.

**F-08 — certificate pinning does not engage.** `shouldEnablePinning()` returns a literal
`false` and all three pins are placeholder strings. `AppConfig.CERTIFICATE_PINNING_ENABLED
= true` is a dead constant nothing reads. A previous document listed pinning as complete
and NIST-compliant.

### High

- **F-09** — commands execute inside an Activity, so lock, kiosk and policy commands only
  run when the app is foregrounded. On a tablet in a bag, they do not run.
- **F-11** — release builds are unsigned; `signingConfig` is commented out. This also
  blocks F-07, since Device Owner provisioning needs the DPC signature checksum.
- **F-14** — no brute-force protection and no MFA on admin login. Unauthenticated
  requests fall into the VIEWER rate-limit bucket (100 per 15 min per IP), which is ample
  for credential stuffing. `resetToken` columns exist with no implementation behind them.
- **F-15** — admin JWTs are held in `localStorage`, so any XSS yields a full admin
  session. `cookie-parser` is mounted but there is no httpOnly session flow. Refresh
  tokens are stored in the database in plaintext.
- **F-18** — there is no coherent device API surface. Device-facing HTTP endpoints are
  gated on permissions the DEVICE role does not hold, so devices can only report over the
  socket.
- **F-22** — telemetry is unbounded. Every heartbeat inserts a row; no partitioning, no
  rollup, no retention. This is also a privacy problem: location history about
  enumerators is personal data with no retention policy.
- **F-23** — the server cannot run as more than one instance. The command queue and
  heartbeat monitor are bare `setInterval` loops with no distributed lock, and Socket.IO
  has no Redis adapter.

### Medium

- **F-12** — no `<queries>` declaration, so app inventory returns partial results silently.
- **F-20** — `executeAt` / `expiresAt` are accepted, have no columns, and are discarded.
- **F-25** — commands are marked FAILED after 5 minutes offline, which is wrong for field
  conditions measured in days.
- No approval step on destructive commands. `WIPE_DEVICE` and bulk retirement need a
  second authorised approver.
- No SIEM export, no device-side audit events, no documented retention policy.

---

## Standards

**No compliance claim is made.** The system has not been assessed against NIST SP 800-124
Rev. 2, and previous documents asserting compliance were withdrawn — they were written
alongside code that did not implement the controls they described.

NIST SP 800-124r2 is the right framework to be assessed against, and the gap is
concentrated in the areas above: device integrity verification (F-07, F-08), credential
lifecycle (largely closed), and audit/retention (open). An assessment is worth
commissioning once the agent re-platform lands, not before — it would fail today, and the
finding list would be the one above.

---

## Reporting a vulnerability

Report to the UBOS MDM engineering team directly. Do not open a public issue.

## Operational notes

- `JWT_SECRET` must be at least 32 bytes. Generate with `openssl rand -base64 48`.
- `ENCRYPTION_KEY` is mandatory in production. Data encrypted under a
  development-derived key becomes unreadable once a real key is set.
- Rotating `JWT_SECRET` invalidates every admin session and every device access token.
  Devices recover by refreshing; administrators must log in again.
- Device access tokens last 1 hour by default and refresh tokens 90 days
  (`DEVICE_ACCESS_TOKEN_TTL_SECONDS`, `DEVICE_REFRESH_TOKEN_TTL_DAYS`). Revoking a device
  takes effect within one access-token lifetime.
