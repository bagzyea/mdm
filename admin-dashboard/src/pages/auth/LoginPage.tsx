import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Fade,
  Chip,
  Link,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  AdminPanelSettings,
  Security,
  Person,
  Lock,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { LoginCredentials } from '../../types';

interface FormErrors {
  username?: string;
  password?: string;
  general?: string;
}

const LoginPage: React.FC = () => {
  const location = useLocation();
  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showDefaultCreds, setShowDefaultCreds] = useState(true);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [sessionMessage, setSessionMessage] = useState<{message: string; type: 'info' | 'warning'} | null>(null);
  
  const { login } = useAuth();

  // Check for session expiry message from navigation state
  useEffect(() => {
    const state = location.state as any;
    if (state?.message) {
      setSessionMessage({
        message: state.message,
        type: state.type || 'info'
      });
      
      // Clear the message from navigation state after showing it
      window.history.replaceState({}, document.title);
      
      // Auto-hide the message after 8 seconds
      const timer = setTimeout(() => {
        setSessionMessage(null);
      }, 8000);
      
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const validateField = (field: keyof LoginCredentials, value: string): string | undefined => {
    switch (field) {
      case 'username':
        if (!value.trim()) return 'Username is required';
        if (value.length < 3) return 'Username must be at least 3 characters';
        break;
      case 'password':
        if (!value.trim()) return 'Password is required';
        if (value.length < 6) return 'Password must be at least 6 characters';
        break;
    }
    return undefined;
  };

  const handleInputChange = (field: keyof LoginCredentials) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setCredentials(prev => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear field-specific error when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    
    // Clear general error when user makes changes
    if (errors.general) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.general;
        return newErrors;
      });
    }
  };

  const handleBlur = (field: keyof LoginCredentials) => {
    const value = credentials[field];
    const error = validateField(field, value);
    if (error) {
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    const usernameError = validateField('username', credentials.username);
    if (usernameError) newErrors.username = usernameError;
    
    const passwordError = validateField('password', credentials.password);
    if (passwordError) newErrors.password = passwordError;
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);
      setErrors({});
      await login(credentials);
      // Success - navigation will be handled by the auth context
    } catch (err: any) {
      setLoginAttempts(prev => prev + 1);
      
      let errorMessage = 'Login failed. Please try again.';
      
      if (err?.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err?.response?.status === 401) {
        errorMessage = 'Invalid username or password.';
      } else if (err?.response?.status === 429) {
        errorMessage = 'Too many login attempts. Please try again later.';
      } else if (err?.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const useDefaultCredentials = () => {
    setCredentials({
      username: 'admin',
      password: 'admin123'
    });
    setShowDefaultCreds(false);
  };

  // Auto-hide default credentials after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDefaultCreds(false);
    }, 15000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #2563eb 100%)',
        backgroundSize: '400% 400%',
        animation: 'gradientShift 8s ease infinite',
        p: 2,
        '@keyframes gradientShift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 50%, rgba(37, 99, 235, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(124, 58, 237, 0.1) 0%, transparent 50%), radial-gradient(circle at 40% 80%, rgba(37, 99, 235, 0.1) 0%, transparent 50%)',
          pointerEvents: 'none',
        },
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          background: 'rgba(255, 255, 255, 0.95)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            transform: 'translateY(-4px)',
          },
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 3 }}>
              <img 
                src="/ubos_logo.png" 
                alt="UBOS Logo" 
                style={{ 
                  width: 80, 
                  height: 80, 
                  borderRadius: '50%',
                  boxShadow: '0 8px 32px rgba(37, 99, 235, 0.15)',
                  background: 'rgba(255, 255, 255, 0.9)',
                  padding: '4px'
                }} 
              />
            </Box>
            <Typography variant="h3" component="h1" gutterBottom fontWeight="700" sx={{
              background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              mb: 1
            }}>
              UBOS Mobile Device Management
            </Typography>
            <Typography variant="h6" gutterBottom fontWeight="500" sx={{ color: 'primary.main', mb: 1 }}>
              Admin Portal
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Secure access to Mobile Device Management System
            </Typography>
            {loginAttempts > 3 && (
              <Chip 
                icon={<Security />} 
                label="Enhanced Security Active" 
                color="warning" 
                size="small" 
                variant="outlined"
              />
            )}
          </Box>

          {/* Session Expiry Message */}
          {sessionMessage && (
            <Fade in={!!sessionMessage}>
              <Alert 
                severity={sessionMessage.type === 'warning' ? 'warning' : 'info'} 
                sx={{ mb: 2 }}
                onClose={() => setSessionMessage(null)}
              >
                {sessionMessage.message}
              </Alert>
            </Fade>
          )}

          {/* Error Alert */}
          {errors.general && (
            <Fade in={!!errors.general}>
              <Alert 
                severity={loginAttempts > 3 ? "warning" : "error"} 
                sx={{ mb: 2 }}
                onClose={() => setErrors(prev => ({ ...prev, general: undefined }))}
              >
                {errors.general}
                {loginAttempts > 3 && (
                  <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                    Account may be temporarily locked after multiple failed attempts.
                  </Typography>
                )}
              </Alert>
            </Fade>
          )}

          {/* Login Form */}
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              variant="outlined"
              value={credentials.username}
              onChange={handleInputChange('username')}
              onBlur={() => handleBlur('username')}
              disabled={isLoading}
              error={!!errors.username}
              helperText={errors.username}
              sx={{ mb: 2 }}
              autoComplete="username"
              autoFocus
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Person color={errors.username ? 'error' : 'action'} />
                  </InputAdornment>
                ),
              }}
            />
            
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              value={credentials.password}
              onChange={handleInputChange('password')}
              onBlur={() => handleBlur('password')}
              disabled={isLoading}
              error={!!errors.password}
              helperText={errors.password}
              sx={{ mb: 3 }}
              autoComplete="current-password"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock color={errors.password ? 'error' : 'action'} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={togglePasswordVisibility}
                      disabled={isLoading}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={isLoading || !credentials.username.trim() || !credentials.password.trim() || !!errors.username || !!errors.password}
              sx={{ 
                mb: 2, 
                py: 1.5,
                background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                  transform: 'translateY(-1px)',
                },
                '&:active': {
                  transform: 'translateY(0px)',
                },
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {isLoading ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1, color: 'white' }} />
                  Authenticating...
                </>
              ) : (
                <>
                  <Security sx={{ mr: 1 }} />
                  Sign In Securely
                </>
              )}
            </Button>
          </Box>

          {/* Default Credentials Info */}
          {showDefaultCreds && (
            <Fade in={showDefaultCreds}>
              <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'grey.300' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight="600">
                    💡 Demo Credentials Available
                  </Typography>
                  <Link 
                    component="button"
                    variant="caption"
                    onClick={useDefaultCredentials}
                    sx={{ textDecoration: 'none' }}
                  >
                    Use Now
                  </Link>
                </Box>
                <Typography variant="caption" display="block" sx={{ opacity: 0.8 }}>
                  Username: <code>admin</code> • Password: <code>admin123</code>
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, fontSize: '0.65rem' }}>
                  This message will disappear automatically
                </Typography>
              </Box>
            </Fade>
          )}
          
          {/* Security Notice */}
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block">
              🔒 Your UBOS MDM session is secured with enterprise-grade encryption
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;