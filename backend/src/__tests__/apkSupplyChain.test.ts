/**
 * APK supply-chain controls (finding F-06).
 *
 * Uploaded APKs were never parsed or signature-verified: the packageName recorded
 * against a file came from the request body with a default of 'com.example.app' and was
 * never checked against the APK's manifest, and the files were then served from an
 * unauthenticated static mount. This is the software supply chain for the entire census
 * fleet.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

import {
  hashFile,
  readApkManifest,
  assertPackageNameMatches,
  ApkInspectionError,
} from '../services/apkInspector';

import {
  signApkDownload,
  verifyApkDownload,
  assertSafeFilename,
  signStoredApkReference,
  InvalidDownloadSignature,
} from '../services/signedDownloads';

let workDir: string;

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apk-test-'));
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function writeFile(name: string, contents: Buffer | string): string {
  const filePath = path.join(workDir, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

describe('hashFile', () => {
  it('matches a known SHA-256 without reading the file into memory', async () => {
    const contents = 'the quick brown fox';
    const filePath = writeFile('hash.bin', contents);

    const expected = crypto.createHash('sha256').update(contents).digest('hex');
    await expect(hashFile(filePath)).resolves.toBe(expected);
  });

  it('hashes a file larger than a single stream chunk correctly', async () => {
    // The previous implementation was a synchronous whole-file read of up to 500 MB.
    // This is small enough to keep the suite fast but spans many 64 KiB chunks.
    const contents = crypto.randomBytes(5 * 1024 * 1024);
    const filePath = writeFile('large.bin', contents);

    const expected = crypto.createHash('sha256').update(contents).digest('hex');
    await expect(hashFile(filePath)).resolves.toBe(expected);
  });

  it('rejects for a file that does not exist', async () => {
    await expect(hashFile(path.join(workDir, 'nope.bin'))).rejects.toThrow();
  });
});

describe('readApkManifest', () => {
  it('rejects a file that is not a ZIP archive', async () => {
    const filePath = writeFile('not-an-apk.apk', 'this is plain text, not an APK');

    await expect(readApkManifest(filePath)).rejects.toBeInstanceOf(ApkInspectionError);
    await expect(readApkManifest(filePath)).rejects.toThrow(/missing ZIP signature/);
  });

  it('rejects an empty file', async () => {
    const filePath = writeFile('empty.apk', Buffer.alloc(0));
    await expect(readApkManifest(filePath)).rejects.toThrow(/missing ZIP signature/);
  });

  it('rejects a ZIP that is not a parseable APK', async () => {
    // Correct ZIP magic, but no readable binary AndroidManifest.xml behind it. This is
    // the shape of an upload crafted to look like an APK.
    const fakeZip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      crypto.randomBytes(512),
    ]);
    const filePath = writeFile('fake.apk', fakeZip);

    await expect(readApkManifest(filePath)).rejects.toBeInstanceOf(ApkInspectionError);
  });
});

describe('assertPackageNameMatches', () => {
  const manifest = { packageName: 'ug.go.ubos.census' };

  it('accepts a declared name that matches the manifest', () => {
    expect(() => assertPackageNameMatches('ug.go.ubos.census', manifest)).not.toThrow();
  });

  it('accepts an omitted declared name and adopts the manifest', () => {
    expect(() => assertPackageNameMatches(undefined, manifest)).not.toThrow();
    expect(() => assertPackageNameMatches('', manifest)).not.toThrow();
  });

  it('rejects the old default that used to be recorded silently', () => {
    // 'com.example.app' was the default for the request body field.
    expect(() => assertPackageNameMatches('com.example.app', manifest)).toThrow(
      ApkInspectionError
    );
  });

  it('rejects a near-miss package name', () => {
    expect(() => assertPackageNameMatches('ug.go.ubos.censuss', manifest)).toThrow(
      /Package name mismatch/
    );
  });

  it('names both sides in the error so the mismatch is diagnosable', () => {
    expect(() => assertPackageNameMatches('com.evil.app', manifest)).toThrow(
      /com\.evil\.app.*ug\.go\.ubos\.census/
    );
  });
});

describe('signed download URLs', () => {
  it('round-trips a freshly signed URL', () => {
    const { url, expiresAt } = signApkDownload('census-1.apk');
    const params = new URLSearchParams(url.split('?')[1]);

    expect(url.startsWith('/downloads/apks/census-1.apk?')).toBe(true);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(() =>
      verifyApkDownload('census-1.apk', params.get('expires'), params.get('sig'))
    ).not.toThrow();
  });

  it('rejects a signature minted for a different file', () => {
    // Without this, one valid link would grant access to the whole APK directory.
    const params = new URLSearchParams(signApkDownload('census-1.apk').url.split('?')[1]);

    expect(() =>
      verifyApkDownload('payroll-secret.apk', params.get('expires'), params.get('sig'))
    ).toThrow(InvalidDownloadSignature);
  });

  it('rejects a tampered expiry', () => {
    const params = new URLSearchParams(signApkDownload('census-1.apk').url.split('?')[1]);
    const extended = String(Number(params.get('expires')) + 86_400);

    expect(() => verifyApkDownload('census-1.apk', extended, params.get('sig'))).toThrow(
      /Invalid signature/
    );
  });

  it('rejects an expired link', () => {
    const { url } = signApkDownload('census-1.apk', -10);
    const params = new URLSearchParams(url.split('?')[1]);

    expect(() =>
      verifyApkDownload('census-1.apk', params.get('expires'), params.get('sig'))
    ).toThrow(/expired/);
  });

  it('rejects a missing or malformed signature', () => {
    const params = new URLSearchParams(signApkDownload('census-1.apk').url.split('?')[1]);

    expect(() => verifyApkDownload('census-1.apk', params.get('expires'), undefined)).toThrow(
      /Missing signature/
    );
    expect(() => verifyApkDownload('census-1.apk', params.get('expires'), 'deadbeef')).toThrow(
      /Invalid signature/
    );
  });

  it('rejects a missing or malformed expiry', () => {
    const params = new URLSearchParams(signApkDownload('census-1.apk').url.split('?')[1]);

    expect(() => verifyApkDownload('census-1.apk', undefined, params.get('sig'))).toThrow(
      /Missing or malformed expiry/
    );
    expect(() => verifyApkDownload('census-1.apk', 'soon', params.get('sig'))).toThrow(
      /Missing or malformed expiry/
    );
  });

  it('refuses path traversal in the file name', () => {
    for (const bad of ['../secret.apk', 'a/b.apk', '/etc/passwd', '..', '.hidden']) {
      expect(() => assertSafeFilename(bad)).toThrow(InvalidDownloadSignature);
      expect(() => signApkDownload(bad)).toThrow(InvalidDownloadSignature);
    }
  });

  it('produces a different signature for each file', () => {
    const a = new URLSearchParams(signApkDownload('a.apk').url.split('?')[1]).get('sig');
    const b = new URLSearchParams(signApkDownload('b.apk').url.split('?')[1]).get('sig');

    expect(a).not.toBe(b);
  });
});

describe('signStoredApkReference (dispatch-time signing)', () => {
  // A signed URL must never be persisted into a provisioning profile — profiles live
  // for weeks and the link would expire long before use. These are the shapes the
  // stored apkUrl field has historically held.
  const shapes = [
    'census-1.apk',
    '/apks/census-1.apk',
    '/public/apks/census-1.apk',
    'http://10.0.0.5:5001/public/apks/census-1.apk',
    'https://mdm.uboscare.com/public/apks/census-1.apk?cachebust=7',
  ];

  it.each(shapes)('signs %s down to the same file', (stored) => {
    const signed = signStoredApkReference(stored);
    expect(signed).not.toBeNull();

    const [routePath, query] = signed!.split('?');
    expect(routePath).toContain('/downloads/apks/census-1.apk');

    const params = new URLSearchParams(query);
    expect(() =>
      verifyApkDownload('census-1.apk', params.get('expires'), params.get('sig'))
    ).not.toThrow();
  });

  it('returns null for empty or missing references so callers can pass through', () => {
    expect(signStoredApkReference(null)).toBeNull();
    expect(signStoredApkReference(undefined)).toBeNull();
    expect(signStoredApkReference('')).toBeNull();
  });

  it('returns null rather than signing a traversal attempt', () => {
    expect(signStoredApkReference('/apks/../../etc/passwd')).toBeNull();
    expect(signStoredApkReference('/apks/.hidden')).toBeNull();
  });

  it('issues a fresh signature on each dispatch', async () => {
    const first = signStoredApkReference('/apks/census-1.apk', 3600);
    await new Promise((r) => setTimeout(r, 1100));
    const second = signStoredApkReference('/apks/census-1.apk', 3600);

    // Different expiry windows mean a device always gets a link valid from *now*.
    expect(first).not.toBe(second);
  });
});
