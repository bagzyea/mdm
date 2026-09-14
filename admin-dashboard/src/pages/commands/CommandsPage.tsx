import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
} from '@mui/material';
import {
  Send,
  Lock,
  LockOpen,
  DeleteForever,
  LocationOn,
  RingVolume,
  PhoneAndroid,
  Apps,
  Wifi,
  RestartAlt,
  Security,
  Screenshot,
  Refresh,
  CheckCircle,
  Error as ErrorIcon,
  Schedule,
  PlayArrow,
  History as HistoryIcon,
  Tablet,
  TabletAndroid,
} from '@mui/icons-material';
import { useAuthContext } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import StatusChip from '../../components/common/StatusChip';

interface Command {
  id: string;
  commandType: string;
  deviceIds: string[];
  parameters: any;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  executedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
  createdBy: string;
  createdAt: string;
}

interface Device {
  id: string;
  deviceName: string;
  deviceModel: string;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'LOST';
}

interface CommandFormData {
  commandType: string;
  deviceIds: string[];
  parameters: any;
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

const CommandsPage: React.FC = () => {
  const { hasPermission } = useAuthContext();
  const [commands, setCommands] = useState<Command[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [formData, setFormData] = useState<CommandFormData>({
    commandType: '',
    deviceIds: [],
    parameters: {},
  });

  const commandTypes = [
    { value: 'LOCK_DEVICE', label: 'Lock Device', icon: <Lock />, category: 'Security' },
    { value: 'UNLOCK_DEVICE', label: 'Unlock Device', icon: <LockOpen />, category: 'Security' },
    { value: 'WIPE_DEVICE', label: 'Wipe Device', icon: <DeleteForever />, category: 'Security' },
    { value: 'LOCATE_DEVICE', label: 'Locate Device', icon: <LocationOn />, category: 'Location' },
    { value: 'RING_DEVICE', label: 'Ring Device', icon: <RingVolume />, category: 'Location' },
    { value: 'REBOOT_DEVICE', label: 'Reboot Device', icon: <RestartAlt />, category: 'Control' },
    { value: 'SCREENSHOT', label: 'Take Screenshot', icon: <Screenshot />, category: 'Monitoring' },
    { value: 'GET_DEVICE_INFO', label: 'Get Device Info', icon: <PhoneAndroid />, category: 'Monitoring' },
    { value: 'INSTALL_APP', label: 'Install Application', icon: <Apps />, category: 'Apps' },
    { value: 'UNINSTALL_APP', label: 'Uninstall Application', icon: <Apps />, category: 'Apps' },
    { value: 'SET_WIFI_CONFIG', label: 'Set WiFi Config', icon: <Wifi />, category: 'Network' },
    { value: 'ENABLE_LOST_MODE', label: 'Enable Lost Mode', icon: <Security />, category: 'Security' },
    { value: 'DISABLE_LOST_MODE', label: 'Disable Lost Mode', icon: <Security />, category: 'Security' },
    { value: 'SET_KIOSK_MODE', label: 'Enable Kiosk Mode', icon: <Tablet />, category: 'Control' },
    { value: 'EXIT_KIOSK_MODE', label: 'Disable Kiosk Mode', icon: <TabletAndroid />, category: 'Control' },
  ];

  const fetchCommands = async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching commands...');
      
      const commandsData = await apiService.getCommands({ limit: 100 });
      console.log('📨 Commands fetched:', { 
        count: commandsData.data?.length || 0, 
        total: commandsData.pagination?.total || 0,
        hasPagination: !!commandsData.pagination
      });
      
      // Map the API response to the local Command interface
      const mappedCommands: Command[] = (commandsData.data || []).map(command => ({
        id: command.id,
        commandType: command.command,
        deviceIds: [command.deviceId],
        parameters: command.parameters,
        status: command.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED',
        ...(command.executedAt !== undefined ? { executedAt: command.executedAt } : {}),
        ...(command.completedAt !== undefined ? { completedAt: command.completedAt } : {}),
        ...(command.result !== undefined ? { result: command.result } : {}),
        ...(command.error !== undefined ? { error: command.error } : {}),
        createdBy: 'Admin', // Would need to be populated from API
        createdAt: command.createdAt
      }));
      
      setCommands(mappedCommands);
      setError(null);
      console.log('✅ Commands loaded successfully:', mappedCommands.length);
    } catch (err: any) {
      console.error('❌ Error fetching commands:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch commands');
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      console.log('🔄 Fetching devices for commands...');
      const devicesData = await apiService.getDevices({ limit: 100 });
      
      // Map to simplified Device interface for commands
      const mappedDevices: Device[] = (devicesData.data || []).map(device => ({
        id: device.id,
        deviceName: device.deviceId,
        deviceModel: device.model,
        isActive: device.status === 'ENROLLED' || device.status === 'ACTIVE',
        status: device.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'LOST'
      }));
      
      setDevices(mappedDevices);
      console.log('✅ Devices loaded for commands:', mappedDevices.length);
    } catch (err: any) {
      console.error('❌ Failed to fetch devices:', err);
    }
  };

