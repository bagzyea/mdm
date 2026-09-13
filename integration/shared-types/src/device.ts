/**
 * The device wire contract — the single source of truth (finding F-19).
 *
 * Three incompatible definitions of `DeviceInfo` existed. The backend's own type
 * declared `androidVersion` / `sdkVersion` / `fingerprint`; the enrollment controller
 * read `osVersion` / `apiLevel` / `buildNumber` / `storageTotal`; and the Android agent
 * sends the latter. 98 of the backend's type errors traced to that drift.
 *
 * The field names here match the agent's `@SerializedName` annotations in
 * `android-app/app/src/main/java/com/mdm/app/models/DeviceInfo.kt`, because that is what
 * is actually on the wire. `DEVICE_INFO_FIELDS` below is a runtime list of those names,
 * and `deviceContract.test.ts` in the backend parses the Kotlin model and fails if the
 * two ever diverge again.
 */

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  provider?: string;
  timestamp?: number;
}

export interface NetworkInfo {
  connectionType?: string;
  ssid?: string;
  carrier?: string;
  signalStrength?: number;
  ipAddress?: string;
  macAddress?: string;
}

export interface InstalledApp {
  packageName: string;
  appName: string;
  versionName: string;
  versionCode: number;
  isSystemApp?: boolean;
  installTime?: number;
}

/**
 * What an agent reports about itself at enrollment and on demand.
 *
 * Only `deviceId`, `manufacturer`, `model`, `osVersion` and `apiLevel` are guaranteed;
 * the agent omits the rest when a permission is missing or a value is unavailable.
 */
export interface DeviceInfo {
  deviceId: string;
  deviceName?: string;
  manufacturer: string;
  model: string;
  /** Android release string, e.g. "12". The backend column is `androidVersion`. */
  osVersion: string;
  /** Android API level, e.g. 31. The backend column is `sdkVersion`. */
  apiLevel: number;
  /** Build fingerprint. The backend column is `fingerprint`. */
  buildNumber?: string;
  serialNumber?: string;
  imei?: string;
  macAddress?: string;
  batteryLevel?: number;
  isCharging?: boolean;
  storageTotal?: number;
  storageUsed?: number;
  ramTotal?: number;
  ramUsed?: number;
  screenResolution?: string;
  location?: DeviceLocation;
  networkInfo?: NetworkInfo;
  installedApps?: InstalledApp[];
  isRooted?: boolean;
  isDeviceAdminActive?: boolean;
  securityPatchLevel?: string;
  lastUpdated?: number;
}

/**
 * Runtime mirror of `keyof DeviceInfo`, in the agent's declaration order.
 *
 * TypeScript interfaces vanish at compile time, so a cross-language contract test needs
 * the field names as data. The two assertions below make the compiler reject any change
 * to `DeviceInfo` that is not also made here.
 */
export const DEVICE_INFO_FIELDS = [
  'deviceId',
  'deviceName',
  'manufacturer',
  'model',
  'osVersion',
  'apiLevel',
  'buildNumber',
  'serialNumber',
  'imei',
  'macAddress',
  'batteryLevel',
  'isCharging',
  'storageTotal',
  'storageUsed',
  'ramTotal',
  'ramUsed',
  'screenResolution',
  'location',
  'networkInfo',
  'installedApps',
  'isRooted',
  'isDeviceAdminActive',
  'securityPatchLevel',
  'lastUpdated',
] as const;

export type DeviceInfoField = (typeof DEVICE_INFO_FIELDS)[number];

// Compile-time guard: every listed field exists on DeviceInfo, and every DeviceInfo
// field is listed. Either half failing is a type error at build time.
type _EveryListedFieldExists = Exclude<DeviceInfoField, keyof DeviceInfo>;
type _EveryFieldIsListed = Exclude<keyof DeviceInfo, DeviceInfoField>;

const _listedFieldsExist: _EveryListedFieldExists extends never ? true : never = true;
const _fieldsAreListed: _EveryFieldIsListed extends never ? true : never = true;
void _listedFieldsExist;
void _fieldsAreListed;

export interface DeviceHeartbeatData {
  deviceId: string;
  batteryLevel?: number;
  isCharging?: boolean;
  location?: DeviceLocation;
  networkInfo?: NetworkInfo;
  systemHealth?: Record<string, unknown>;
  appUsage?: Record<string, unknown>;
  storageInfo?: {
    total: number;
    available: number;
  };
  memoryInfo?: {
    total: number;
    available: number;
  };
}

export interface DeviceStatusUpdate {
  deviceId: string;
  status: string;
  location?: DeviceLocation;
  batteryLevel?: number;
  networkInfo?: NetworkInfo;
}

/** Statuses the backend persists. Mirrors the `DeviceStatus` enum in schema.prisma. */
export const DEVICE_STATUSES = [
  'ENROLLED',
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'WIPED',
] as const;

export type DeviceStatusValue = (typeof DEVICE_STATUSES)[number];

/** Response returned to an agent on successful enrollment. */
export interface EnrollmentResponse {
  success: boolean;
  message: string;
  deviceId: string;
  /** Short-lived access token. Named `deviceToken` for agent compatibility. */
  deviceToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  serverEndpoints: {
    api: string;
    websocket: string;
  };
}
