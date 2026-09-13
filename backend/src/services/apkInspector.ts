import * as crypto from 'crypto';
import * as fs from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Inspection of uploaded APKs (finding F-06).
 *
 * Uploaded APKs were never parsed or verified. The `packageName` recorded against a
 * file was taken from the request body with a default of `com.example.app` and was
 * never checked against the APK's actual manifest, so an APK could be installed on the
 * census fleet under the wrong identity. The file hash was also computed with a
 * synchronous `readFileSync` of a file up to 500 MB, which blocks the Node event loop
 * for the duration — one large upload stalls the whole server.
 *
 * This module provides the two primitives the upload path needs: a streaming hash, and
 * a manifest read that establishes what the APK actually claims to be.
 */

export interface ApkManifestSummary {
  packageName: string;
  versionName?: string;
  versionCode?: number;
}

export class ApkInspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApkInspectionError';
  }
}

/** ZIP local file header magic. An APK is a ZIP archive. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Compute the SHA-256 of a file without loading it into memory.
 * Replaces a synchronous whole-file read of up to 500 MB.
 */
export async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

/** Cheap structural check before handing the file to the manifest parser. */
async function assertLooksLikeZip(filePath: string): Promise<void> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, 4, 0);

    if (bytesRead < 4 || !buffer.equals(ZIP_MAGIC)) {
      throw new ApkInspectionError('File is not a valid APK: missing ZIP signature');
    }
  } finally {
    await handle.close();
  }
}

/**
 * Read the APK's binary AndroidManifest.xml and return what it declares.
 *
 * @throws ApkInspectionError when the file is not a parseable APK or declares no
 *         package name — in which case the upload must be rejected rather than
 *         recorded under a caller-supplied identity.
 */
export async function readApkManifest(filePath: string): Promise<ApkManifestSummary> {
  await assertLooksLikeZip(filePath);

  // Required lazily: this keeps the module importable (and unit-testable) in
  // environments where the optional native-free parser is not installed.
  let ApkReader: any;
  try {
    ApkReader = require('adbkit-apkreader');
  } catch {
    throw new ApkInspectionError(
      'APK manifest parser (adbkit-apkreader) is not installed; cannot verify upload'
    );
  }

  let manifest: any;
  try {
    const reader = await ApkReader.open(filePath);
    manifest = await reader.readManifest();
  } catch (error: any) {
    throw new ApkInspectionError(
      `Could not read the APK manifest: ${error?.message ?? 'unknown parse error'}`
    );
  }

  const packageName = manifest?.package;
  if (typeof packageName !== 'string' || packageName.trim() === '') {
    throw new ApkInspectionError('APK manifest declares no package name');
  }

  const summary: ApkManifestSummary = { packageName: packageName.trim() };

  if (typeof manifest.versionName === 'string' && manifest.versionName.trim() !== '') {
    summary.versionName = manifest.versionName.trim();
  }
  if (Number.isInteger(manifest.versionCode)) {
    summary.versionCode = manifest.versionCode;
  }

  return summary;
}

/**
 * Verify that a caller-supplied package name matches what the APK actually declares.
 *
 * The manifest is authoritative. A caller may omit the package name entirely — in
 * which case the manifest's value is simply adopted — but may not contradict it.
 */
export function assertPackageNameMatches(
  declared: unknown,
  manifest: ApkManifestSummary
): void {
  if (declared === undefined || declared === null || declared === '') return;

  if (typeof declared !== 'string' || declared.trim() !== manifest.packageName) {
    throw new ApkInspectionError(
      `Package name mismatch: the request says "${String(declared)}" but the APK manifest ` +
        `declares "${manifest.packageName}"`
    );
  }
}
