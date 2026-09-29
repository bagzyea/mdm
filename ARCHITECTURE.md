# Architecture

How UBOS MDM is built, how data moves through it, and where its limits are. Last
updated **29 September 2026**. Where something is planned rather than built, this
document says so.

---

## What the system is for

Managing a fleet of dedicated Android tablets used by census enumerators. Two things set
it apart from an office MDM, and any redesign must keep them:

1. **Tablets are offline for days.** Commands wait for a tablet (seven days by
   default), every agent call also works over plain HTTP polling, and results reported
   offline are delivered when the tablet reconnects. The live socket speeds things up;
   nothing depends on it.
2. **Per-district data travels with custom apps.** Forms, lookup tables and GIS data are
   delivered per district alongside APKs (`APKDataFolder.applicableDistricts`). Managed
   Google Play cannot do this, which is why MDM runs its own agent. *Status: the data
   model exists; the server code that deploys data folders
   (`enhancedProvisioningService`, `dataFolderService`) is not wired to any route yet.*

### What it replaces, and the field requirements that come with it

MDM succeeds the **2024 NPHC Device Provisioner**, a Python + ADB desktop tool that set
up tablets over USB cables, in batches, before the census. MDM is meant to do the same
over the air, and keep doing it in the field. The provisioner's requirements carry over:

| Requirement | Status in MDM |
|---|---|
| Tablet models: Laxton, ZTE, MiOne, Samsung T225 / T295 | Profiles and field configurations target models (`deviceModels`) |
| Core apps: CSentry, WPS Office, Field Management Tool, PDF reader, with permissions granted | `PROVISION_DEVICE` installs listed APKs; silent install and permission grants need Device Owner |
| APNs: UBOS-MTN (`ubos.mtn.com`), UBOS-Airtel (`ubos.airtel.co.ug`) | Needs Device Owner (reported UNSUPPORTED until then) |
| Device settings: screen timeout (60 s), device PIN, enumerator account | Timeout works as Device Admin; PIN rules and accounts need Device Owner |
| District-based data: CAPI forms, lookup tables, map tiles (TPK), EA codes | Data model exists (`APKDataFolder`); deployment not wired yet |
| Quality control: pass/fail per device after provisioning | Table exists (`QualityControlResult`); no checks implemented |
| Training and Post-Enumeration Survey (PES) configurations | Expressible as separate profiles; nothing specific built |
| Progress: devices provisioned per day, logs, CSV export | Per-session progress and logs; no daily count or export yet |

The provisioner set one PIN (`1234`) on every tablet. MDM should not carry that over: a
shared, published PIN protects nothing.

---

## Components

```
Android agent (Kotlin)                      Admin dashboard (React/MUI, Vite :5002)
  │ Socket.IO when connected                  │ REST  /api  (proxied, same-origin)
  │ HTTP (device token) always                │ Socket.IO direct to :5001 (live updates)
  ▼                                           ▼
┌────────────────────────── Backend (Express 5, Node 20, :5001) ─────────────────────────┐
│ routes/*            operator API (user JWT, per-route permission guard)                │
│ routes/deviceAgent  agent API (device JWT, requireDevice guard)                        │
│ socket/             handshake auth (token + current device state), identity rooms      │
│ services/                                                                              │
│   commandService      the one way commands are created, delivered, polled, expired    │
│   telemetryService    the one heartbeat pipeline (sampled event history)              │
│   devicePresence      presence vs lifecycle status rules; stale-device sweep          │
│   enrollmentService   single-use codes, device access + refresh tokens                │
│   provisioningService + provisioningOutcome   provisioning, bulk deploy, field config │
│   directoryService    Active Directory sign-in                                        │
└───────────── Prisma ─▶ PostgreSQL 14 ──── Redis (declared, unused) ──── AD (LDAP) ─────┘
```

`@mdm/shared-types` (`integration/shared-types/`) is the wire contract: device info,
heartbeat and the command vocabulary. Tests parse the Kotlin sources to prove the agent
agrees with it (`deviceContract.test.ts`, `commandContract.test.ts`).

The repository is an npm workspace; one `npm ci` at the root installs everything.
Deployment is described in [`docs/operations.md`](docs/operations.md).

---

## How data flows

### Enrollment
1. An administrator generates a single-use, expiring code (Devices → Enroll Device).
2. On the tablet, the agent asks for the code and posts it with its device info to
   `POST /api/devices/enroll`.
3. In one transaction the server spends the code, creates or updates the device, and
   issues a **1-hour access token** plus a **90-day refresh token** (stored hashed).
4. The agent renews its access token at `POST /api/devices/token/refresh`. A refresh is
   refused, and the tokens are revoked, if the device has been suspended, wiped, retired
   or deleted.

### Commands
1. An operator (or a policy, provisioning or field-configuration action) calls
   `CommandService.createCommands`. It:
   - refuses anything not in `AGENT_COMMANDS` (422);
   - skips suspended, wiped and retired devices;
   - writes the commands and an event per command.
