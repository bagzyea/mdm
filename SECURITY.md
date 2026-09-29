# Security

Status of the UBOS MDM security posture. Last updated **29 September 2026**.

This document replaces eleven overlapping status reports. Several of them asserted
compliance that did not hold — one stated "Comply with NIST SP 800-124 | ✅ YES | Full
compliance" while the enrollment endpoint accepted any device identity presented to it
and the JWT signing key fell back to a literal committed in this repository.

**The rule this document follows: a control is only listed as in place if something in CI
fails when it is removed.** Everything else is listed as open, with the finding number
from the September 2026 readiness review.

One caveat on the Android rows: they are compiled and unit-tested in CI, but **nothing in
the agent has been run on a real device**. Treat them as verified-by-compiler, not
verified-in-the-field.

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
| Suspending, wiping or retiring a device cuts it off immediately (tokens revoked, socket closed) | `deviceController.updateDeviceStatus`, retirement | `deviceLifecycle.test.ts` |
| A suspended or wiped device cannot reconnect or undo its status with heartbeats | `services/devicePresence.ts`, socket handshake | `devicePresence.test.ts`, `socketAuthentication.test.ts` |
| A revoked device cannot re-enroll itself with a spare code | `enrollDevice` | `deviceController.test.ts` |
| The agent HTTP API acts only as the device in the token | `middleware/deviceAuth.ts` | `deviceAgentApi.test.ts` |
| Only commands the agent implements can be queued | `AGENT_COMMANDS`, `CommandService.createCommands` | `commandContract.test.ts` (parses the Kotlin), `commandService.test.ts` |
| Only a super admin can grant or change super admin; no self-demotion; last super admin kept | `AuthService.assertCanManage` | `userManagement.test.ts` |
| User edits accept only email, names, role, active flag | `updateUserSchema` | `userManagement.test.ts` |
| An Active Directory login grants no MDM role by itself | `AuthService.login` | `directoryLogin.test.ts` |
| APK package name verified against its manifest | `backend/src/services/apkInspector.ts` | `apkSupplyChain.test.ts` |
| APK downloads require a signed, expiring URL | `backend/src/services/signedDownloads.ts` | `apkSupplyChain.test.ts` |
| Download links are bound to one file and expire | `verifyApkDownload()` | `apkSupplyChain.test.ts` |
| Credentials redacted before audit persistence | `backend/src/utils/redact.ts` | `auditRedaction.test.ts` |
| Enrollment codes never reach logs or event rows | `redact.ts` + `deviceController` | `deviceController.test.ts` |
| Mutating requests are schema-validated | Joi schemas on the device, command, policy and auth routes | `requestValidation.test.ts` |
| Errors do not leak stack traces in production | `backend/src/middleware/errorHandler.ts` | `errorHandling.test.ts` |
| The device wire contract cannot drift from the agent | `@mdm/shared-types` | `deviceContract.test.ts` — parses the Kotlin model |
| No secrets committed to the repository | CI | gitleaks, blocking |
| Policy results report what was actually enforced | `android-app/.../PolicyOutcome.kt` | `PolicyOutcomeTest` — 19 tests |
| Device Owner–only calls are not attempted without it | `DevicePrivilege` / `PrivilegeLevel` | `PrivilegeLevelTest` |
| Release builds cannot ship without certificate pins | `android-app/app/build.gradle` | `assembleRelease` fails; `PinConfigurationTest` |
| Release builds cannot ship unsigned | `android-app/app/build.gradle` | `assembleRelease` fails |
| Certificate pinning fails closed | `CertificatePinning` / `PinConfiguration` | `PinConfigurationTest` — 13 tests |
| Commands execute without a foregrounded Activity | `CommandExecutor` + `MDMBackgroundService` | built; **not device-tested** |
| The agent compiles at all | CI | `assembleDebug` + `testDebugUnitTest`, blocking |

---

## Open, and why it matters

Ordered by what would hurt most. Finding numbers refer to the September 2026 review.

### Critical

**F-07 — the agent is still not a Device Owner.**

Partly addressed. The app registers a `DeviceAdminReceiver` (legacy Device Admin) while
most of what it needs — user restrictions, kiosk/lock-task, the password policy block —
requires Device Owner. Those calls still cannot work.

What changed is that it no longer claims they did. Every policy call is gated on the
privilege the platform actually reports, a call above that privilege is not attempted,
and the result names the setting, the privilege required and the privilege held. The
dashboard is now told the truth about what was enforced.

What remains is the re-platform itself: there is no provisioning path to *become* Device
Owner — no `GET_PROVISIONING_MODE` handler, no `ADMIN_POLICY_COMPLIANCE` activity, no QR
payload generation. Release signing and the DPC signature checksum, which that path
depends on, are now in place (`./gradlew printProvisioningChecksum`).

Until a tablet is provisioned as Device Owner, policy enforcement reports UNSUPPORTED and
kiosk mode does not engage. That is the honest state, not a working one.

### High

- **F-14** — no brute-force protection and no MFA on admin login. Unauthenticated
  requests fall into the VIEWER rate-limit bucket (100 per 15 min per IP), which is ample
  for credential stuffing. `resetToken` columns exist with no implementation behind them.
- **F-15** — admin JWTs are held in `localStorage`, so any XSS yields a full admin
  session. `cookie-parser` is mounted but there is no httpOnly session flow. Refresh
  tokens are stored in the database in plaintext.
- **F-22** — telemetry retention. Heartbeat history is now sampled (one row per device
  per 15 minutes instead of one per heartbeat), but there is still no retention or
  rollup, and location history about enumerators is personal data with no retention
  policy.
- **Directory passwords in cleartext.** Active Directory sign-in uses plain LDAP (389),
  as AMS does, so sign-in passwords cross the network unencrypted. Enable LDAPS
  (`AD_USE_LDAPS=true`, port 636) when IT provides it.
- **F-23** — the server cannot run as more than one instance. The command queue and
  heartbeat monitor are bare `setInterval` loops with no distributed lock, and Socket.IO
  has no Redis adapter.

### Medium

- **F-20** — `executeAt` / `expiresAt` are accepted, have no columns, and are discarded
  (`executeAt` only suppresses the immediate push).
- No scheduled database backups (see `docs/operations.md`).
- No approval step on destructive commands. `WIPE_DEVICE` and bulk retirement need a
  second authorised approver.
- No SIEM export, no device-side audit events, no documented retention policy.

### Fixed since the review

- **F-18** — the agent now has a device-scoped HTTP API (`routes/deviceAgentRoutes.ts`).
- **F-25** — queued commands wait `COMMAND_TTL_SECONDS` (7 days by default), not 5
  minutes.
- Admins could promote themselves to super admin through the user-edit API; closed
  29 September 2026.

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
  Devices recover by refreshing; administrators must log in again. It was rotated on
  29 September 2026: the live value had been the placeholder published in the compose
  file.
- Device access tokens last 1 hour by default and refresh tokens 90 days
  (`DEVICE_ACCESS_TOKEN_TTL_SECONDS`, `DEVICE_REFRESH_TOKEN_TTL_DAYS`). Suspending,
  wiping or retiring a device revokes its refresh tokens and disconnects it immediately;
  its socket handshake and agent API calls are refused from then on.
- Settings and secrets live in `ops/backend.env` (mode 600, not committed).
