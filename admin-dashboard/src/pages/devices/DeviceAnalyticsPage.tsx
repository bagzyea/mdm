import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Paper,
  Tabs,
  Tab,
  Alert,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Battery90,
  Storage as StorageIcon,
  Wifi,
  Memory,
  CheckCircle,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { apiService } from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`analytics-tabpanel-${index}`}
      aria-labelledby={`analytics-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const DeviceAnalyticsPage: React.FC = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [tabValue, setTabValue] = useState(0);
  const [timeRange, setTimeRange] = useState(7);

  const { data: analyticsData, isLoading, error } = useQuery(
    ['deviceAnalytics', deviceId, timeRange],
    () => apiService.getDeviceAnalytics(deviceId!, timeRange),
    {
      enabled: !!deviceId,
      refetchInterval: 30000, // Refetch every 30 seconds
    }
  );

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading device analytics..." />;
  }

  if (error || !analyticsData) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load device analytics. Please try again later.
      </Alert>
    );
  }

  const { current, historical } = analyticsData;

  // Prepare chart data
  const batteryData = historical.map((item: any) => ({
    timestamp: new Date(item.timestamp).toLocaleDateString(),
    level: item.batteryInfo?.level || 0,
    isCharging: item.batteryInfo?.isCharging ? 1 : 0,
  }));

  const storageData = historical.map((item: any) => ({
    timestamp: new Date(item.timestamp).toLocaleDateString(),
    used: item.storageInfo ? ((item.storageInfo.totalStorage - item.storageInfo.availableStorage) / item.storageInfo.totalStorage) * 100 : 0,
    available: item.storageInfo ? (item.storageInfo.availableStorage / item.storageInfo.totalStorage) * 100 : 0,
  }));

  const networkData = historical.map((item: any) => ({
    timestamp: new Date(item.timestamp).toLocaleDateString(),
    wifiSignal: item.networkInfo?.wifiSignalStrength || 0,
    dataUsage: item.networkInfo?.dataUsage ? 
      (item.networkInfo.dataUsage.wifiBytesReceived + item.networkInfo.dataUsage.cellularBytesReceived) / (1024 * 1024) : 0,
  }));

  const appUsageData = current.appUsageStats?.slice(0, 10).map((app: any) => ({
    name: app.appName,
    usageTime: app.usageTime / (1000 * 60 * 60), // Convert to hours
    launchCount: app.launchCount,
  })) || [];

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Device Analytics: {current.deviceId}
        </Typography>
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            label="Time Range"
            onChange={(e) => setTimeRange(e.target.value as number)}
          >
            <MenuItem value={1}>Last 24 hours</MenuItem>
            <MenuItem value={7}>Last 7 days</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Current Status Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Battery Level
                  </Typography>
                  <Typography variant="h4">
                    {current.batteryLevel || 0}%
                  </Typography>
                  {current.isCharging && (
                    <Chip label="Charging" color="success" size="small" sx={{ mt: 1 }} />
                  )}
                </Box>
                <Battery90 sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={current.batteryLevel || 0} 
                sx={{ mt: 2 }}
                color={current.batteryLevel && current.batteryLevel < 20 ? 'error' : 'primary'}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Storage Usage
                  </Typography>
                  <Typography variant="h4">
                    {current.totalStorage && current.availableStorage ? 
                      Math.round(((current.totalStorage - current.availableStorage) / current.totalStorage) * 100) : 0}%
                  </Typography>
                </Box>
                <StorageIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={current.totalStorage && current.availableStorage ? 
                  ((current.totalStorage - current.availableStorage) / current.totalStorage) * 100 : 0} 
                sx={{ mt: 2 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Memory Usage
                  </Typography>
                  <Typography variant="h4">
                    {current.totalRAM && current.availableRAM ? 
                      Math.round(((current.totalRAM - current.availableRAM) / current.totalRAM) * 100) : 0}%
                  </Typography>
                </Box>
                <Memory sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={current.totalRAM && current.availableRAM ? 
                  ((current.totalRAM - current.availableRAM) / current.totalRAM) * 100 : 0} 
                sx={{ mt: 2 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Network Status
                  </Typography>
                  <Typography variant="h4">
                    {current.networkInfo?.wifiEnabled ? 'WiFi' : 'Cellular'}
                  </Typography>
                  {current.networkInfo?.connectedWifi && (
                    <Chip label={current.networkInfo.connectedWifi} size="small" sx={{ mt: 1 }} />
                  )}
                </Box>
                <Wifi sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Analytics Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="analytics tabs">
          <Tab label="Battery" />
          <Tab label="Storage" />
          <Tab label="Network" />
          <Tab label="Apps" />
          <Tab label="System Health" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Typography variant="h6" gutterBottom>Battery Usage Over Time</Typography>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={batteryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="level" stroke="#8884d8" name="Battery Level (%)" />
            </LineChart>
          </ResponsiveContainer>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom>Storage Usage Over Time</Typography>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={storageData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="used" stroke="#82ca9d" name="Used Storage (%)" />
              <Line type="monotone" dataKey="available" stroke="#8884d8" name="Available Storage (%)" />
            </LineChart>
          </ResponsiveContainer>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom>Network Usage Over Time</Typography>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={networkData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="wifiSignal" stroke="#8884d8" name="WiFi Signal Strength" />
              <Line type="monotone" dataKey="dataUsage" stroke="#82ca9d" name="Data Usage (MB)" />
            </LineChart>
          </ResponsiveContainer>
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <Typography variant="h6" gutterBottom>Top App Usage</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>App Name</TableCell>
                  <TableCell align="right">Usage Time (hours)</TableCell>
                  <TableCell align="right">Launch Count</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {appUsageData.map((app, index) => (
                  <TableRow key={index}>
                    <TableCell>{app.name}</TableCell>
                    <TableCell align="right">{app.usageTime.toFixed(1)}</TableCell>
                    <TableCell align="right">{app.launchCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        <TabPanel value={tabValue} index={4}>
          <Typography variant="h6" gutterBottom>System Health</Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>System Information</Typography>
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">CPU Usage</Typography>
                      <Typography variant="body2" color="primary.main">
                        {current.systemHealth?.cpuUsage || 0}%
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Temperature</Typography>
                      <Typography variant="body2" color="primary.main">
                        {current.systemHealth?.temperature || 0}°C
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Uptime</Typography>
                      <Typography variant="body2" color="primary.main">
                        {current.systemHealth?.uptime ? Math.round(current.systemHealth.uptime / 3600) : 0}h
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Security Patch</Typography>
                      <Typography variant="body2" color="primary.main">
                        {current.systemHealth?.securityPatchLevel || 'Unknown'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Encryption</Typography>
                      <Typography variant="body2" color="primary.main">
                        {current.systemHealth?.encryptionStatus || 'Unknown'}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Security Status</Typography>
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      {current.systemHealth?.rootStatus ? (
                        <ErrorIcon color="error" sx={{ mr: 1 }} />
                      ) : (
                        <CheckCircle color="success" sx={{ mr: 1 }} />
                      )}
                      <Typography variant="body2">
                        Root Status: {current.systemHealth?.rootStatus ? 'Compromised' : 'Secure'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <CheckCircle color="success" sx={{ mr: 1 }} />
                      <Typography variant="body2">
                        Encryption: {current.systemHealth?.encryptionStatus || 'Unknown'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <CheckCircle color="success" sx={{ mr: 1 }} />
                      <Typography variant="body2">
                        Security Patch: {current.systemHealth?.securityPatchLevel || 'Unknown'}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default DeviceAnalyticsPage;
