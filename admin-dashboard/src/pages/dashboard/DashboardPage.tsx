import React, { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Devices,
  Security,
  Send,
  People,
  TrendingUp,
  CheckCircle,
  Warning,
  Error,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useQuery } from 'react-query';
import { apiService } from '@/services/api';
import { websocketService } from '@/services/websocket';
import { DashboardStats } from '@/types';
import LoadingSpinner from '@/components/common/LoadingSpinner';

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

const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, color, trend }) => {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: `${color}.light`,
              color: `${color}.main`,
              mr: 2,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
            <Typography variant="h4" component="div" fontWeight="bold">
              {value}
            </Typography>
          </Box>
        </Box>
        
        {trend && (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <TrendingUp 
              sx={{ 
                fontSize: 16, 
                color: trend.isPositive ? 'success.main' : 'error.main',
                mr: 0.5 
              }} 
            />
            <Typography 
              variant="caption" 
              color={trend.isPositive ? 'success.main' : 'error.main'}
            >
              {trend.isPositive ? '+' : ''}{trend.value}%
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              vs last month
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

const DashboardPage: React.FC = () => {
  const [realTimeStats, setRealTimeStats] = useState<Partial<DashboardStats>>({});

  // Fetch dashboard stats
  const { 
    data: stats, 
    isLoading, 
    error,
    refetch 
  } = useQuery<DashboardStats>('dashboardStats', apiService.getDashboardStats, {
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Sample data for charts
  const deviceStatusData = [
    { name: 'Active', value: stats?.activeDevices || 0, color: '#4caf50' },
    { name: 'Inactive', value: stats?.inactiveDevices || 0, color: '#ff9800' },
    { name: 'Suspended', value: stats?.suspendedDevices || 0, color: '#f44336' },
  ];

  const commandActivityData = [
    { name: 'Mon', executed: 45, failed: 2, pending: 8 },
    { name: 'Tue', executed: 52, failed: 1, pending: 12 },
    { name: 'Wed', executed: 38, failed: 3, pending: 5 },
    { name: 'Thu', executed: 61, failed: 0, pending: 15 },
    { name: 'Fri', executed: 48, failed: 2, pending: 9 },
    { name: 'Sat', executed: 23, failed: 1, pending: 3 },
    { name: 'Sun', executed: 31, failed: 0, pending: 6 },
  ];

  // Set up real-time updates
  useEffect(() => {
    const handleDashboardUpdate = (data: any) => {
      setRealTimeStats(prevStats => ({ ...prevStats, ...data }));
      refetch(); // Refetch complete stats
    };

    websocketService.subscribeToDashboardUpdates(handleDashboardUpdate);

    return () => {
      websocketService.off('dashboardUpdate', handleDashboardUpdate);
    };
  }, [refetch]);

  if (isLoading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load dashboard data. Please try again later.
      </Alert>
    );
  }

  const mergedStats = { ...stats, ...realTimeStats };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Dashboard Overview
      </Typography>
      
      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Devices"
            value={mergedStats.totalDevices || 0}
            icon={<Devices />}
            color="primary"
            trend={{ value: 12, isPositive: true }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Active Policies"
            value={mergedStats.activePolicies || 0}
            icon={<Security />}
            color="secondary"
            trend={{ value: 8, isPositive: true }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Commands Executed"
            value={mergedStats.executedCommands || 0}
            icon={<Send />}
            color="success"
            trend={{ value: 5, isPositive: false }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Users"
            value={mergedStats.totalUsers || 0}
            icon={<People />}
            color="info"
            trend={{ value: 15, isPositive: true }}
          />
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Device Status Distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Device Status Distribution
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie
                  data={deviceStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {deviceStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Command Activity Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Weekly Command Activity
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
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CheckCircle sx={{ color: 'success.main', mr: 1 }} />
                <Typography variant="h6">System Health</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                All systems operational
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">API Response Time</Typography>
                  <Typography variant="body2" color="success.main">98ms</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Database Status</Typography>
                  <Typography variant="body2" color="success.main">Healthy</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">WebSocket Connections</Typography>
                  <Typography variant="body2" color="success.main">
                    {mergedStats.activeDevices || 0} active
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Warning sx={{ color: 'warning.main', mr: 1 }} />
                <Typography variant="h6">Alerts & Warnings</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {mergedStats.suspendedDevices || 0} devices require attention
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  • 2 devices haven't checked in for 24+ hours
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  • 1 policy compliance violation detected
                </Typography>
                <Typography variant="body2">
                  • 3 failed command executions in the last hour
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TrendingUp sx={{ color: 'info.main', mr: 1 }} />
                <Typography variant="h6">Recent Activity</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Latest system events
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  • New device enrolled: Samsung Galaxy S21
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  • Security policy updated: Corporate Policy v2.1
                </Typography>
                <Typography variant="body2">
                  • Bulk command sent to 15 devices
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;