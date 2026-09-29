# Operations

How UBOS MDM runs on UBOSASSETS-HQ (10.10.10.241), and how to deploy, configure,
administer, back up and troubleshoot it. Last reviewed **29 September 2026**.

---

## What runs where

| Port | Component | How it runs |
|---|---|---|
| 5002 | Admin dashboard | systemd `mdm-dashboard.service`: Vite, from `admin-dashboard/` on the host |
| 5001 | Backend API + Socket.IO | Docker container `mdm-mdm-backend-1` |
| 5433 | PostgreSQL 14 | Docker container `mdm-db-1` (volume `mdm_postgres_data`) |
| 6379 | Redis | Docker container `mdm-redis-1` |

- The containers share the Docker network `mdm_default`. Inside it, the database is `db`
  and Redis is `redis`.
- The dashboard proxies `/api` to the backend, so REST calls are same-origin.
  Socket.IO connects straight to :5001, so the dashboard's origin must be allowed; see
  [Troubleshooting](#troubleshooting).
- The backend container bind-mounts `backend/` and runs `nodemon`: editing
  `backend/src` on the host reloads the live API. Dependencies and the shared
  `@mdm/shared-types` contract are baked into the image, so changing either needs a
  redeploy.
- **Everything restarts on its own.** The containers are `restart: unless-stopped`
  (Docker starts at boot) and the dashboard service is `enabled`.
- The AMS application on :3000 / :5000 is separate.

Two old systemd units, `mdm-backend.service` and `mdm-docker.service`, are disabled and
must stay disabled: they duplicate the containers.

---

## Deploying

```bash
cd /home/assetmanager/mdm
git pull                       # or merge the branch you are releasing
ops/deploy-backend.sh
```

The script:
1. builds the image from the repository root;
2. runs `prisma migrate deploy` against the live database;
3. replaces the backend container;
4. waits for the health check.

This host has no `docker compose`, so the script does the equivalent with plain
`docker`. `docker-compose.dev.yml` describes the same setup for machines that have it.

- **Back up first** if the release contains a migration (`backend/prisma/migrations/`).
- **Dashboard changes** are picked up by Vite automatically. Restart the service only if
  its dependencies change: `sudo systemctl restart mdm-dashboard`.
- **Android agent** releases are separate: see [`android-agent.md`](android-agent.md).
  Backend and agent must stay compatible. The command list is shared and checked by
  `commandContract.test.ts`.

---

## Configuration

All backend settings live in **`ops/backend.env`**: mode 600, never committed.
`ops/backend.env.example` documents every key. The main ones:

| Setting | Notes |
|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | ≥ 32 bytes (`openssl rand -base64 48`). The server refuses to start otherwise. Rotating them signs everyone out; devices recover by refreshing |
| `ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`). Encrypts certificate private keys. **Do not change** once certificates exist, or they become unreadable |
| `ALLOWED_ORIGINS`, `DASHBOARD_PORT` | Dashboard origins allowed to call the API and open sockets |
| `PUBLIC_BASE_URL` | Base of the signed APK download links sent to tablets. Unset means relative links, and tablets cannot download apps |
| `AD_SERVER`, `AD_DOMAIN`, `AD_BASE_DN`, `AD_PORT`, `AD_USE_LDAPS` | Active Directory sign-in (below) |
| `LDAP_AUTO_PROVISION_ROLE` | Empty = only people added to MDM may sign in (recommended) |
| `COMMAND_TTL_SECONDS` | How long a queued command waits for an offline tablet (default 7 days) |
| `DEVICE_ACCESS_TOKEN_TTL_SECONDS`, `DEVICE_REFRESH_TOKEN_TTL_DAYS` | Device credentials: 1 hour / 90 days by default |

After editing, run `ops/deploy-backend.sh` again. It is safe to re-run.

---

## Accounts and roles

