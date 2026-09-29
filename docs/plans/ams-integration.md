# Plan: link MDM devices to the Asset Management System

Status: **planned**. Written 29 September 2026.

## Goal

Every tablet in MDM is tied to its record in the Asset Management System (AMS), so that:

- an operator looking at a device in MDM sees its AMS asset tag, custodian and department;
- AMS shows each tablet's last check-in, battery level and location from MDM;
- retiring, transferring or losing a device in one system is reflected in the other.

## What exists today

| | MDM | AMS |
|---|---|---|
| Identifier | `Device.deviceId` (agent-generated); `Device.assetTag` column exists, unused | `Asset.asset_tag` (unique), `Asset.serial_number` |
| Link table | `AssetRecord` (`externalAssetId`, `syncStatus`, `lastSyncAt`, `syncError`) exists, empty | none |
| API access | JWT for users; device tokens for agents | JWT for users only. No service account or API key |
| Directory | AD sign-in (Athens.ubos.local, `UBOS0`) | the same AD |

## Why it cannot be automatic yet

1. **Serial numbers are not readable by the agent.** On Android 10+ `Build.getSerial()`
   requires Device Owner (or carrier privileges). The agent runs as Device Admin, so it
   reports no serial, and MDM does not store one. Matching on serial becomes possible
   once the agent is provisioned as Device Owner — already the decided direction
   (`ARCHITECTURE.md`, "Decided: own Device Owner DPC").
2. **AMS has no machine-to-machine credential.** Every AMS asset route needs a person's
   JWT. MDM needs a scoped, revocable service credential to read assets and write
   device status.

## Phased plan

**Phase 1: manual link (no dependencies, about 2 days)**
- Expose `assetTag` on the MDM device API and let operators set it on the device page.
- On save, validate the tag against AMS (see Phase 2 for the credential) or, until then,
  store it unverified with `AssetRecord.syncStatus = 'UNVERIFIED'`.
- Print the MDM device ID as a QR code at enrollment so it can be scanned into AMS.

**Phase 2: AMS service access (AMS change, about 2 days)**
- AMS: add service-account API keys (hashed at rest, scoped to `asset:read` and
  `asset:update_telemetry`, revocable, audited), plus a lookup endpoint
  `GET /api/assets/lookup?assetTag=…|serialNumber=…`.
- MDM: store the key in `AMS_API_URL` / `AMS_API_KEY`; add `services/amsClient.ts` with
  timeouts and retries; verify tags on save and fill in `AssetRecord.externalAssetId`.

**Phase 3: automatic matching (after Device Owner provisioning)**
- The agent reports `serialNumber` at enrollment; MDM stores it on `Device`.
- On enrollment, MDM looks the serial up in AMS and links automatically. If there is no
  match, or more than one, the device goes to a review queue in the dashboard.

**Phase 4: two-way sync**
- MDM → AMS: last seen, battery, location and status, pushed by a scheduled job (not per
  heartbeat), recorded in `AssetRecord.lastSyncAt` / `syncError`.
- AMS → MDM: custodian and department changes, via an AMS webhook, update MDM's
  assignment fields; AMS disposal triggers MDM retirement.

## Decisions needed

- Who owns the AMS service-account change (Phase 2)?
- Is `asset_tag` or `serial_number` the authoritative key when the two disagree?
- Should AMS be the source of truth for custodian and department (recommended)?
