import React from 'react';
import { Chip, ChipProps } from '@mui/material';
import {
  CheckCircle,
  Cancel,
  Schedule,
  Autorenew,
  RemoveCircleOutline,
} from '@mui/icons-material';
import { statusPalette, StatusTone } from '../../theme/statusPalette';
import { statusTone, statusLabel } from '../../theme/statusVocabulary';

/**
 * A device / command / session status.
 *
 * The tone is derived from the status itself, not passed in. Previously each caller
 * supplied a colour via its own local `getStatusColor`, and the four copies of that
 * function disagreed — see statusVocabulary.ts for what that broke.
 *
 * Every chip carries an icon as well as its colour. Status is never colour-alone: that
 * is the accessibility requirement, and it is also what makes these readable in a dense
 * table where the chips are small.
 */

interface StatusChipProps extends Omit<ChipProps, 'color'> {
  status: string;
  /** Override the derived tone. Prefer adding the status to statusVocabulary instead. */
  tone?: StatusTone;
  variant?: 'filled' | 'outlined';
  /** Render the raw status string rather than a humanised label. */
  raw?: boolean;
}

const TONE_ICON: Record<StatusTone, React.ElementType> = {
  good: CheckCircle,
  info: Autorenew,
  warning: Schedule,
  critical: Cancel,
  neutral: RemoveCircleOutline,
};

const StatusChip: React.FC<StatusChipProps> = ({
  status,
  tone,
  variant = 'outlined',
  raw = false,
  sx,
  ...props
}) => {
  const resolved: StatusTone = tone ?? statusTone(status);
  const colour = statusPalette[resolved];
  const Icon = TONE_ICON[resolved];

  return (
    <Chip
      {...props}
      size={props.size ?? 'small'}
      icon={<Icon aria-hidden style={{ color: 'inherit' }} />}
      label={raw ? status : statusLabel(status)}
      sx={{
        color: colour,
        backgroundColor: variant === 'filled' ? `${colour}1A` : 'transparent',
        border: `1px solid ${colour}`,
        fontWeight: 600,
        fontSize: '0.75rem',
        height: 26,
        borderRadius: 1,
        '& .MuiChip-icon': { fontSize: 15, marginLeft: '6px', color: 'inherit' },
        '& .MuiChip-label': { paddingInline: '8px' },
        ...sx,
      }}
    />
  );
};

export default StatusChip;
