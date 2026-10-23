import { describe, it, expect } from 'vitest';
import { parseGoogleAccountIds } from '../resetProtection';

describe('parseGoogleAccountIds', () => {
  it('accepts IDs separated by new lines, commas or spaces, once each', () => {
    expect(parseGoogleAccountIds('112233445566\n998877665544, 112233445566')).toEqual({
      ids: ['112233445566', '998877665544'],
      problems: [],
    });
  });

  it('flags an email address, which would leave a reset tablet nobody can unlock', () => {
    const parsed = parseGoogleAccountIds('it@ubos.org');
    expect(parsed.ids).toEqual([]);
    expect(parsed.problems[0]).toContain('email address');
  });

  it('flags anything that is not an account ID', () => {
    expect(parseGoogleAccountIds('12ab').problems[0]).toContain('not a Google account ID');
  });

  it('treats an empty field as no accounts', () => {
    expect(parseGoogleAccountIds('  ')).toEqual({ ids: [], problems: [] });
  });
});
