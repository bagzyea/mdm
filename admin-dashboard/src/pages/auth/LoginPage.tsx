import React, { useState } from 'react';
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
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  AdminPanelSettings,
} from '@mui/icons-material';
import { useAuth } from '@/contexts/AuthContext';
import { LoginCredentials } from '@/types';

const LoginPage: React.FC = () => {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();

  const handleInputChange = (field: keyof LoginCredentials) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setCredentials(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
    if (error) setError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!credentials.username || !credentials.password) {
      setError('Please enter both username and password');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await login(credentials);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        p: 2,
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <AdminPanelSettings
              sx={{ fontSize: 48, color: 'primary.main', mb: 2 }}
            />
            <Typography variant="h4" component="h1" gutterBottom>
              MDM Admin
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to access the Mobile Device Management system
            </Typography>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              variant="outlined"
              value={credentials.username}
              onChange={handleInputChange('username')}
              disabled={isLoading}
              sx={{ mb: 2 }}
              autoComplete="username"
              autoFocus
            />
            
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              value={credentials.password}
              onChange={handleInputChange('password')}
              disabled={isLoading}
              sx={{ mb: 3 }}
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={togglePasswordVisibility}
                      disabled={isLoading}
                      edge="end"
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
              disabled={isLoading || !credentials.username || !credentials.password}
              sx={{ mb: 2, py: 1.5 }}
            >
              {isLoading ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </Box>

          {/* Default Credentials Info */}
          <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Default Admin Credentials:
            </Typography>
            <Typography variant="caption" display="block">
              Username: <strong>admin</strong>
            </Typography>
            <Typography variant="caption" display="block">
              Password: <strong>Admin123!@#</strong>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;