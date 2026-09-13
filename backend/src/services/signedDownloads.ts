import * as crypto from 'crypto';
import * as path from 'path';
import config from '../config/env';

/**
 * Short-lived signed download URLs for APKs and data folders (finding F-06).
 *
 * Uploaded APKs were served from `app.use('/public/apks', express.static(...))` with no
 * authentication at all, leaking the full application inventory of the census fleet to
 * anyone who could reach the server and putting nothing between a hostile upload and
 * every tablet.
 *
 * Plain bearer authentication is awkward here because devices download APKs with a bare
 * HTTP GET during provisioning. A signed URL closes the hole without requiring any
 * change to the device downloader: the server mints a URL that is valid only for a
 * specific file and only for a short window, and embeds it in the provisioning payload
 * exactly where the unauthenticated URL used to go.
 */

/**
 * Signing key for download URLs. Derived from JWT_SECRET with domain separation so that
 * a download signature can never be confused with — or used as — a session token.
 */
const DOWNLOAD_SIGNING_KEY = crypto
  .createHash('sha256')
  .update(`mdm:download-url-signing:v1:${config.jwtSecret}`)
  .digest();

/** Default validity window. Long enough for a large APK over a poor field link. */
const DEFAULT_TTL_SECONDS = 60 * 60;

export interface SignedDownload {
  /** Path and query, relative to the server root. */
  url: string;
  expiresAt: Date;
}

export class InvalidDownloadSignature extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDownloadSignature';
  }
}

/**
 * Reject anything that is not a plain filename. Guards the download route against
 * path traversal, since the filename is used to build a filesystem path.
 */
export function assertSafeFilename(filename: string): void {
  if (
    typeof filename !== 'string' ||
    filename.trim() === '' ||
    filename !== path.basename(filename) ||
    filename.startsWith('.')
  ) {
    throw new InvalidDownloadSignature('Invalid file name');
  }
}

function computeSignature(filename: string, expiresAtEpochSeconds: number): string {
  return crypto
    .createHmac('sha256', DOWNLOAD_SIGNING_KEY)
    .update(`${filename}:${expiresAtEpochSeconds}`)
    .digest('hex');
}

/** Mint a signed, expiring URL for one APK file. */
export function signApkDownload(
  filename: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): SignedDownload {
  assertSafeFilename(filename);

  const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = computeSignature(filename, expiresAtEpochSeconds);

  const query = new URLSearchParams({
    expires: String(expiresAtEpochSeconds),
    sig: signature,
  });

  return {
    url: `/downloads/apks/${encodeURIComponent(filename)}?${query.toString()}`,
    expiresAt: new Date(expiresAtEpochSeconds * 1000),
  };
}

/**
 * Verify a signed download request.
 *
 * @throws InvalidDownloadSignature when the filename is unsafe, the signature does not
 *         match, or the link has expired.
 */
export function verifyApkDownload(
  filename: string,
  expires: unknown,
  signature: unknown
): void {
  assertSafeFilename(filename);

  const expiresAtEpochSeconds = Number(expires);
  if (!Number.isInteger(expiresAtEpochSeconds) || expiresAtEpochSeconds <= 0) {
    throw new InvalidDownloadSignature('Missing or malformed expiry');
  }

  if (typeof signature !== 'string' || signature.length === 0) {
    throw new InvalidDownloadSignature('Missing signature');
  }

  const expected = computeSignature(filename, expiresAtEpochSeconds);
  const provided = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  // Compare before checking expiry, and in constant time, so neither the validity of a
  // signature nor its length leaks through timing or through which error is returned.
  const signatureValid =
    provided.length === expectedBuffer.length &&
    crypto.timingSafeEqual(provided, expectedBuffer);

  if (!signatureValid) {
    throw new InvalidDownloadSignature('Invalid signature');
  }

  if (Math.floor(Date.now() / 1000) > expiresAtEpochSeconds) {
    throw new InvalidDownloadSignature('This download link has expired');
  }
}

/** Absolute URL for callers that must hand a device a fully-qualified link. */
export function toAbsoluteUrl(relativeUrl: string, baseUrl?: string): string {
  const base = (baseUrl ?? process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  return base ? `${base}${relativeUrl}` : relativeUrl;
}

/**
 * Turn a stored APK reference into a freshly signed, absolute download URL.
 *
 * Provisioning profiles persist for weeks, so a signed URL must never be baked into a
 * stored profile — it would expire long before the profile is used. Instead the stored
 * value keeps identifying the file, and this is called at dispatch time, each time a
 * payload is actually sent to a device.
 *
 * Accepts any of the shapes the field has historically held: a bare filename,
 * `/apks/<file>`, the old `/public/apks/<file>`, or a fully-qualified legacy URL.
 * Returns null when there is nothing to sign, so callers can pass the value through.
 */
export function signStoredApkReference(
  storedApkUrl: string | null | undefined,
  ttlSeconds?: number
): string | null {
  if (!storedApkUrl || typeof storedApkUrl !== 'string') return null;

  // Strip any scheme/host and query, then take the final path segment.
  const withoutQuery = (storedApkUrl.split('?')[0] ?? '').replace(/\\/g, '/');

  // A stored reference containing a traversal segment signals tampered or corrupted
  // data. Normalising it away with basename() would quietly mint a valid link for some
  // other file, so refuse it instead — there is no legitimate reason for one to appear.
  if (withoutQuery.split('/').includes('..')) return null;

  const filename = path.basename(withoutQuery);

  if (!filename) return null;

  try {
    assertSafeFilename(filename);
  } catch {
    return null;
  }

  const signed = signApkDownload(filename, ttlSeconds);
  return toAbsoluteUrl(signed.url);
}
