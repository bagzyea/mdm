import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { statusPalette, trackColor, StatusTone } from '../../theme/statusPalette';

export interface Segment {
  label: string;
  value: number;
  tone: StatusTone;
}

const SEGMENT_GAP = 2; // px of surface between fills, so adjacent colours never touch

/**
 * Horizontal stacked bar for part-to-whole over a small set of states.
 *
 * Replaces the donut this dashboard used to draw. A donut makes the reader compare
 * angles to answer "how much of the fleet is reachable"; a single bar answers it by
 * length, reads at any width, and leaves room for direct labels — which are also the
 * accessibility requirement, since state must never be carried by colour alone.
 */
export const StackedStatusBar: React.FC<{
  segments: Segment[];
  total: number;
  emptyMessage?: string;
}> = ({ segments, total, emptyMessage = 'No devices enrolled yet' }) => {
  const present = segments.filter((s) => s.value > 0);

  if (total <= 0 || present.length === 0) {
    return (
      <Box
        sx={{
          height: 14,
          borderRadius: 1,
          backgroundColor: trackColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
          {emptyMessage}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box
        role="img"
        aria-label={present
          .map((s) => `${s.label}: ${s.value} of ${total} devices`)
          .join('. ')}
        sx={{
          display: 'flex',
          gap: `${SEGMENT_GAP}px`,
          height: 14,
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: trackColor,
        }}
      >
        {present.map((s) => (
          <Tooltip
            key={s.label}
            title={`${s.label}: ${s.value.toLocaleString()} (${((s.value / total) * 100).toFixed(1)}%)`}
            arrow
          >
            <Box
              sx={{
                flexGrow: s.value,
                flexBasis: 0,
                minWidth: 3,
                backgroundColor: statusPalette[s.tone],
                cursor: 'default',
              }}
            />
          </Tooltip>
        ))}
      </Box>

      {/* Legend doubles as the direct labels — identity is never colour-alone. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, mt: 1.5 }}>
        {present.map((s) => (
          <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width: 9,
                height: 9,
                borderRadius: '2px',
                backgroundColor: statusPalette[s.tone],
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" color="text.secondary">
              {s.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
            >
              {s.value.toLocaleString()}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/**
 * One alarm: a count, its share of the fleet, and a meter.
 *
 * Ranked by severity by the caller. Each meter is its own track, which is why tones
 * that must not sit adjacent on a shared scale are safe to use here.
 */
export const AttentionMeter: React.FC<{
  icon: React.ReactElement;
  label: string;
  value: number;
  total: number;
  tone: StatusTone;
  hint: string;
}> = ({ icon, label, value, total, tone, hint }) => {
  const share = total > 0 ? (value / total) * 100 : 0;
  const colour = value > 0 ? statusPalette[tone] : statusPalette.neutral;

  return (
    <Box sx={{ py: 1.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.75 }}>
        <Box
          sx={{
            color: colour,
            display: 'flex',
            alignSelf: 'center',
            '& svg': { fontSize: 18 },
          }}
        >
          {icon}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography
          variant="body1"
          sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colour }}
        >
          {value.toLocaleString()}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'right' }}
        >
          {share.toFixed(0)}%
        </Typography>
      </Box>

      <Tooltip title={hint} arrow placement="top">
        <Box
          sx={{
            height: 6,
            borderRadius: 1,
            backgroundColor: trackColor,
            overflow: 'hidden',
            cursor: 'default',
          }}
        >
          <Box
            sx={{
              width: `${Math.min(share, 100)}%`,
              height: '100%',
              backgroundColor: colour,
              borderRadius: 1,
              transition: 'width 0.3s ease',
            }}
          />
        </Box>
      </Tooltip>
    </Box>
  );
};
