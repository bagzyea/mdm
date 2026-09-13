import { Prisma } from '@prisma/client';

/**
 * Small helpers for talking to Prisma under the project's strict compiler settings
 * (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `strict`).
 */

/**
 * Convert an optional structured value into something a nullable Json column accepts.
 *
 * Prisma distinguishes SQL NULL from JSON null, so a nullable Json field will not take a
 * TypeScript `null` — it wants `Prisma.DbNull`. Writing `x || null` therefore fails to
 * typecheck, which is what several enrollment fields were doing.
 */
export function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

/**
 * Drop keys whose value is `undefined`.
 *
 * Under `exactOptionalPropertyTypes`, `{ field: string | undefined }` is not assignable
 * to `{ field?: string }` — an explicitly-undefined property is different from an absent
 * one. Prisma inputs are full of optional fields, so building an object with possibly
 * undefined values and then stripping them is the cleanest way to satisfy both.
 */
export type DefinedOnly<T> = {
  // Keys whose type cannot be undefined stay required...
  -readonly [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  // ...and only the genuinely optional ones become optional, with undefined removed.
  -readonly [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

// `const` type parameter: without it, an object literal's property types widen
// (`status: 'ENROLLED'` becomes `string`) and Prisma's enum columns reject the result.
// `const` also marks properties readonly, which Prisma's input types reject, so
// DefinedOnly strips the modifier with `-readonly`.
export function definedOnly<const T extends Record<string, unknown>>(
  input: T
): DefinedOnly<T> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value;
  }

  return output as DefinedOnly<T>;
}

/** Narrow a caught `unknown` to something carrying a Prisma error code. */
export function isPrismaError(error: unknown): error is { code: string; message?: string } {
  return typeof error === 'object' && error !== null && typeof (error as any).code === 'string';
}

/** Best-effort message from a caught `unknown`. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
