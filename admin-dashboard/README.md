# Admin dashboard

The UBOS MDM operator console: React 18, TypeScript, MUI, Vite.

It runs on the MDM server as `mdm-dashboard.service` at http://10.10.10.241:5002 and
proxies `/api` to the backend on :5001. How it is deployed, how people sign in and how
accounts are managed are in the repository's [`README.md`](../README.md) and
[`docs/operations.md`](../docs/operations.md).

```bash
npm ci                   # from the repository root (npm workspace)
cd admin-dashboard
npm run dev              # http://localhost:5002, proxies /api to localhost:5001
npm run type-check       # vite build does not typecheck; this does
npm run build
npm run test:run         # Vitest, once (12 known failures, see ARCHITECTURE.md)
```

`VITE_WS_URL` (in `admin-dashboard/.env`) is where the browser opens its Socket.IO
connection; that origin must be allowed by the backend's `ALLOWED_ORIGINS`.