  useEffect(() => {
    fetchCommands();
    fetchDevices();
  }, []);

  const handleSendCommand = async () => {
    try {
      await apiService.post('/commands', formData);
      await fetchCommands();
      handleCloseDialog();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send command');
    }
  };

  const handleQuickCommand = async (commandType: string, deviceId?: string) => {
    const deviceIds = deviceId ? [deviceId] : [];
    
    if (deviceIds.length === 0 && !deviceId) {
      setError('Please select at least one device');
      return;
    }

    try {
      const commandData: CommandFormData = {
        commandType,
        deviceIds,
        parameters: getDefaultParameters(commandType),
      };

      await apiService.post('/commands', commandData);
      await fetchCommands();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send command');
    }
  };

  const getDefaultParameters = (commandType: string) => {
    switch (commandType) {
      case 'LOCK_DEVICE':
        return { message: 'Device locked by administrator' };
      case 'WIPE_DEVICE':
        return { factoryReset: true };
      case 'RING_DEVICE':
        return { duration: 30, volume: 100 };
      case 'ENABLE_LOST_MODE':
        return { message: 'This device has been lost. Please contact your administrator.' };
      case 'INSTALL_APP':
        return { packageName: '', downloadUrl: '' };
      case 'UNINSTALL_APP':
        return { packageName: '' };
      case 'SET_WIFI_CONFIG':
        return { ssid: '', password: '', security: 'WPA2' };
      default:
        return {};
    }
  };

