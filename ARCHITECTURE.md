# Architecture

How UBOS MDM is put together, and which parts are load-bearing versus aspirational.
Last updated **13 September 2026**.

This replaces several overlapping design and comparison documents. Where a component is
planned rather than built, it says so.

---

## What this system is for

Managing a fleet of dedicated Android tablets used by census enumerators. Two things
make it different from a conventional corporate MDM, and both should survive any
redesign:

1. **Enumerators are offline for days.** A generic MDM assumes a device reaches the
   internet most days. Store-and-forward, long command TTLs, resumable downloads and
   local policy persistence matter more here than they do for an office fleet — and the
   current WebSocket-centric design is backwards for it.
2. **Per-district data folders ship alongside custom APKs.** Forms, lookup tables and GIS
   data are delivered per district. The `APKDataFolder` model with `applicableDistricts`
   is real product thinking and is not something Managed Google Play would give you.

---

## Repository layout

An npm workspace. One `npm ci` at the root installs everything.

```
package.json                 workspace root
integration/shared-types/    @mdm/shared-types — the wire contract, symlinked
backend/                     Express + Prisma + Socket.IO API
admin-dashboard/             React + MUI + Vite operator console
android-app/                 Kotlin agent  (built by CI; never run on a device)
```

`@mdm/shared-types` is the single source of truth for what crosses the wire. It was
previously duplicated in three places with three different shapes; the backend's copy is
gone and `deviceContract.test.ts` parses the Kotlin model to prove the two agree.

> Because it is a workspace, shared-types is **symlinked** into `node_modules`. Under
> the previous `file:` dependency npm *copied* it, so edits silently had no effect until
> `node_modules/@mdm` was deleted. If you change the wire contract, run
> `npm run build:types`.

---

## Backend

Express 5 on Node 20, Prisma against Postgres, Socket.IO for realtime.

**Request path.** Mounts establish authentication only; every route declares its own
`requirePermission` or `requireRole`. This is deliberate — a single check at the mount
point was previously inherited by every route beneath it, which meant read-only tokens
reached destructive endpoints. `routeAuthorization.test.ts` walks the live route table
and fails if any route lacks a guard, so the pattern cannot quietly regress.

**Configuration.** `src/config/env.ts` resolves and validates every secret once, at boot,
and throws if any is missing or weak. Nothing else reads `process.env` for a secret.

**Database.** One `PrismaClient`, exported from `src/db.ts`. Seventeen modules previously
constructed their own, meaning seventeen connection pools per process.

**Realtime.** `src/socket/auth.ts` authenticates the Socket.IO handshake and pins the
device identity from the token claim onto `socket.data`. Event payloads are never trusted
for identity; room membership follows from the token.

**Lifecycle.** Terminal 404 and error handlers, `unhandledRejection` and
`uncaughtException` hooks, and SIGTERM draining with a 15-second deadline.

### Known architectural limits

- **Single instance only.** The command queue and heartbeat monitor are `setInterval`
  loops with no distributed lock; a second replica double-sends every command. Socket.IO
  has no Redis adapter, so rooms do not span instances. `redis` is a declared dependency
  used nowhere. (F-23)
- **Telemetry is unbounded.** Every heartbeat writes a `DeviceEvent` row with a JSON
  blob. At 10,000 tablets this is millions of rows per day with no partitioning, rollup
  or retention. (F-22)
- **The transport is inverted.** Holding a per-device socket is what caps scaling. The
  intended design is FCM high-priority wake plus an authenticated pull, with WebSockets
  kept for the dashboard only.

---

## Admin dashboard

React 18 + TypeScript + MUI + Vite. 21 pages including map view, bulk deployment, device
retirement, the APK selection builder and provisioning sessions with live progress.

Note that `vite build` does **not** typecheck. `npm run type-check` is a separate
command and a separate CI gate; without it, type errors ship.

---

## Android agent

Kotlin, `minSdk 30`, `targetSdk 35`.

**The agent is built by CI** as of 13 September 2026 — `assembleDebug` and
`testDebugUnitTest` are blocking gates. Before that `gradlew` was not in the repository
(only `gradlew.bat`), so the Android job could never have run, and the agent had in fact
never compiled: it carried two Kotlin errors predating the readiness review.

It has still **never been run on a device**. Everything here is verified by compiler and
unit test only, and the Activity/service lifecycle work in particular needs real hardware
before release.

This remains the largest piece of outstanding work.

It registers a `DeviceAdminReceiver` — the legacy Device Admin API, deprecated since
Android 9 — while most of what it needs requires Device Owner. Those calls still cannot
work, but the agent no longer claims they did: each is gated on the privilege the platform
reports, and unenforceable settings come back as UNSUPPORTED with the reason.

What remains is becoming Device Owner: no `GET_PROVISIONING_MODE` handler, no
`ADMIN_POLICY_COMPLIANCE` activity, no QR payload generation. Release signing is in place
now, and `./gradlew printProvisioningChecksum` emits the DPC signature checksum that
payload needs.

### Decided: own Device Owner DPC

Chosen 13 September 2026, over Google's Android Management API.

AMAPI is dramatically less work and Google-operated, but it will not deploy the
per-district data folders or the custom provisioning flow — and those *are* the product.
The cost is that the DPC, its provisioning path and its policy surface are all ours to
build and maintain.

Command execution is structured for this: `CommandExecutor` is owned by
`MDMBackgroundService`, so it does not depend on an Activity, and policy calls already
declare the privilege they require.

---

## Data model

`backend/prisma/schema.prisma` is the strongest artefact in the repository: devices,
policies, commands, events, certificates, compliance, provisioning profiles and sessions,
an APK registry with per-app data folders, departments, transfers and retirement — with
considered indexes on the hot paths.

Two tables added September 2026: `EnrollmentToken` and `DeviceRefreshToken`, both storing
only hashes of their secrets.

Be aware that the schema anticipates features that are not implemented. Compliance report
tables exist with no evaluation logic behind them; `executeAt`/`expiresAt` are accepted by
the command API but have no columns and are discarded.

---

## Request and command flow

```
Enrollment
  admin issues a single-use code (dashboard → POST /api/devices/enrollment-code)
  code is embedded in the QR provisioning payload
  device → POST /api/devices/enroll { deviceInfo, enrollmentCode }
  server verifies the code, creates the device, returns a short access token
    plus a 90-day refresh token
  device → POST /api/devices/token/refresh when the access token expires
    (re-checks device status; a wiped or retired device is refused)

Commands
  operator → POST /api/commands { deviceIds, command, parameters }
  validated, persisted PENDING, dispatched over the device's socket room
  device reports back over the socket; identity comes from the token, not the payload

  A device that was offline picks commands up on its next periodic poll or FCM wake
  (CommandPollingWorker), which execute through the same CommandExecutor. The server
  side of this is still wrong: commands are expired after five minutes (F-25).

APK delivery
  upload → manifest parsed, package name verified, streaming SHA-256
  dispatch → a fresh signed, expiring URL is minted per payload
  device downloads by plain GET; the signature is the authentication
```

---

## Testing

180 backend tests. The security-critical surfaces are covered structurally rather than
by example, so new code is caught by default:

- `routeAuthorization.test.ts` walks the real Express route table.
- `deviceContract.test.ts` parses the Kotlin model and compares it to the TypeScript
  contract — the cross-language check a compiler cannot do.
- `socketAuthentication.test.ts` drives a real Socket.IO client against the production
  middleware, imported rather than reimplemented.

The dashboard has 20 tests of which 15 fail; they have not been addressed.
