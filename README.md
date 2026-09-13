# UBOS MDM

Mobile device management for the Uganda Bureau of Statistics census tablet fleet.

## Getting started

```bash
npm ci                 # installs backend, dashboard and shared types (npm workspace)
npm run build:types    # build the shared wire contract
cd backend && npx prisma generate
npm run build          # typecheck and build everything
```

The backend refuses to start without a real `JWT_SECRET` of at least 32 bytes:

```bash
export JWT_SECRET="$(openssl rand -base64 48)"
```

See `backend/env.example` for the full configuration, and `docs/QUICK_START_GUIDE.md`
for a walkthrough.

## Where things are

| | |
|---|---|
| `ARCHITECTURE.md` | How the system is built, and which parts are load-bearing |
| `SECURITY.md` | Controls in place (each tied to a test) and what is still open |
| `CHANGELOG.md` | What changed and when |
| `docs/` | Setup, Docker, build, testing and keystore guides |
| `backend/` | Express + Prisma + Socket.IO API |
| `admin-dashboard/` | React operator console |
| `android-app/` | Kotlin agent — **not currently built by CI** |
| `integration/shared-types/` | The wire contract shared by all three |

## Before you rely on this

Read `SECURITY.md` first. There is significant outstanding work, most of it in the
Android agent, and the document is explicit about what is verified and what is not.