2. If the tablet has a live socket, the command is pushed to its room and marked SENT.
   Otherwise it stays PENDING.
3. An offline tablet collects PENDING commands with
   `GET /api/devices/:id/commands/pending`. It polls when a heartbeat reports pending
   work, and every 4 hours regardless.
4. The agent reports the result over the socket or `POST /api/commands/:id/result`.
   The result settles the command. For field configuration, it also settles the
   device's progress in the session.
5. Commands not collected within `COMMAND_TTL_SECONDS` (7 days) are marked FAILED.

### Telemetry and presence
- Heartbeats arrive over the socket or `POST /api/devices/:id/heartbeat`. All paths go
  through `recordHeartbeat`, which:
  - updates the device row;
  - samples a history event at most every 15 minutes per device;
  - broadcasts to dashboards.
- **Presence** (ENROLLED / ACTIVE / INACTIVE) is changed by the system: heartbeats, the
  5-minute stale sweep, disconnects.
- **Lifecycle** (SUSPENDED / WIPED, and retirement) is changed only by administrators.
  Every automatic write is conditional on a presence status, so a heartbeat can never
  undo a suspension.
- Suspending, wiping or retiring a device revokes its tokens and closes its socket at
  once.

### Provisioning and field configuration
- **Provisioning profiles** and **bulk app deployment** send `PROVISION_DEVICE`: the
  agent downloads, verifies and installs the listed APKs and reports progress.
- **Field configuration** sends `APPLY_FIELD_CONFIGURATION`: `{section: {setting:
  value}}`, applied through the agent's privilege-checked `PolicyEngine`. The agent
  reports every setting as applied, unsupported (with the privilege it needs) or not
  recognised.
- A session stays IN_PROGRESS until every device has reported. It then becomes
  COMPLETED, or FAILED if any device failed.

### APK delivery
Upload → manifest parsed, package name verified, streaming SHA-256 → at dispatch a fresh
signed, expiring download URL is minted per payload; the signature is the authentication.

### Sign-in
Operators sign in with an MDM password or their UBOS Active Directory account (bind as
the user; same directory as AMS). The role always comes from the MDM account.

---

## Data model

`backend/prisma/schema.prisma` covers:
- devices, policies, commands, events;
- certificates, security status, compliance reports;
- provisioning profiles, sessions and progress;
- the APK registry with data folders;
- departments, transfers, retirements;
- enrollment and device refresh tokens;
- `AssetRecord` / `Device.assetTag`, reserved for the AMS link
  ([`docs/plans/ams-integration.md`](docs/plans/ams-integration.md)).

**Migrations** build this exact schema from an empty database; a drift check
(`prisma migrate diff --exit-code`) is described in `docs/operations.md`. Multi-step
writes (enrollment, transfer approval, retirement) are transactions.

Anticipated but not implemented:
- compliance-report tables have no evaluation logic;
- `executeAt` is accepted by the command API but only delays the immediate push.

---

## Known limits

- **Single instance only.** The command queue, heartbeat sweep and certificate check are
  `setInterval` loops with no lock, provisioning pause state is in memory, and Socket.IO
  has no Redis adapter. A second replica would double-send commands.
- **Fleet-wide reads.** The dashboard's overview loads every device (with recent commands
  and events) and computes statistics in the browser; the device list has no maximum
  page size. Fine at today's scale, not at 10,000 tablets.
- **Dashboards get every heartbeat.** Broadcasts are not throttled or batched.
- **The agent is Device Admin**, so many settings are reported UNSUPPORTED until it is
  provisioned as Device Owner ([`docs/android-agent.md`](docs/android-agent.md)).
- **No push notifications.** The server sends no FCM wake-ups; offline tablets rely on
  heartbeats and the 4-hourly poll.
- **Code structure.** `server.ts` still holds the socket handlers and background jobs;
  several controllers query the database directly rather than through services; the
  dashboard mixes React Query with ad-hoc fetching, and some pages exceed 900 lines.

### Decided: our own Device Owner app

Chosen 13 September 2026, over Google's Android Management API. AMAPI is far less work,
but it cannot deploy per-district data folders or the custom provisioning flow, and
those are the product. The cost is that the agent, its provisioning path and its policy
surface are ours to build and maintain. Command execution is already structured for
it: commands run in the foreground service and every policy call declares the privilege
it needs.

---

## Testing

| Suite | Count | Notable structural checks |
|---|---|---|
| Backend (Jest, typechecked) | 286 | `routeAuthorization` walks the live route table; `deviceContract` / `commandContract` parse the Kotlin; `socketAuthentication` drives a real Socket.IO client |
| Android agent (JUnit) | 41 | policy outcomes, privilege levels, certificate pins, token refresh, field configuration |
| Dashboard (Vitest) | 109 | 12 fail and have for some time; not yet addressed |

Nothing in the agent has run on a real tablet yet.
