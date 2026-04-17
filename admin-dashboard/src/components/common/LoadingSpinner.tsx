import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography, Fade, Grow, keyframes } from '@mui/material';
import { Security, AdminPanelSettings, Devices } from '@mui/icons-material';

interface LoadingSpinnerProps {
  message?: string;
  size?: number;
  fullScreen?: boolean;
}

const pulseAnimation = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.7;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
`;

const floatAnimation = keyframes`
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
  100% {
    transform: translateY(0px);
  }
`;

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Loading...', 
  size = 60,
  fullScreen = false
}) => {
  const [dots, setDots] = useState('');
  const [iconIndex, setIconIndex] = useState(0);
  const icons = [Security, AdminPanelSettings, Devices];
  const CurrentIcon = icons[iconIndex] || Security;

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    const iconInterval = setInterval(() => {
      setIconIndex(prev => (prev + 1) % icons.length);
    }, 2000);

    return () => {
      clearInterval(dotsInterval);
      clearInterval(iconInterval);
    };
  }, [icons.length]);

  const containerStyle = fullScreen ? {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(255, 255, 255, 0.95) 100%)',
    backdropFilter: 'blur(10px)',
    zIndex: 9999,
  } : {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    gap: 3,
    p: 4,
  };

  return (
    <Fade in={true} timeout={300}>
      <Box sx={containerStyle}>
        <Box sx={{ 
          position: 'relative', 
          display: 'inline-flex', 
          mb: 3,
          animation: `${floatAnimation} 3s ease-in-out infinite`,
        }}>
          {/* Outer decorative circle */}
          <Box sx={{
            position: 'absolute',
            top: -10,
            left: -10,
            width: size + 20,
            height: size + 20,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
            animation: `${pulseAnimation} 2s ease-in-out infinite`,
          }} />
          
          {/* Main progress circle */}
          <CircularProgress 
            size={size} 
            thickness={3}
            sx={{
              color: 'primary.main',
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
                filter: 'drop-shadow(0 2px 8px rgba(37, 99, 235, 0.3))',
              },
            }}
          />
          
          {/* Center icon with transition */}
          <Box
            sx={{
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Grow in={true} key={iconIndex} timeout={500}>
              <Box>
                <CurrentIcon sx={{ 
                  fontSize: size * 0.4, 
                  color: 'primary.main', 
                  filter: 'drop-shadow(0 2px 4px rgba(37, 99, 235, 0.2))',
                }} />
              </Box>
            </Grow>
          </Box>
        </Box>

        {/* Loading text with animated dots */}
        <Box sx={{ textAlign: 'center', maxWidth: 300 }}>
          <Typography 
            variant="h6" 
            sx={{ 
              fontWeight: 600,
              mb: 1,
              background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {message}{dots}
          </Typography>
          
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ 
              opacity: 0.8,
              letterSpacing: '0.5px',
            }}
          >
            Please wait while we prepare your UBOS MDM dashboard
          </Typography>
        </Box>

        {/* Progress indicators */}
        <Box sx={{ 
          display: 'flex', 
          gap: 1, 
          mt: 2,
          justifyContent: 'center',
        }}>
          {[0, 1, 2].map((index) => (
            <Box
              key={index}
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: index === iconIndex ? 'primary.main' : 'grey.300',
                transition: 'all 0.3s ease',
                transform: index === iconIndex ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </Box>
      </Box>
    </Fade>
  );
};

export default LoadingSpinner;