  const handleOpenDialog = () => {
    setFormData({
      commandType: '',
      deviceIds: [],
      parameters: {},
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleCommandTypeChange = (commandType: string) => {
    setFormData({
      ...formData,
      commandType,
      parameters: getDefaultParameters(commandType),
    });
  };

  const handleParameterChange = (key: string, value: any) => {
    setFormData({
      ...formData,
      parameters: {
        ...formData.parameters,
        [key]: value,
      },
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Schedule color="info" />;
      case 'IN_PROGRESS':
        return <PlayArrow color="warning" />;
      case 'COMPLETED':
        return <CheckCircle color="success" />;
      case 'FAILED':
        return <ErrorIcon color="error" />;
      default:
        return <Schedule />;
    }
  };


  const formatDuration = (start: string, end?: string) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 60) return `${diffSecs}s`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h`;
  };

  const renderParametersForm = () => {
    if (!formData.commandType) return null;

    switch (formData.commandType) {
      case 'LOCK_DEVICE':
      case 'ENABLE_LOST_MODE':
        return (
          <TextField
            fullWidth
            label="Message"
            value={formData.parameters.message || ''}
            onChange={(e) => handleParameterChange('message', e.target.value)}
            multiline
            rows={2}
            sx={{ mt: 2 }}
          />
        );
      
      case 'RING_DEVICE':
        return (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Duration (seconds)"
                type="number"
                value={formData.parameters.duration || 30}
                onChange={(e) => handleParameterChange('duration', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Volume (%)"
                type="number"
                value={formData.parameters.volume || 100}
                onChange={(e) => handleParameterChange('volume', parseInt(e.target.value))}
                inputProps={{ min: 0, max: 100 }}
              />
            </Grid>
          </Grid>
        );

      case 'INSTALL_APP':
        return (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Package Name"
                value={formData.parameters.packageName || ''}
                onChange={(e) => handleParameterChange('packageName', e.target.value)}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Download URL"
                value={formData.parameters.downloadUrl || ''}
                onChange={(e) => handleParameterChange('downloadUrl', e.target.value)}
              />
            </Grid>
          </Grid>
        );

      case 'UNINSTALL_APP':
        return (
          <TextField
            fullWidth
            label="Package Name"
            value={formData.parameters.packageName || ''}
            onChange={(e) => handleParameterChange('packageName', e.target.value)}
            sx={{ mt: 2 }}
          />
        );

      case 'SET_WIFI_CONFIG':
        return (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Network SSID"
                value={formData.parameters.ssid || ''}
                onChange={(e) => handleParameterChange('ssid', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Security</InputLabel>
                <Select
                  value={formData.parameters.security || 'WPA2'}
                  label="Security"
                  onChange={(e) => handleParameterChange('security', e.target.value)}
                >
                  <MenuItem value="WPA2">WPA2</MenuItem>
                  <MenuItem value="WPA3">WPA3</MenuItem>
                  <MenuItem value="WEP">WEP</MenuItem>
                  <MenuItem value="OPEN">Open</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={formData.parameters.password || ''}
                onChange={(e) => handleParameterChange('password', e.target.value)}
              />
            </Grid>
          </Grid>
        );

      default:
        return null;
    }
  };

  const canExecuteCommands = hasPermission('commands', 'execute');

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Command Center
        </Typography>
        {canExecuteCommands && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={fetchCommands}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<Send />}
              onClick={handleOpenDialog}
            >
              Send Command
            </Button>
          </Box>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Quick Actions */}
      {canExecuteCommands && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Grid container spacing={2}>
              {commandTypes.slice(0, 6).map((cmd) => (
                <Grid item xs={12} sm={6} md={2} key={cmd.value}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={cmd.icon}
                    onClick={() => handleQuickCommand(cmd.value)}
                    sx={{ height: 64, flexDirection: 'column', gap: 0.5 }}
                  >
                    <Typography variant="caption" textAlign="center">
                      {cmd.label}
                    </Typography>
                  </Button>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
              <Tab label="Command History" />
              <Tab label="Active Commands" />
              <Tab label="Failed Commands" />
              <Tab label="Statistics" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Command</TableCell>
                      <TableCell>Targets</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Duration</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {commands.map((command) => (
                      <TableRow key={command.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {commandTypes.find(c => c.value === command.commandType)?.icon}
                            <Box>
                              <Typography variant="subtitle2">
                                {commandTypes.find(c => c.value === command.commandType)?.label || command.commandType}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                by {command.createdBy}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {command.deviceIds.length} device{command.deviceIds.length !== 1 ? 's' : ''}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {getStatusIcon(command.status)}
                            <StatusChip status={command.status} />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDuration(command.createdAt, command.completedAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {new Date(command.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="View Details">
                            <IconButton size="small">
                              <HistoryIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                    {commands.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          <Box sx={{ py: 4 }}>
                            <Send sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                            <Typography variant="h6" color="text.secondary">
                              No commands executed yet
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                              Start by sending your first command to managed devices
                            </Typography>
                            {canExecuteCommands && (
                              <Button
                                variant="contained"
                                startIcon={<Send />}
                                onClick={handleOpenDialog}
                              >
                                Send Command
                              </Button>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Typography variant="body1">Active commands with real-time status updates</Typography>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Typography variant="body1">Failed commands requiring attention</Typography>
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Typography variant="body1">Command execution statistics and analytics</Typography>
          </TabPanel>
        </CardContent>
      </Card>

      {/* Send Command Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Send Remote Command</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Command Type</InputLabel>
                <Select
                  value={formData.commandType}
                  label="Command Type"
                  onChange={(e) => handleCommandTypeChange(e.target.value)}
                >
                  {commandTypes.map((cmd) => (
                    <MenuItem key={cmd.value} value={cmd.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {cmd.icon}
                        {cmd.label}
                        <Chip label={cmd.category} size="small" sx={{ ml: 'auto' }} />
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Target Devices</InputLabel>
                <Select
                  multiple
                  value={formData.deviceIds}
                  label="Target Devices"
                  onChange={(e) => setFormData({ ...formData, deviceIds: e.target.value as string[] })}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((deviceId) => {
                        const device = devices.find(d => d.id === deviceId);
                        return (
                          <Chip
                            key={deviceId}
                            label={device?.deviceName || deviceId}
                            size="small"
                          />
                        );
                      })}
                    </Box>
                  )}
                >
                  {devices
                    .filter(device => device.isActive && device.status === 'ACTIVE')
                    .map((device) => (
                      <MenuItem key={device.id} value={device.id}>
                        <Box>
                          <Typography variant="subtitle2">{device.deviceName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {device.deviceModel}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              {renderParametersForm()}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSendCommand}
            variant="contained"
            disabled={!formData.commandType || formData.deviceIds.length === 0}
          >
            Send Command
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CommandsPage;