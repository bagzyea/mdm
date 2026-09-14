import { describe, it, expect } from 'vitest';
import { statusTone, statusLabel, isKnownStatus } from '../statusVocabulary';
import { statusPalette } from '../statusPalette';

/**
 * These tests exist because the dashboard shipped with seven independent copies of
 * `getStatusColor`, and they disagreed with each other and with the schema. The failures
 * were silent: an unmapped status fell through to `default` and rendered grey, which
 * looks like a deliberate "inactive" rather than "nobody wrote this case".
 *
 * The enum lists below are transcribed from backend/prisma/schema.prisma. If a status is
 * added there and not here, that is the drift these tests are meant to catch.
 */

const SCHEMA_ENUMS: Record<string, string[]> = {
  DeviceStatus: ['ENROLLED', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'WIPED'],
  CommandStatus: ['PENDING', 'SENT', 'EXECUTED', 'FAILED', 'CANCELLED'],
  ProvisioningSessionStatus: [
    'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED',
  ],
  ProvisioningDeviceStatus: [
    'NOT_PROVISIONED', 'PENDING', 'DOWNLOADING_APPS', 'INSTALLING_APPS',
    'CONFIGURING_NETWORK', 'CONFIGURING_SECURITY', 'DEPLOYING_FILES', 'VALIDATING',
    'COMPLETED', 'FAILED', 'CANCELLED',
  ],
  TransferStatus: [
    'PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED',
  ],
  RetirementStatus: [
    'INITIATED', 'APPROVED', 'DATA_WIPE_PENDING', 'DATA_WIPED',
    'PHYSICAL_RETURN_PENDING', 'PHYSICAL_RETURNED', 'DISPOSED', 'COMPLETED', 'CANCELLED',
  ],
  ComplianceStatus: [
    'UNKNOWN', 'COMPLIANT', 'NON_COMPLIANT', 'PARTIALLY_COMPLIANT', 'PENDING',
  ],
  CertificateStatus: ['ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING', 'FAILED'],
};

describe('status vocabulary', () => {
  describe('every schema status is mapped', () => {
    for (const [enumName, values] of Object.entries(SCHEMA_ENUMS)) {
      it.each(values)(`${enumName}.%s`, (value) => {
        expect(isKnownStatus(value)).toBe(true);
      });
    }
  });

  describe('regressions from the seven divergent copies', () => {
    it('WIPED is critical, not grey', () => {
      // DevicesPage did not handle WIPED and fell through to `default`, so a wiped
      // device looked identical to an inactive one on the device list, while the map
      // showed it red.
      expect(statusTone('WIPED')).toBe('critical');
    });

    it('EXECUTED is good, not grey', () => {
      // CommandsPage mapped IN_PROGRESS and COMPLETED — neither of which is a
      // CommandStatus — and missed SENT, EXECUTED and CANCELLED. The success state of
      // every remote command rendered grey.
      expect(statusTone('EXECUTED')).toBe('good');
    });

    it.each(['SENT', 'CANCELLED'])('%s is mapped', (s) => {
      expect(isKnownStatus(s)).toBe(true);
    });

    it('ENROLLED reads the same as ACTIVE', () => {
      // It was green on the map and grey on the device list.
      expect(statusTone('ENROLLED')).toBe(statusTone('ACTIVE'));
    });

    it('IN_PROGRESS has one tone, not three', () => {
      // CommandsPage said warning, ProvisioningSessionsPage said primary,
      // DeviceTransferPage said info.
      expect(statusTone('IN_PROGRESS')).toBe('info');
    });
  });

  describe('failure states are never mistaken for success', () => {
    it.each(['FAILED', 'REJECTED', 'NON_COMPLIANT', 'REVOKED', 'EXPIRED', 'WIPED'])(
      '%s is critical',
      (s) => expect(statusTone(s)).toBe('critical')
    );

    it.each(['ACTIVE', 'ENROLLED', 'EXECUTED', 'COMPLETED', 'COMPLIANT', 'DISPOSED'])(
      '%s is good',
      (s) => expect(statusTone(s)).toBe('good')
    );
  });

  describe('unknown input', () => {
    it.each([undefined, null, '', 'NOT_A_REAL_STATUS'])('%s is neutral', (s) => {
      // Neutral, not good: a status nobody mapped must read as "we do not know",
      // never as "fine".
      expect(statusTone(s as string)).toBe('neutral');
    });
  });

  describe('tones resolve to real palette entries', () => {
    it.each(['ACTIVE', 'PENDING', 'FAILED', 'SENT', 'INACTIVE'])('%s', (s) => {
      expect(statusPalette[statusTone(s)]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe('labels are readable', () => {
    it.each([
      ['DATA_WIPE_PENDING', 'Data wipe pending'],
      ['IN_PROGRESS', 'In progress'],
      ['ACTIVE', 'Active'],
      ['NOT_PROVISIONED', 'Not provisioned'],
    ])('%s -> %s', (input, expected) => {
      expect(statusLabel(input)).toBe(expected);
    });

    it('falls back to Unknown rather than rendering empty', () => {
      expect(statusLabel(undefined)).toBe('Unknown');
      expect(statusLabel('')).toBe('Unknown');
    });
  });
});
