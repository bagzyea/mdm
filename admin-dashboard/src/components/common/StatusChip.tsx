import React from 'react';
import { Chip, ChipProps } from '@mui/material';

interface StatusChipProps extends Omit<ChipProps, 'color'> {
  status: string;
  color?: 'success' | 'warning' | 'error' | 'info' | 'default';
  variant?: 'filled' | 'outlined';
  pulse?: boolean;
}

const StatusChip: React.FC<StatusChipProps> = ({
  status,
  color,
  variant = 'filled',
  pulse = false,
  sx,
  ...props
}) => {
  const getStatusColor = () => {
    const colorToUse = color || 'default';
    switch (colorToUse) {
      case 'success':
        return {
          background: variant === 'filled' 
            ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' 
            : 'transparent',
          borderColor: '#10b981',
          color: variant === 'filled' ? '#ffffff' : '#059669',
        };
      case 'warning':
        return {
          background: variant === 'filled' 
            ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)' 
            : 'transparent',
          borderColor: '#f59e0b',
          color: variant === 'filled' ? '#ffffff' : '#d97706',
        };
      case 'error':
        return {
          background: variant === 'filled' 
            ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' 
            : 'transparent',
          borderColor: '#ef4444',
          color: variant === 'filled' ? '#ffffff' : '#dc2626',
        };
      case 'info':
        return {
          background: variant === 'filled' 
            ? 'linear-gradient(135deg, #0891b2 0%, #22d3ee 100%)' 
            : 'transparent',
          borderColor: '#22d3ee',
          color: variant === 'filled' ? '#ffffff' : '#0891b2',
        };
      default:
        return {
          background: variant === 'filled' 
            ? 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)' 
            : 'transparent',
          borderColor: '#94a3b8',
          color: variant === 'filled' ? '#ffffff' : '#64748b',
        };
    }
  };

  const colors = getStatusColor();

  return (
    <Chip
      {...props}
      label={status}
      sx={{
        ...colors,
        border: variant === 'outlined' ? `1px solid ${colors.borderColor}` : 'none',
        fontWeight: 500,
        fontSize: '0.75rem',
        height: 28,
        borderRadius: 2,
        position: 'relative',
        overflow: 'visible',
        ...(pulse && {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: -2,
            left: -2,
            right: -2,
            bottom: -2,
            borderRadius: 'inherit',
            background: colors.background,
            opacity: 0.3,
            animation: 'pulse 2s infinite',
          },
          '@keyframes pulse': {
            '0%': {
              transform: 'scale(1)',
              opacity: 0.3,
            },
            '50%': {
              transform: 'scale(1.1)',
              opacity: 0.1,
            },
            '100%': {
              transform: 'scale(1)',
              opacity: 0.3,
            },
          },
        }),
        ...sx,
      }}
    />
  );
};

export default StatusChip;