| Role | Can |
|---|---|
| Super admin | Everything |
| Admin | Manage users, devices, policies, commands, provisioning, certificates, security |
| Operator | View; update devices; apply policies; send commands; run provisioning |
| Viewer | View only |

**Add a person** (dashboard → Users → Add):
1. Set **Username** to their UBOS domain username (e.g. `allan.agaba`) and **Email** to
   their UBOS email.
2. Choose a role.
3. The password field only sets a local fallback password. They sign in with their
   domain password.

**Forgotten password (local accounts):** on the server, run
`ops/set-password.sh <username-or-email>`. It prompts for the new password,
re-activates the account and signs out its existing sessions. Domain users reset their
password through IT, as for any UBOS login.

**Remove access:** deactivate the account in Users. A deactivated account cannot sign in,
even with a correct domain password.

### Active Directory sign-in

MDM uses the same directory as the Asset Management System: `Athens.ubos.local`, domain
`UBOS0`, base `DC=ubos,DC=local`.
- It binds as the person, as `UBOS0\name` or `name@domain`. No service account is
  needed.
- AD proves who someone is; their MDM account decides what they may do.
- A local MDM password is tried first, then AD.

> **Open item:** AD is reached over plain LDAP (port 389), so sign-in passwords cross the
> network unencrypted. The same is true for AMS. When IT enables LDAPS, set
> `AD_USE_LDAPS=true` and `AD_PORT=636` and redeploy.

---

## Backups

Take one before any release that includes a migration:

```bash
mkdir -p /home/assetmanager/backups/mdm
docker exec mdm-db-1 pg_dump -U mdm_user -d mdm_dev -Fc \
  > /home/assetmanager/backups/mdm/mdm_dev-$(date +%Y%m%d-%H%M%S).dump
```

Restore (this **replaces** the live data; stop the backend first):

```bash
docker stop mdm-mdm-backend-1
docker exec -i mdm-db-1 pg_restore -U mdm_user -d mdm_dev --clean --if-exists < <file>.dump
docker start mdm-mdm-backend-1
```

There is no scheduled backup yet. One should be set up (a nightly cron of the
`pg_dump` above, with rotation).

---

## Database migrations

Migrations live in `backend/prisma/migrations/` and are applied by the deploy script.
All of them apply cleanly to an empty database, and the result matches
`schema.prisma` exactly. To check a database for drift (the exit code is 0 when it
matches):

```bash
cd backend && npx prisma migrate diff \
  --from-url "postgresql://mdm_user:<password>@127.0.0.1:5433/mdm_dev" \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

Never mark a failed migration as applied by hand (`prisma migrate resolve --applied`)
without running its statements. That is how the live database came to lack its
certificate and security tables, which went unnoticed until 29 September 2026.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Dashboard loads but nothing updates live | Socket.IO blocked by CORS. `curl -s -i "http://10.10.10.241:5001/socket.io/?EIO=4&transport=polling" -H 'Origin: http://10.10.10.241:5002' \| grep -i access-control-allow-origin`: no output means the origin is missing from `ALLOWED_ORIGINS` |
| Backend won't start | `docker logs --tail 100 mdm-mdm-backend-1`. A configuration error names the missing or weak setting |
| Sign-in fails for a domain user | Their MDM account exists and is active, with the username matching their domain username or the email matching their UBOS email. "Directory could not be reached" in the error means AD is unreachable from the container |
| Dashboard down | `systemctl status mdm-dashboard`, `journalctl -u mdm-dashboard -n 100` |
| A tablet shows INACTIVE | It has not checked in for 5 minutes. Queued commands wait for it (7 days by default) |
| A tablet cannot connect after being suspended or wiped | Expected. Reactivate it (Devices → Activate), then it re-enrolls with a new code |

Running `docker` here: `~/.docker` belongs to another account, so set
`DOCKER_CONFIG` to a writable directory first (e.g. `export DOCKER_CONFIG=$HOME/.docker-mdm`).
