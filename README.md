# UBOS MDM

Mobile device management for the Uganda Bureau of Statistics census tablet fleet: enrol
tablets, push apps and settings to them, send commands (lock, locate, kiosk), and see
where they are and whether they are healthy, including tablets that are offline for days.

**This README is the master document.** Start here. It links to everything else, and it
is kept current: if something here is wrong, fix it here first.

Last reviewed: **29 September 2026**.

---

## Status at a glance

| Area | State |
|---|---|
| Backend API | Live on UBOSASSETS-HQ. 287 automated tests |
| Admin dashboard | Live at **http://ubosmdm.ubos.org:5002** (office network only) |
| Sign-in | MDM accounts, or a UBOS Active Directory login for people added to MDM |
| Android agent | Builds, with 41 unit tests. **Not yet run on a real tablet**, and still a Device Admin rather than a Device Owner, so many settings report "unsupported" |
| Asset Management System link | Planned: [`docs/plans/ams-integration.md`](docs/plans/ams-integration.md) |

What is verified and what is not is set out in [`SECURITY.md`](SECURITY.md). Read it
before relying on any control.

---

## Using it

Open **http://ubosmdm.ubos.org:5002** (or http://10.10.10.241:5002) from the office network
and sign in with either:

- your **UBOS domain account** (`jdoe`, `UBOS0\jdoe` or `jdoe@ubos.local`), if an
  administrator has added you to MDM; or
- an **MDM account** (username or email, plus its MDM password).

A domain login by itself grants nothing. Your role (Super admin, Admin, Operator or
Viewer) comes from your MDM account. How to add people and what each role can do is in
[`docs/operations.md`](docs/operations.md#accounts-and-roles).

---

## Running it

| Task | Command / place |
|---|---|
| Deploy or redeploy the backend | `ops/deploy-backend.sh` |
| Backend settings (secrets, Active Directory) | `ops/backend.env` (private; template `ops/backend.env.example`) |
| Dashboard service | `systemctl status mdm-dashboard` (Vite on :5002) |
| Health check | `curl http://10.10.10.241:5001/health` |
| Forgotten password (local account) | `ops/set-password.sh <username-or-email>` |
| Back up the database | see [`docs/operations.md`](docs/operations.md#backups) |
| Build the Android agent | `ops/build-agent.sh` (see [`docs/android-agent.md`](docs/android-agent.md)) |

Everything restarts on its own after a reboot or crash: the containers have
`restart: unless-stopped`, and the dashboard service is enabled.

---

## Documents

| Document | Read it for |
|---|---|
| `README.md` | This overview |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the system is built, how data flows, known limits |
| [`SECURITY.md`](SECURITY.md) | Controls in place (each tied to a test) and what is still open |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed and when |
| [`docs/operations.md`](docs/operations.md) | Deploying, configuring, accounts, AD, backups, troubleshooting |
| [`docs/android-agent.md`](docs/android-agent.md) | Building, signing, installing and testing the tablet agent |
| [`docs/plans/`](docs/plans/) | Work that is designed but not built |

The rules that keep these documents trustworthy:

1. **One place per topic.** Update the existing document; don't add a new status report.
2. **Nothing is "done" unless something checks it.** Claims of completeness must point to
   a test, or be listed as unverified. Earlier status documents recorded unbuilt work as
   complete, and were withdrawn.
3. **Plans go in `docs/plans/`**, and move into the main documents only once built.
4. **Date what you change** in `CHANGELOG.md`.

---

## Repository

```
backend/                    Express + Prisma + Socket.IO API (TypeScript)
admin-dashboard/            React + MUI operator console (Vite)
android-app/                Kotlin tablet agent
integration/shared-types/   @mdm/shared-types, the wire contract shared by all three
ops/                        Deployment and build scripts
docs/                       Operations and agent guides, plans
```

It is an npm workspace. For development:

```bash
npm ci                           # backend, dashboard and shared types
npm run build:types              # build the shared contract
cd backend && npx prisma generate && npm test      # 287 tests, typechecked
cd admin-dashboard && npm run type-check && npm run build
```

The backend refuses to start without a `JWT_SECRET` of at least 32 bytes
(`openssl rand -base64 48`). Every setting is documented in `ops/backend.env.example`.
