/**
 * JSON-safe device rows.
 *
 * Storage and RAM are BigInt columns, and `JSON.stringify` throws on BigInt. The same
 * four-line conversion had been copied into six handlers; this is the one copy.
 */
const BIGINT_DEVICE_FIELDS = ['totalStorage', 'availableStorage', 'totalRAM', 'availableRAM'] as const;

type BigIntField = (typeof BIGINT_DEVICE_FIELDS)[number];

export type SerializedDevice<T> = Omit<T, BigIntField & keyof T> & {
  [K in BigIntField & keyof T]: string | null;
};

export function serializeDevice<T extends Partial<Record<BigIntField, bigint | null>>>(
  device: T
): SerializedDevice<T> {
  const out: Record<string, unknown> = { ...device };
  for (const field of BIGINT_DEVICE_FIELDS) {
    if (field in device) {
      const value = device[field];
      out[field] = value ? value.toString() : null;
    }
  }
  return out as SerializedDevice<T>;
}
