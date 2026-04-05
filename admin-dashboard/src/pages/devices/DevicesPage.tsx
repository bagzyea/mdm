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
} from '@mui/material';
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
import { apiService } from '../../services/api';

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
      generateEnrollmentCode();
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'INACTIVE':
        return 'default';
      case 'SUSPENDED':
        return 'warning';
      case 'LOST':
        return 'error';
      default:
        return 'default';
    }
  };

  const getComplianceColor = (compliance: string) => {
    switch (compliance) {
      case 'COMPLIANT':
        return 'success';
      case 'NON_COMPLIANT':
        return 'error';
      case 'UNKNOWN':
        return 'default';
      default:
        return 'default';
    }
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

  const canManageDevices = hasPermission('devices', 'create') || hasPermission('devices', 'update');

  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <Box sx={{ mb: 4 }}>
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
          UBOS Device Management
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Monitor and manage all enrolled devices in your UBOS MDM system
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box /> {/* Empty box for spacing */}
          {canManageDevices && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={fetchDevices}
              >
                Refresh
              </Button>
              <Button
                variant="contained"
                startIcon={<Smartphone />}
                onClick={() => handleOpenDialog('enroll')}
              >
                Enroll Device
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
              <Tab label="All Devices" />
              <Tab label="Active" />
              <Tab label="Issues" />
              <Tab label="Groups" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            {loading ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center', 
                py: 8,
                gap: 3
              }}>
                <CircularProgress size={48} thickness={4} />
                <Typography variant="body2" color="text.secondary">
                  Loading devices...
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Device</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Battery</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Compliance</TableCell>
                      <TableCell>Last Seen</TableCell>
                      <TableCell>Policies</TableCell>
                      {canManageDevices && <TableCell>Actions</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {devices.map((device) => (
                      <TableRow key={device.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{
                              p: 1.5,
                              borderRadius: 2,
                              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)',
                              border: '1px solid rgba(37, 99, 235, 0.2)',
                            }}>
                              <Smartphone sx={{ fontSize: 24, color: 'primary.main' }} />
                            </Box>
                            <Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                {device.deviceName || device.deviceModel}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                  {device.manufacturer}
                                </Typography>
                                <Box sx={{ 
                                  width: 4, 
                                  height: 4, 
                                  borderRadius: '50%', 
                                  backgroundColor: 'grey.400' 
                                }} />
                                <Typography variant="caption" color="text.secondary">
                                  {device.osVersion}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={device.status}
                            color={getStatusColor(device.status) as any}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 2,
                              backgroundColor: device.batteryLevel < 20 ? 'rgba(220, 38, 38, 0.1)' : 
                                             device.batteryLevel < 50 ? 'rgba(217, 119, 6, 0.1)' : 
                                             'rgba(5, 150, 105, 0.1)',
                              border: `1px solid ${device.batteryLevel < 20 ? 'rgba(220, 38, 38, 0.2)' : 
                                                  device.batteryLevel < 50 ? 'rgba(217, 119, 6, 0.2)' : 
                                                  'rgba(5, 150, 105, 0.2)'}`
                            }}>
                              <Battery90 sx={{
                                fontSize: 20,
                                color: device.batteryLevel < 20 ? 'error.main' : 
                                       device.batteryLevel < 50 ? 'warning.main' : 
                                       'success.main'
                              }} />
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {device.batteryLevel}%
                              </Typography>
                              {device.isCharging && (
                                <Typography variant="caption" sx={{ color: 'primary.main' }}>
                                  ⚡
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {device.latitude && device.longitude ? (
                            <Tooltip title={`${device.latitude}, ${device.longitude}`}>
                              <IconButton size="small">
                                <LocationOn />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Unknown
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={device.complianceStatus.replace('_', ' ')}
                            color={getComplianceColor(device.complianceStatus) as any}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatLastSeen(device.lastSeen)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {device.assignedPolicies.length} policies
                          </Typography>
                        </TableCell>
                        {canManageDevices && (
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Tooltip title="View Details">
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpenDialog('details', device)}
                                >
                                  <Visibility />
                                </IconButton>
                              </Tooltip>
                              <IconButton
                                size="small"
                                onClick={(e) => handleMenuClick(e, device)}
                              >
                                <MoreVert />
                              </IconButton>
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
        </CardContent>
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

      {/* Enrollment Dialog */}
      <Dialog open={openDialog && dialogType === 'enroll'} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Device Enrollment</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            To enroll a new device, use the enrollment code below in the UBOS MDM Android app:
          </Typography>
          <TextField
            fullWidth
            label="Enrollment Code"
            value={enrollmentCode}
            variant="outlined"
            InputProps={{ readOnly: true }}
            sx={{ mt: 2, mb: 2 }}
          />
          <Alert severity="info">
            This code expires in 1 hour. Install the UBOS MDM app on the target device and enter this code during setup.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
          <Button onClick={generateEnrollmentCode} variant="contained">
            Generate New Code
          </Button>
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