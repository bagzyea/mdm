import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Alert,
  CircularProgress,
  Tooltip,
  Menu,
  MenuItem,
  Tabs,
  Tab,
  Divider,
  Fab,
  TablePagination,
  Checkbox,
  FormGroup,
  FormControlLabel,
  Select,
  InputLabel,
  FormControl,
} from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import {
  Smartphone,
  LocationOn,
  Battery90,
  MoreVert,
  Lock,
  LockOpen,
  DeleteForever,
  Refresh,
  Policy,
  Terminal,
  Visibility,
  Block,
  Map as MapIcon,
} from '@mui/icons-material';
import { useAuthContext } from '../../contexts/AuthContext';
import { apiService, provisioningService } from '../../services/api';
import { ProvisioningProfile } from '../../types';
import StatusChip from '../../components/common/StatusChip';
interface Device {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  osVersion: string;
  manufacturer: string;
  isActive: boolean;
  batteryLevel: number;
  isCharging: boolean;
  latitude?: number;
  longitude?: number;
  lastSeen: string;
  enrolledAt: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'LOST';
  complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'UNKNOWN';
  assignedPolicies: string[];
}
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}
function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}
const DevicesPage: React.FC = () => {
  const { hasPermission } = useAuthContext();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogType, setDialogType] = useState<'enroll' | 'details' | 'assign' | 'sendCommand' | null>(null);
  const [commandType, setCommandType] = useState<string>('LOCK_DEVICE');
  const [commandParams, setCommandParams] = useState<any>({});
  const [policies, setPolicies] = useState<any[]>([]);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [tabValue, setTabValue] = useState(0);
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Zero-Touch Provisioning State
  const [profiles, setProfiles] = useState<ProvisioningProfile[]>([]);
  const [enrollmentProfileId, setEnrollmentProfileId] = useState<string>('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [apkUrl, setApkUrl] = useState(window.location.origin + '/api/v1/mdm-agent.apk');
  const fetchDevices = async (pageNum?: number, limit?: number) => {
    try {
      setLoading(true);
      const currentPage = pageNum ?? page;
      const currentLimit = limit ?? rowsPerPage;
      const devicesData = await apiService.getDevices({ page: currentPage + 1, limit: currentLimit });
      // Check if we have valid response structure
      if (!devicesData || typeof devicesData !== 'object') {
        throw new Error('Invalid API response structure');
      }

      // Handle different possible response structures
      let devicesList: any[] = [];
      if (Array.isArray(devicesData)) {
        // Direct array response
        devicesList = devicesData;
      } else if (devicesData.data && Array.isArray(devicesData.data)) {
        // Paginated response with data array
        devicesList = devicesData.data;
      } else if (devicesData.devices && Array.isArray(devicesData.devices)) {
        // Response with devices array (legacy)
        devicesList = devicesData.devices;
      } else {
        console.warn('Unexpected response structure:', devicesData);
        devicesList = [];
      }

      // Map the API response to the local Device interface
      const mappedDevices: Device[] = devicesList.map((device: any) => ({
        id: device.id || 'unknown',
        deviceId: device.deviceId || device.id || 'unknown',
        deviceName: device.deviceId || device.name || 'Unknown Device',
        deviceModel: device.model || 'Unknown Model',
        osVersion: device.androidVersion || device.osVersion || 'Unknown',
        manufacturer: device.manufacturer || 'Unknown',
        isActive: device.status === 'ENROLLED' || device.status === 'ACTIVE',
        batteryLevel: device.batteryLevel || 0,
        isCharging: device.isCharging || false,
        latitude: device.location?.latitude,
        longitude: device.location?.longitude,
        lastSeen: device.lastSeen || new Date().toISOString(),
        enrolledAt: device.enrolledAt || device.createdAt || new Date().toISOString(),
        status: (device.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'LOST') || 'INACTIVE',
        complianceStatus: 'COMPLIANT' as const,
        assignedPolicies: device.policies?.map((p: any) => p.id) || []
      }));
      setDevices(mappedDevices);
      setTotalCount(devicesData?.pagination?.total ?? mappedDevices.length);
      setError(null);
    } catch (err: any) {
      console.error('❌ Error fetching devices:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchDevices(page, rowsPerPage);
  }, [page, rowsPerPage]);

  // Real-time device updates
  useEffect(() => {
    const handleDeviceUpdate = (data: any) => {
      console.log('📱 Received real-time device update:', data);
      
      // Update devices state with real-time data
      setDevices(prevDevices => 
        prevDevices.map(device => {
          if (device.deviceId === data.deviceId) {
            return {
              ...device,
              batteryLevel: data.batteryLevel || device.batteryLevel,
              isCharging: data.isCharging !== undefined ? data.isCharging : device.isCharging,
              latitude: data.location?.latitude || device.latitude,
              longitude: data.location?.longitude || device.longitude,
              lastSeen: data.lastSeen || new Date().toISOString(),
              status: data.status || device.status,
              isActive: data.status === 'ACTIVE'
            };
          }
          return device;
        })
      );
    };

    // Import websocket service dynamically to avoid circular imports
    import('../../services/websocket').then(({ websocketService }) => {
      websocketService.subscribeToHeartbeatUpdates(handleDeviceUpdate);
      websocketService.subscribeToDeviceUpdates(handleDeviceUpdate);
      return () => {
        websocketService.off('deviceHeartbeat', handleDeviceUpdate);
        websocketService.off('deviceStatusChanged', handleDeviceUpdate);
        websocketService.off('deviceEnrolled', handleDeviceUpdate);
      };
    });
  }, []);
  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, device: Device) => {
    setAnchorEl(event.currentTarget);
    setSelectedDevice(device);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedDevice(null);
  };
  const handleDeviceAction = async (action: string, device: Device) => {
    try {
      console.log(`🔄 Executing ${action} command for device:`, device.deviceId);
      switch (action) {
        case 'lock':
          await apiService.sendCommand(device.id, 'LOCK_DEVICE', { 
            message: 'Device locked by administrator',
            timeout: 300 
          });
          break;
        case 'unlock':
          await apiService.sendCommand(device.id, 'UNLOCK_DEVICE', {});
          break;
        case 'wipe':
          if (window.confirm('Are you sure you want to wipe this device? This action cannot be undone.')) {
            await apiService.sendCommand(device.id, 'WIPE_DEVICE', {});
          } else {
            return; // User cancelled
          }
          break;
        case 'suspend':
          await apiService.updateDeviceStatus(device.deviceId, 'SUSPENDED');
          break;
        case 'activate':
          await apiService.updateDeviceStatus(device.deviceId, 'ACTIVE');
          break;
        case 'delete':
          if (window.confirm('Are you sure you want to delete this device from the MDM? This action cannot be undone.')) {
            await apiService.deleteDevice(device.deviceId);
          } else {
            return; // User cancelled
          }
          break;
      }
      await fetchDevices();
      handleMenuClose();
      setError(null);
    } catch (err: any) {
      console.error(`Error executing ${action}:`, err);
      setError(err.response?.data?.message || err.message || `Failed to ${action} device`);
    }
  };
  const generateEnrollmentCode = async () => {
    try {
      const response = await apiService.post('/devices/enrollment-code');
      console.log('Enrollment code response:', response); // Debug log
      setEnrollmentCode(response.code);
    } catch (err: any) {
      console.error('Enrollment code error:', err); // Debug log
      setError(err.response?.data?.message || 'Failed to generate enrollment code');
    }
  };
  const handleOpenDialog = async (type: 'enroll' | 'details' | 'assign' | 'sendCommand', device?: Device) => {
    setDialogType(type);
    setSelectedDevice(device || null);
    setOpenDialog(true);
    if (type === 'enroll') {
      try {
        const response = await provisioningService.getProfiles();
        setProfiles(response);
      } catch (err) {
        console.error('Failed to fetch profiles:', err);
      }
    } else if (type === 'assign') {
      // Fetch available policies
      try {
        const response = await apiService.getPolicies({ limit: 100 });
        setPolicies(response.data || []);
        setSelectedPolicies([]);
      } catch (err) {
        console.error('Failed to fetch policies:', err);
        setError('Failed to fetch policies');
      }
    }
  };
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setDialogType(null);
    setSelectedDevice(null);
    setEnrollmentCode('');
  };
  const formatLastSeen = (lastSeen: string) => {
    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffMs = now.getTime() - lastSeenDate.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 5) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };
  const generateProvisioningJson = () => {
    if (!enrollmentProfileId) return '';
    const payload = {
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.mdm.app/com.mdm.app.admin.MDMDeviceAdminReceiver",
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "",
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": apkUrl,
      "android.app.extra.PROVISIONING_WIFI_SSID": wifiSsid,
      "android.app.extra.PROVISIONING_WIFI_PASSWORD": wifiPassword,
      "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
      "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
      "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
        "provisioning_profile_id": enrollmentProfileId,
        // Enrollment now requires a single-use, expiring code (finding F-02). The agent
        // reads it from this bundle and presents it to POST /api/devices/enroll.
        "enrollment_code": enrollmentCode
      }
    };
    return JSON.stringify(payload);
  };
  const canManageDevices = hasPermission('devices', 'create') || hasPermission('devices', 'update');
  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <Box sx={{ mb: 5, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3 }}>
        <Box>
          <Typography 
            variant="h4" 
            component="h1"
            sx={{ 
              fontWeight: 800,
              mb: 1,
              background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              letterSpacing: '-0.02em'
            }}
          >
            Device Fleet
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
            Monitor and manage your enrolled endpoints in real-time
          </Typography>
        </Box>
        {canManageDevices && (
          <Box sx={{ display: 'flex', gap: 2 }}>
             <Button
              variant="outlined"
              color="inherit"
              startIcon={<Refresh fontSize="small" />}
              onClick={() => fetchDevices()}
              sx={{ 
                borderRadius: 2, 
                textTransform: 'none', 
                fontWeight: 600,
                borderColor: 'divider',
                '&:hover': { backgroundColor: 'action.hover' }
              }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<Smartphone />}
              onClick={() => handleOpenDialog('enroll')}
              sx={{ 
                borderRadius: 2, 
                textTransform: 'none', 
                fontWeight: 600,
                boxShadow: '0 4px 14px 0 rgba(37, 99, 235, 0.25)',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)',
                }
              }}
            >
              Enroll Device
            </Button>
          </Box>
        )}
      </Box>

      {/* Top Metrics Cards */}
      <Grid container spacing={3} sx={{ mb: 5 }}>
        {[
          { label: 'Total Devices', value: totalCount, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
          { label: 'Active Right Now', value: devices.filter(d => d.isActive).length, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
          { label: 'Suspended/Inactive', value: devices.filter(d => !d.isActive && d.status !== 'LOST').length, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
          { label: 'Lost or Wiped', value: devices.filter(d => d.status === 'LOST').length, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' }
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card sx={{ 
              borderRadius: 2, 
              boxShadow: 'none',
              border: '1px solid',
              borderColor: 'divider',
              background: '#ffffff',
              transition: 'all 0.2s ease',
              '&:hover': { 
                borderColor: stat.color,
                boxShadow: `0 4px 12px ${stat.bg}` 
              }
            }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: stat.color, mr: 1, boxShadow: `0 0 6px ${stat.color}` }} />
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: '0.05em' }}>
                    {stat.label}
                  </Typography>
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {stat.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ borderRadius: 2, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ px: 3, pt: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={tabValue} 
            onChange={(_, newValue) => setTabValue(newValue)}
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                minWidth: 'auto',
                px: 3,
                py: 1.5,
              }
            }}
          >
            <Tab label="All Devices" />
            <Tab label="Active" />
            <Tab label="Issues" />
            <Tab label="Groups" />
          </Tabs>
        </Box>
        <Box sx={{ p: 0 }}>

          <TabPanel value={tabValue} index={0}>
            {loading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
                <CircularProgress size={32} thickness={4} />
                <Typography variant="body2" color="text.secondary">Loading endpoint details...</Typography>
              </Box>
            ) : (
              <TableContainer sx={{ overflowX: 'auto', borderRadius: 0, '&::-webkit-scrollbar': { height: 8 }, '&::-webkit-scrollbar-thumb': { backgroundColor: '#cbd5e1', borderRadius: 4 } }}>
                <Table sx={{ minWidth: 800 }}>
                  <TableHead sx={{ backgroundColor: '#fafafa', borderBottom: '2px solid', borderColor: 'divider' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Endpoint Name</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Health</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Location</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Last Sync</TableCell>
                      {canManageDevices && <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Actions</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {devices.map((device) => (
                      <TableRow key={device.id} hover>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ color: device.isActive ? '#10b981' : '#94a3b8' }}>
                              <Smartphone sx={{ fontSize: 20 }} />
                            </Box>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                {device.deviceName || device.deviceModel}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
                                {device.manufacturer || 'Unknown'} • Android {device.osVersion || 'N/A'}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <StatusChip status={device.status} />
                        </TableCell>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Battery90 sx={{ fontSize: 16, color: device.batteryLevel < 20 ? '#ef4444' : device.batteryLevel < 50 ? '#f59e0b' : '#10b981' }} />
                            <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                              {device.batteryLevel}% {device.isCharging ? '⚡' : ''}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          {device.latitude && device.longitude ? (
                            <Tooltip title={`${device.latitude}, ${device.longitude}`}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                                <LocationOn sx={{ fontSize: 16 }} />
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                  Logged
                                </Typography>
                              </Box>
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" color="text.secondary">--</Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                            {formatLastSeen(device.lastSeen)}
                          </Typography>
                        </TableCell>
                        {canManageDevices && (
                          <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }} align="right">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <Tooltip title="Device Details">
                                <IconButton size="small" onClick={() => handleOpenDialog('details', device)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'primary.50' } }}>
                                  <Visibility fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Send Command">
                                <IconButton size="small" onClick={() => handleOpenDialog('sendCommand', device)} sx={{ color: 'text.secondary', '&:hover': { color: 'secondary.main', bgcolor: 'secondary.50' } }}>
                                  <Terminal fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="More Actions">
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleMenuClick(e, device)}
                                >
                                  <MoreVert fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {devices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canManageDevices ? 8 : 7} align="center">
                          <Box sx={{ 
                            py: 8, 
                            px: 4,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 2
                          }}>
                            <Box sx={{
                              p: 4,
                              borderRadius: '50%',
                              backgroundColor: 'grey.50',
                              mb: 2
                            }}>
                              <Smartphone sx={{ fontSize: 64, color: 'grey.400' }} />
                            </Box>
                            <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                              No devices enrolled yet
                            </Typography>
                            <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 400, mb: 3 }}>
                              Start managing your mobile devices with UBOS MDM by enrolling your first device. 
                              Generate an enrollment code to get started.
                            </Typography>
                            {canManageDevices && (
                              <Button
                                variant="contained"
                                size="large"
                                startIcon={<Smartphone />}
                                onClick={() => handleOpenDialog('enroll')}
                                sx={{
                                  px: 4,
                                  py: 1.5,
                                  borderRadius: 3,
                                  background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                                  '&:hover': {
                                    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                                  }
                                }}
                              >
                                Enroll Your First Device
                              </Button>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <TablePagination
                  component="div"
                  count={totalCount}
                  page={page}
                  onPageChange={(_, newPage) => setPage(newPage)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                  rowsPerPageOptions={[5, 10, 25, 50]}
                />
              </TableContainer>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Typography variant="body1">Active devices view - filtered by active status</Typography>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Typography variant="body1">Devices with compliance issues or alerts</Typography>
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Typography variant="body1">Device groups and bulk management</Typography>
          </TabPanel>
        </Box>
      </Card>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        disableAutoFocus
      >
        <MenuItem onClick={() => selectedDevice && handleDeviceAction('lock', selectedDevice)}>
          <Lock sx={{ mr: 1 }} /> Lock Device
        </MenuItem>
        <MenuItem onClick={() => selectedDevice && handleDeviceAction('unlock', selectedDevice)}>
          <LockOpen sx={{ mr: 1 }} /> Unlock Device
        </MenuItem>
        <MenuItem onClick={() => {
          handleMenuClose();
          handleOpenDialog('assign', selectedDevice || undefined);
        }}>
          <Policy sx={{ mr: 1 }} /> Assign Policies
        </MenuItem>
        <MenuItem onClick={() => {
          handleMenuClose();
          handleOpenDialog('sendCommand', selectedDevice || undefined);
        }}>
          <Terminal sx={{ mr: 1 }} /> Send Command
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => selectedDevice && handleDeviceAction('suspend', selectedDevice)}>
          <Block sx={{ mr: 1 }} /> Suspend Device
        </MenuItem>
        <MenuItem onClick={() => selectedDevice && handleDeviceAction('activate', selectedDevice)}>
          <LockOpen sx={{ mr: 1 }} /> Activate Device
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => selectedDevice && handleDeviceAction('wipe', selectedDevice)}
          sx={{ color: 'warning.main' }}
        >
          <DeleteForever sx={{ mr: 1 }} /> Wipe Device
        </MenuItem>
        <MenuItem
          onClick={() => selectedDevice && handleDeviceAction('delete', selectedDevice)}
          sx={{ color: 'error.main' }}
        >
          <DeleteForever sx={{ mr: 1 }} /> Delete from MDM
        </MenuItem>
      </Menu>

      {/* Enrollment Dialog (Zero-Touch QR) */}
      <Dialog open={openDialog && dialogType === 'enroll'} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Zero-Touch Device Enrollment</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body1" paragraph color="text.secondary">
              To enroll a new device, factory reset the Android device, tap the "Hello" or "Welcome" screen 6 times rapidly, and scan the generated QR code below.
            </Typography>
            
            <Grid container spacing={4}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Enrollment Configuration</Typography>
                
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Provisioning Profile</InputLabel>
                  <Select
                    value={enrollmentProfileId}
                    onChange={(e) => setEnrollmentProfileId(e.target.value)}
                    label="Provisioning Profile"
                  >
                    {profiles.map((p) => (
                      <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  label="Local Wi-Fi SSID"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  placeholder="Company Network"
                  sx={{ mb: 2 }}
                />
                
                <TextField
                  fullWidth
                  label="Local Wi-Fi Password"
                  type="password"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  placeholder="Network Password"
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  label="Agent Download URL"
                  value={apkUrl}
                  onChange={(e) => setApkUrl(e.target.value)}
                  sx={{ mb: 2 }}
                  helperText="The public URL where the Android MDM Agent APK is hosted"
                />

                {/*
                  Enrollment codes are mandatory since finding F-02: the endpoint no
                  longer accepts an invented deviceId. This control was written but never
                  rendered, so there was no way for an administrator to obtain one.
                */}
                <Box sx={{ mt: 1 }}>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={generateEnrollmentCode}
                    disabled={!canManageDevices}
                  >
                    {enrollmentCode ? 'Generate a new enrollment code' : 'Generate enrollment code'}
                  </Button>

                  {enrollmentCode && (
                    <Alert severity="success" sx={{ mt: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Enrollment code
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{ fontFamily: 'monospace', letterSpacing: 1 }}
                      >
                        {enrollmentCode}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Single use, and shown only once. It is embedded in the QR payload.
                      </Typography>
                    </Alert>
                  )}
                </Box>
              </Grid>
              
              <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Paper elevation={3} sx={{ p: 4, display: 'inline-block', bgcolor: 'white', borderRadius: 4 }}>
                  {enrollmentProfileId && wifiSsid && apkUrl && enrollmentCode ? (
                    <QRCodeSVG 
                      value={generateProvisioningJson()} 
                      size={240}
                      level="M"
                      includeMargin={true}
                    />
                  ) : (
                    <Box sx={{ width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: 2 }}>
                      <Typography color="text.secondary" align="center" variant="body2" sx={{ px: 2 }}>
                        Generate an enrollment code, select a profile and provide Wi-Fi
                        credentials to build the QR payload
                      </Typography>
                    </Box>
                  )}
                </Paper>
                {enrollmentProfileId && (
                  <Chip 
                    label="Ready to Scan" 
                    color="success" 
                    variant="outlined" 
                    sx={{ mt: 3, fontWeight: 'bold' }} 
                  />
                )}
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleCloseDialog} variant="text" color="inherit">Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Device Details Dialog */}
      <Dialog open={openDialog && dialogType === 'details'} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Device Details</DialogTitle>
        <DialogContent>
          {selectedDevice && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Device Name"
                  value={selectedDevice.deviceName}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Model"
                  value={selectedDevice.deviceModel}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="OS Version"
                  value={selectedDevice.osVersion}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Battery Level"
                  value={`${selectedDevice.batteryLevel}%`}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Enrolled At"
                  value={new Date(selectedDevice.enrolledAt).toLocaleString()}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Send Command Dialog */}
      <Dialog open={openDialog && dialogType === 'sendCommand'} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Send Command to Device</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              select
              fullWidth
              label="Command Type"
              value={commandType}
              onChange={(e) => setCommandType(e.target.value)}
            >
              <MenuItem value="LOCK_DEVICE">Lock Device</MenuItem>
              <MenuItem value="UNLOCK_DEVICE">Unlock Device</MenuItem>
              <MenuItem value="GET_DEVICE_INFO">Get Device Info</MenuItem>
              <MenuItem value="LOCATE_DEVICE">Locate Device</MenuItem>
              <MenuItem value="SYNC_SETTINGS">Sync Settings</MenuItem>
            </TextField>
            {commandType === 'LOCK_DEVICE' && (
              <TextField
                fullWidth
                label="Lock Message"
                value={commandParams.message || ''}
                onChange={(e) => setCommandParams({ ...commandParams, message: e.target.value })}
                placeholder="Device locked by administrator"
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={async () => {
              if (selectedDevice) {
                try {
                  await apiService.sendCommand(selectedDevice.id, commandType as any, commandParams);
                  setError(null);
                  handleCloseDialog();
                  await fetchDevices();
                } catch (err: any) {
                  setError(err.response?.data?.message || 'Failed to send command');
                }
              }
            }}
            variant="contained"
          >
            Send Command
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign Policies Dialog */}
      <Dialog open={openDialog && dialogType === 'assign'} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Assign Policies to Device</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {selectedDevice && (
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Assign policies to: <strong>{selectedDevice.deviceName}</strong>
              </Typography>
            )}
            {policies.length > 0 ? (
              <FormGroup>
                {policies.map((policy) => (
                  <FormControlLabel
                    key={policy.id}
                    control={
                      <Checkbox
                        checked={selectedPolicies.includes(policy.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPolicies([...selectedPolicies, policy.id]);
                          } else {
                            setSelectedPolicies(selectedPolicies.filter(id => id !== policy.id));
                          }
                        }}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">{policy.name}</Typography>
                        <Typography variant="caption" color="textSecondary">
                          {policy.description || 'No description'}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </FormGroup>
            ) : (
              <Typography color="textSecondary">No policies available</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={async () => {
              if (selectedDevice && selectedPolicies.length > 0) {
                try {
                  // Apply each selected policy to the device
                  for (const policyId of selectedPolicies) {
                    await apiService.applyPolicyToDevices(policyId, [selectedDevice.id]);
                  }
                  setError(null);
                  handleCloseDialog();
                  await fetchDevices();
                } catch (err: any) {
                  setError(err.response?.data?.message || 'Failed to assign policies');
                }
              }
            }}
            variant="contained"
            disabled={selectedPolicies.length === 0}
          >
            Assign Policies ({selectedPolicies.length})
          </Button>
        </DialogActions>
      </Dialog>

      {/* Map View Floating Action Button */}
      <Fab
        color="primary"
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
        }}
        onClick={() => navigate('/dashboard/devices/map')}
      >
        <Tooltip title="View devices on map">
          <MapIcon />
        </Tooltip>
      </Fab>
    </Box>
  );
};
export default DevicesPage;