/**
 * App Vault categories (found 12 Oct 2026). The upload form offered Business, Security,
 * Utilities, Navigation and Other, none of which exist in the APKCategory enum, and
 * defaulted to Business, so the database refused nearly every upload with a 500 and the
 * file was left on disk.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { APKCategory } from '@prisma/client';

const mockCreate = jest.fn();
jest.mock('../db', () => ({ __esModule: true, default: { aPKRegistry: { create: mockCreate } } }));

import { uploadAPK } from '../controllers/apkRegistryController';

const APP_VAULT_PAGE = path.resolve(
  __dirname,
  '../../../admin-dashboard/src/pages/app-vault/AppVaultPage.tsx'
);

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('APK upload category', () => {
  it('refuses an unknown category with 400, before the database, and removes the file', async () => {
    const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apkcat-')), 'x.apk');
    fs.writeFileSync(filePath, 'not really an apk');
    const req: any = { file: { path: filePath, originalname: 'x.apk', size: 17 }, body: { category: 'BUSINESS' } };
    const res = mockRes();

    await uploadAPK(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_CATEGORY');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

const dashboardAvailable = fs.existsSync(APP_VAULT_PAGE);

(dashboardAvailable ? describe : describe.skip)('App Vault form categories', () => {
  it('offers exactly the categories the database accepts', () => {
    const source = fs.readFileSync(APP_VAULT_PAGE, 'utf8');
    const block = source.slice(source.indexOf('const CATEGORY_OPTIONS'), source.indexOf('];', source.indexOf('const CATEGORY_OPTIONS')));
    const offered = [...block.matchAll(/value:\s*'([A-Z_]+)'/g)].map(m => m[1]).sort();
    expect(offered.length).toBeGreaterThan(0);
    expect(offered).toEqual(Object.values(APKCategory).sort());
  });
});

describe('APK upload of a package already in the vault', () => {
  it('is a 409 that removes the uploaded file, not a 500 that leaves it behind', async () => {
    jest.resetModules();
    const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apkdup-')), 'x.apk');
    fs.writeFileSync(filePath, 'not really an apk');
    jest.doMock('../services/apkInspector', () => ({
      ...jest.requireActual('../services/apkInspector'),
      readApkManifest: jest.fn().mockResolvedValue({ packageName: 'com.mdm.app.debug', versionName: '1.0', versionCode: 1 }),
      assertPackageNameMatches: jest.fn(),
      hashFile: jest.fn().mockResolvedValue('abc'),
    }));
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    const { uploadAPK: upload } = require('../controllers/apkRegistryController');

    const req: any = { file: { path: filePath, originalname: 'x.apk', size: 17, filename: 'x.apk' }, body: { category: 'UTILITY' } };
    const res = mockRes();
    await upload(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('APK_ALREADY_REGISTERED');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
