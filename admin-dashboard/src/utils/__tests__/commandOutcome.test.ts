import { describe, it, expect } from 'vitest';
import { describeSingleCommand, describeBulkCommand } from '../commandOutcome';
import { formatLastSeen, formatBattery } from '../deviceDisplay';

const NOW = new Date('2026-10-15T12:00:00Z');

describe('formatLastSeen', () => {
  it('says Never when there is no time, instead of "Just now"', () => {
    expect(formatLastSeen(null, NOW)).toBe('Never');
    expect(formatLastSeen(undefined, NOW)).toBe('Never');
  });

  it('reports days for a tablet that has been away', () => {
    expect(formatLastSeen('2026-10-12T11:00:00Z', NOW)).toBe('3d ago');
  });
});

describe('formatBattery', () => {
  it('shows an unknown level as unknown, not 0%', () => {
    expect(formatBattery(null)).toBe('—');
    expect(formatBattery(undefined)).toBe('—');
  });

  it('keeps a real 0% reading', () => {
    expect(formatBattery(0)).toBe('0%');
  });
});

describe('describeSingleCommand', () => {
  it('says sent when the tablet was connected', () => {
    const out = describeSingleCommand('Lock', 'Tablet 7', null, { status: 'SENT' });
    expect(out.severity).toBe('success');
    expect(out.message).toContain('sent to Tablet 7');
  });

  it('says queued, with when it was last seen and when it expires', () => {
    const lastSeen = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const out = describeSingleCommand('Lock', 'Tablet 7', lastSeen, {
      status: 'PENDING',
      expiresAt: '2026-10-22T09:00:00Z',
    });
    expect(out.severity).toBe('info');
    expect(out.message).toContain('queued for Tablet 7');
    expect(out.message).toContain('last seen 3d ago');
    expect(out.message).toMatch(/cancelled if not collected by/);
  });
});

describe('describeBulkCommand', () => {
  it('separates sent, queued and skipped tablets', () => {
    const out = describeBulkCommand('Lock', {
      commands: [{ status: 'SENT' }, { status: 'PENDING' }, { status: 'PENDING' }],
      devicesSkipped: ['DEV_1'],
      expiresAt: '2026-10-22T09:00:00Z',
    });
    expect(out.message).toContain('sent to 1 tablet now');
    expect(out.message).toContain('queued for 2 tablets');
    expect(out.message).toContain('1 tablet skipped');
    expect(out.severity).toBe('warning');
  });
});
