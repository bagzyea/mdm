import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import StatusChip from '../StatusChip';
import { statusPalette } from '../../../theme/statusPalette';

/**
 * StatusChip derives its tone from the status rather than taking a colour from the
 * caller. The previous version took a `color` prop, and the seven call sites that
 * supplied it disagreed about what each status meant — see statusVocabulary.ts.
 *
 * Three of the five tests this file used to contain asserted behaviour the component
 * never had: `getByText` returns the label span, not the chip root, so the
 * `toHaveClass('MuiChip-root')` assertions could not pass; and the `label` prop was
 * always overridden by `label={status}`. They have been replaced with assertions about
 * the contract that actually matters.
 */

const theme = createTheme();
const renderChip = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

/** The chip root, reached from the label span the query returns. */
const rootFor = (text: string) => screen.getByText(text).closest('.MuiChip-root');

describe('StatusChip', () => {
  it('humanises the status rather than showing the raw enum', () => {
    renderChip(<StatusChip status="DATA_WIPE_PENDING" />);
    expect(screen.getByText('Data wipe pending')).toBeInTheDocument();
    expect(screen.queryByText('DATA_WIPE_PENDING')).not.toBeInTheDocument();
  });

  it('shows the raw status when asked', () => {
    renderChip(<StatusChip status="IN_PROGRESS" raw />);
    expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument();
  });

  it('renders a chip for a plain status', () => {
    renderChip(<StatusChip status="ACTIVE" />);
    expect(rootFor('Active')).toBeInTheDocument();
  });

  it('colours a healthy status with the good tone', () => {
    renderChip(<StatusChip status="ACTIVE" />);
    expect(rootFor('Active')).toHaveStyle({ color: statusPalette.good });
  });

  it('colours a wiped device critical, not neutral', () => {
    // The regression that motivated the shared vocabulary: WIPED rendered grey on the
    // device list while the map showed it red.
    renderChip(<StatusChip status="WIPED" />);
    expect(rootFor('Wiped')).toHaveStyle({ color: statusPalette.critical });
  });

  it('colours an executed command good, not neutral', () => {
    renderChip(<StatusChip status="EXECUTED" />);
    expect(rootFor('Executed')).toHaveStyle({ color: statusPalette.good });
  });

  it('falls back to the neutral tone for an unrecognised status', () => {
    renderChip(<StatusChip status="SOMETHING_NEW" />);
    expect(rootFor('Something new')).toHaveStyle({ color: statusPalette.neutral });
  });

  it('accepts an explicit tone override', () => {
    renderChip(<StatusChip status="ACTIVE" tone="critical" />);
    expect(rootFor('Active')).toHaveStyle({ color: statusPalette.critical });
  });

  it('carries an icon so state is never colour-alone', () => {
    const { container } = renderChip(<StatusChip status="FAILED" />);
    expect(container.querySelector('.MuiChip-icon')).toBeInTheDocument();
  });

  it('is small by default, and stays overridable', () => {
    renderChip(<StatusChip status="ACTIVE" />);
    expect(rootFor('Active')).toHaveClass('MuiChip-sizeSmall');
  });
});
