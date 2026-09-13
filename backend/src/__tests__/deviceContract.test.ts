/**
 * Cross-language wire contract for DeviceInfo (finding F-19).
 *
 * Three incompatible definitions existed: the backend's own type declared
 * `androidVersion` / `sdkVersion` / `fingerprint`; the enrollment controller read
 * `osVersion` / `apiLevel` / `buildNumber` / `storageTotal`; and the Android agent sends
 * the latter. 98 of the backend's type errors traced to that drift, and nothing would
 * have caught it — the two sides are in different languages, so the compiler cannot.
 *
 * This test reads the agent's Kotlin model directly and compares its @SerializedName
 * annotations against the runtime field list exported by @mdm/shared-types. Changing
 * either side alone fails the build.
 */

import * as fs from 'fs';
import * as path from 'path';

import { DEVICE_INFO_FIELDS, DEVICE_STATUSES } from '@mdm/shared-types';

const KOTLIN_MODEL = path.resolve(
  __dirname,
  '../../../android-app/app/src/main/java/com/mdm/app/models/DeviceInfo.kt'
);

/**
 * Extract the @SerializedName values from one Kotlin data class.
 *
 * The file declares several data classes, so the body is sliced from `data class <name>(`
 * to the matching line that closes it.
 */
function serializedNamesOf(source: string, className: string): string[] {
  const header = `data class ${className}(`;
  const start = source.indexOf(header);

  if (start === -1) {
    throw new Error(`Kotlin data class ${className} not found — has the agent model moved?`);
  }

  const rest = source.slice(start + header.length);
  const end = rest.search(/^\)/m);

  if (end === -1) {
    throw new Error(`Could not find the end of data class ${className}`);
  }

  const body = rest.slice(0, end);
  return [...body.matchAll(/@SerializedName\("([^"]+)"\)/g)].map((m) => m[1] as string);
}

describe('DeviceInfo wire contract (F-19 regression)', () => {
  let kotlinSource: string;

  beforeAll(() => {
    // If the agent is not checked out beside the backend this test cannot run; failing
    // loudly is correct, since the contract would then be unverified.
    expect(fs.existsSync(KOTLIN_MODEL)).toBe(true);
    kotlinSource = fs.readFileSync(KOTLIN_MODEL, 'utf8');
  });

  it('agrees field-for-field with the Android agent model', () => {
    const kotlinFields = serializedNamesOf(kotlinSource, 'DeviceInfo');
    const sharedFields = [...DEVICE_INFO_FIELDS];

    // Sorted comparison so a reordering is not treated as a breaking change, while a
    // genuine addition, removal or rename on either side fails.
    expect([...kotlinFields].sort()).toEqual([...sharedFields].sort());
  });

  it('lists the fields in the order the agent declares them', () => {
    // Not a correctness requirement, but keeping the order aligned makes reviewing a
    // change to either file straightforward.
    expect([...DEVICE_INFO_FIELDS]).toEqual(serializedNamesOf(kotlinSource, 'DeviceInfo'));
  });

  it('finds no field the agent sends that the server does not model', () => {
    const unknownToServer = serializedNamesOf(kotlinSource, 'DeviceInfo').filter(
      (field) => !(DEVICE_INFO_FIELDS as readonly string[]).includes(field)
    );

    expect(unknownToServer).toEqual([]);
  });

  it('finds no field the server expects that the agent never sends', () => {
    const kotlinFields = serializedNamesOf(kotlinSource, 'DeviceInfo');
    const missingFromAgent = (DEVICE_INFO_FIELDS as readonly string[]).filter(
      (field) => !kotlinFields.includes(field)
    );

    expect(missingFromAgent).toEqual([]);
  });

  it('keeps the fields that enrollment actually persists', () => {
    // These are read by enrollDevice and written to Device columns. Losing one would
    // silently blank a column rather than fail, so they are pinned explicitly.
    for (const field of ['deviceId', 'manufacturer', 'model', 'osVersion', 'apiLevel']) {
      expect(DEVICE_INFO_FIELDS).toContain(field);
    }
  });

  it('agrees with the Prisma DeviceStatus enum', () => {
    const schema = fs.readFileSync(
      path.resolve(__dirname, '../../prisma/schema.prisma'),
      'utf8'
    );

    const match = schema.match(/enum DeviceStatus\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();

    const prismaValues = (match![1] as string)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//'));

    expect([...prismaValues].sort()).toEqual([...DEVICE_STATUSES].sort());
  });
});

describe('supporting models', () => {
  it('exposes the nested models the agent nests inside DeviceInfo', () => {
    const source = fs.readFileSync(KOTLIN_MODEL, 'utf8');

    // These are referenced by DeviceInfo.location / .networkInfo / .installedApps, so a
    // rename on the agent side must be noticed here too.
    expect(() => serializedNamesOf(source, 'DeviceLocation')).not.toThrow();
    expect(() => serializedNamesOf(source, 'NetworkInfo')).not.toThrow();
    expect(() => serializedNamesOf(source, 'InstalledApp')).not.toThrow();
  });
});
