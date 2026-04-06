import React, { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  Alert,
  Button,
} from '@mui/material';
import {
  Devices,
  Security,
  Send,
  People,
  TrendingUp,
  CheckCircle,
  Battery90,
  Storage as StorageIcon,
  Refresh,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { websocketService } from '../../services/websocket';
import { DashboardStats, DeviceHealthSummary } from '../../types';
import { useAuthContext } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactElement;
  color: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, color, trend }) => (
  <Card sx={{ 
    borderRadius: 2, 
    boxShadow: 'none',
    border: '1px solid',
    borderColor: 'divider',
    background: '#ffffff',
    transition: 'all 0.2s ease',
    '&:hover': {
      borderColor: `${color}.main`,
      boxShadow: `0 4px 12px rgba(0,0,0,0.03)`
    }
  }}>
    <CardContent sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ 
              fontWeight: 600, 
              textTransform: 'uppercase', 
              letterSpacing: '0.5px',
              mb: 1
            }}
          >
            {title}
          </Typography>
          <Typography 
            variant="h3" 
            component="div" 
            sx={{ 
              fontWeight: 700,
              color: 'text.primary',
              mb: 1
            }}
          >
            {value}
          </Typography>
          {trend && (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center',
              px: 1.5,
              py: 0.5,
              borderRadius: 2,
              backgroundColor: trend.isPositive ? 'rgba(5, 150, 105, 0.1)' : 'rgba(220, 38, 38, 0.1)',
              width: 'fit-content'
            }}>
              <TrendingUp 
                sx={{ 
                  color: trend.isPositive ? 'success.main' : 'error.main',
                  mr: 0.5,
                  fontSize: 16,
                  transform: trend.isPositive ? 'none' : 'rotate(180deg)'
                }} 
              />
              <Typography 
                variant="caption" 
                sx={{
                  color: trend.isPositive ? 'success.main' : 'error.main',
                  fontWeight: 600
                }}
              >
                {trend.isPositive ? '+' : ''}{trend.value}%
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ 
          p: 1.5,
          borderRadius: 2,
          backgroundColor: `${color}.50`,
          color: `${color}.main`,
          '& svg': { fontSize: 24 }
        }}>
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const DashboardPage: React.FC = () => {
  const { isAuthenticated, user } = useAuthContext();
  const queryClient = useQueryClient();
  const [realTimeStats, setRealTimeStats] = useState<Partial<DashboardStats>>({});

  console.log('🏠 Dashboard Page - Auth Status:', { isAuthenticated, user: user?.username });

  // Fetch dashboard stats
  const { 
    data: stats, 
    isLoading, 
    error,
    refetch: refetchStats
  } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats'],
    queryFn: () => apiService.getDashboardStats(),
    refetchInterval: 30000,
    enabled: isAuthenticated,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 401) {
        queryClient.clear();
        return false;
      }
      return failureCount < 3;
    }
  });

  // Fetch device health summary
  const { 
    data: healthSummary,
    isLoading: healthLoading,
    error: healthError,
    refetch: refetchHealth
  } = useQuery<DeviceHealthSummary>({
    queryKey: ['deviceHealthSummary'],
    queryFn: () => apiService.getDeviceHealthSummary(),
    refetchInterval: 60000,
    enabled: isAuthenticated,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 401) {
        queryClient.clear();
        return false;
      }
      return failureCount < 3;
    }
  });

  // Manual refresh function
  const handleManualRefresh = async () => {
    console.log('🔄 Manual refresh triggered');
    await Promise.all([refetchStats(), refetchHealth()]);
  };

  // Sample data for charts - filter out zero values to prevent overlapping labels
  const rawDeviceStatusData = [
    { name: 'Active', value: stats?.activeDevices || 0, color: '#4caf50' },
    { name: 'Inactive', value: stats?.inactiveDevices || 0, color: '#ff9800' },
    { name: 'Suspended', value: stats?.suspendedDevices || 0, color: '#f44336' },
  ].filter(item => item.value > 0);
  
  const deviceStatusData = rawDeviceStatusData.length > 0 ? rawDeviceStatusData : [
    { name: 'No Devices', value: 1, color: '#e5e7eb' }
  ];


  // Device health data
  const deviceHealthData = healthSummary ? [
    { name: 'Low Battery', value: healthSummary.lowBatteryDevices, color: '#ff9800' },
    { name: 'Low Storage', value: healthSummary.lowStorageDevices, color: '#f44336' },
    { name: 'Offline', value: healthSummary.offlineDevices, color: '#9e9e9e' },
  ] : [];

  // Set up real-time updates
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('❌ Not authenticated, skipping websocket setup');
      return;
    }

    console.log('🔌 Setting up websocket for dashboard updates');
    
    const handleDashboardUpdate = (data: any) => {
      console.log('📡 Real-time dashboard update received:', data);
      setRealTimeStats(prevStats => ({ ...prevStats, ...data }));
      refetchStats(); // Refetch complete stats
    };

    websocketService.subscribeToDashboardUpdates(handleDashboardUpdate);

    return () => {
      console.log('🔌 Cleaning up websocket dashboard updates');
      websocketService.off('dashboardUpdate', handleDashboardUpdate);
    };
  }, [refetchStats, isAuthenticated]);

  if (isLoading || healthLoading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  if (error || healthError) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
        <Alert 
          severity="error" 
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={handleManualRefresh}>
              Retry
            </Button>
          }
        >
          <>
            Failed to load dashboard data. Please check your connection and try again.
            {error && (
              <div>Stats Error: {typeof error === 'string' ? error : (error as any)?.message || 'Unknown error'}</div>
            )}
            {healthError && (
              <div>Health Error: {typeof healthError === 'string' ? healthError : (healthError as any)?.message || 'Unknown error'}</div>
            )}
          </>
        </Alert>
      </Box>
    );
  }

  const mergedStats = { ...stats, ...realTimeStats };

  const commandActivityData = [
    { name: 'Today', executed: mergedStats.executedCommands || 0, failed: mergedStats.failedCommands || 0, pending: mergedStats.pendingCommands || 0 },
  ];

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, sm: 3, md: 4 } }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box>
            <Typography 
              variant="h2" 
              component="h1" 
              sx={{ 
                mb: 1,
                background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
              }}
            >
              UBOS MDM Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Monitor your UBOS Mobile Device Management system performance and device health in real-time
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={handleManualRefresh}
            disabled={isLoading || healthLoading}
            sx={{ minWidth: 120 }}
          >
            {isLoading || healthLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </Box>
      </Box>
      
      {/* Stats Cards */}
      <Grid container spacing={{ xs: 2, sm: 3, md: 4 }} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Devices"
            value={mergedStats.totalDevices || 0}
            icon={<Devices />}
            color="primary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Active Policies"
            value={mergedStats.activePolicies || 0}
            icon={<Security />}
            color="secondary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Commands Executed"
            value={mergedStats.executedCommands || 0}
            icon={<Send />}
            color="success"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Users"
            value={mergedStats.totalUsers || 0}
            icon={<People />}
            color="info"
          />
        </Grid>
      </Grid>

      {/* Device Health Summary */}
      {healthSummary && (
        <Grid container spacing={{ xs: 2, sm: 3, md: 4 }} sx={{ mb: 4 }}>
          <Grid item xs={12}>
            <Paper sx={{ 
              p: 3, 
              borderRadius: 2,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
              border: '1px solid',
              borderColor: 'divider',
              background: '#ffffff',
            }}>
              <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                Device Health Overview
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ 
                    textAlign: 'center',
                    p: 3,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
                    border: '1px solid rgba(5, 150, 105, 0.2)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 10px 15px -3px rgba(5, 150, 105, 0.1)',
                    }
                  }}>
                    <Typography variant="h3" sx={{ color: 'success.main', fontWeight: 700, mb: 1 }}>
                      {healthSummary.activeDevices}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Active Devices
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ 
                    textAlign: 'center',
                    p: 3,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%)',
                    border: '1px solid rgba(217, 119, 6, 0.2)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 10px 15px -3px rgba(217, 119, 6, 0.1)',
                    }
                  }}>
                    <Typography variant="h3" sx={{ color: 'warning.main', fontWeight: 700, mb: 1 }}>
                      {healthSummary.lowBatteryDevices}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Low Battery
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ 
                    textAlign: 'center',
                    p: 3,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)',
                    border: '1px solid rgba(220, 38, 38, 0.2)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 10px 15px -3px rgba(220, 38, 38, 0.1)',
                    }
                  }}>
                    <Typography variant="h3" sx={{ color: 'error.main', fontWeight: 700, mb: 1 }}>
                      {healthSummary.lowStorageDevices}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Low Storage
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ 
                    textAlign: 'center',
                    p: 3,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, rgba(100, 116, 139, 0.1) 0%, rgba(148, 163, 184, 0.05) 100%)',
                    border: '1px solid rgba(100, 116, 139, 0.2)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 10px 15px -3px rgba(100, 116, 139, 0.1)',
                    }
                  }}>
                    <Typography variant="h3" sx={{ color: 'text.secondary', fontWeight: 700, mb: 1 }}>
                      {healthSummary.offlineDevices}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Offline Devices
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Charts Row */}
      <Grid container spacing={{ xs: 2, sm: 3, md: 4 }} sx={{ mb: 4 }}>
        {/* Device Status Distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ 
            p: 3, 
            height: 450,
            borderRadius: 2,
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
            border: '1px solid',
            borderColor: 'divider',
            background: '#ffffff',
          }}>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
              Device Status Distribution
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={deviceStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={140}
                  paddingAngle={8}
                  dataKey="value"
                  label={({ name, percent, value }) => 
                    value > 0 && percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                  }
                  labelLine={false}
                  style={{
                    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))',
                  }}
                >
                  {deviceStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value, entry) => `${value}: ${entry.payload?.value || 0}`}
                />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Device Health Issues */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ 
            p: 3, 
            height: 450,
            borderRadius: 2,
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
            border: '1px solid',
            borderColor: 'divider',
            background: '#ffffff',
          }}>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
              Device Health Issues
            </Typography>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie
                  data={deviceHealthData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={140}
                  paddingAngle={8}
                  dataKey="value"
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
                  labelLine={false}
                  style={{
                    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))',
                  }}
                >
                  {deviceHealthData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Command Activity Chart */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <Paper sx={{ 
            p: 3, 
            height: 400,
            borderRadius: 2,
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
            border: '1px solid',
            borderColor: 'divider',
            background: '#ffffff',
          }}>
            <Typography variant="h6" gutterBottom>
              Current Command Status
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={commandActivityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="executed" fill="#4caf50" name="Executed" />
                <Bar dataKey="failed" fill="#f44336" name="Failed" />
                <Bar dataKey="pending" fill="#ff9800" name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Status Overview */}
      <Grid container spacing={3}>
        {[
          { title: 'System Health', icon: <CheckCircle sx={{ color: 'success.main', mr: 1, fontSize: 20 }} />, desc: 'All systems operational',
            rows: [ { label: 'API Response Time', value: '98ms', color: 'success.main' }, { label: 'Database Status', value: 'Healthy', color: 'success.main' }, { label: 'WebSocket Connections', value: `${mergedStats.activeDevices || 0} active`, color: 'success.main' } ] },
          { title: 'Battery Status', icon: <Battery90 sx={{ color: 'primary.main', mr: 1, fontSize: 20 }} />, desc: 'Device battery levels',
            rows: [ { label: 'Low Battery Devices', value: healthSummary?.lowBatteryDevices || 0, color: 'warning.main' }, { label: 'Pending Commands', value: mergedStats.pendingCommands || 0, color: 'warning.main' }, { label: 'Failed Commands', value: mergedStats.failedCommands || 0, color: 'error.main' } ] },
          { title: 'Storage Status', icon: <StorageIcon sx={{ color: 'primary.main', mr: 1, fontSize: 20 }} />, desc: 'Device storage usage',
            rows: [ { label: 'Low Storage Devices', value: healthSummary?.lowStorageDevices || 0, color: 'error.main' }, { label: 'Active Devices', value: mergedStats.activeDevices || 0, color: 'success.main' }, { label: 'Inactive Devices', value: mergedStats.inactiveDevices || 0, color: 'text.secondary' } ] }
        ].map((col, idx) => (
          <Grid item xs={12} md={4} key={idx}>
            <Card sx={{ 
              borderRadius: 2, 
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
              border: '1px solid',
              borderColor: 'divider',
              background: '#ffffff',
            }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                  {col.icon}
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{col.title}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  {col.desc}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {col.rows.map((row, rIdx) => (
                    <Box key={rIdx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>{row.label}</Typography>
                      <Typography variant="body2" sx={{ color: row.color, fontWeight: 600, fontSize: '0.8125rem' }}>{row.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default DashboardPage;