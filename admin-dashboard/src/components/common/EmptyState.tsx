import React from 'react';
import { Box, Typography, Button } from '@mui/material';

interface EmptyStateProps {
  icon: React.ReactElement;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'contained' | 'outlined' | 'text';
    color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
  };
  maxWidth?: number;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  maxWidth = 400,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: 8,
        px: 4,
        maxWidth,
        mx: 'auto',
      }}
    >
      <Box
        sx={{
          p: 4,
          borderRadius: '50%',
          backgroundColor: 'grey.50',
          mb: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        }}
      >
        {React.cloneElement(icon, {
          sx: { fontSize: 64, color: 'grey.400', ...icon.props.sx },
        })}
      </Box>

      <Typography
        variant="h5"
        sx={{
          fontWeight: 600,
          mb: 2,
          color: 'text.primary',
        }}
      >
        {title}
      </Typography>

      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          mb: action ? 3 : 0,
          lineHeight: 1.6,
        }}
      >
        {description}
      </Typography>

      {action && (
        <Button
          variant={action.variant || 'contained'}
          color={action.color || 'primary'}
          size="large"
          onClick={action.onClick}
          sx={{
            px: 4,
            py: 1.5,
            borderRadius: 3,
            fontWeight: 500,
            ...(action.variant === 'contained' && {
              background: `linear-gradient(135deg, ${
                action.color === 'secondary' ? '#7c3aed' : '#2563eb'
              } 0%, ${
                action.color === 'secondary' ? '#8b5cf6' : '#3b82f6'
              } 100%)`,
              '&:hover': {
                background: `linear-gradient(135deg, ${
                  action.color === 'secondary' ? '#6d28d9' : '#1d4ed8'
                } 0%, ${
                  action.color === 'secondary' ? '#7c3aed' : '#2563eb'
                } 100%)`,
              },
            }),
          }}
        >
          {action.label}
        </Button>
      )}
    </Box>
  );
};

export default EmptyState;