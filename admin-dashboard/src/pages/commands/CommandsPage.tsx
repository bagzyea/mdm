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
  Snackbar,
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
  LocationOn,
  PhoneAndroid,
  Refresh,
  CheckCircle,
  Error as ErrorIcon,
  Schedule,
  PlayArrow,
  Block,
  History as HistoryIcon,
  Tablet,
  TabletAndroid,
} from '@mui/icons-material';
import { useAuthContext } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import StatusChip from '../../components/common/StatusChip';
import type { CommandType, CommandStatus, DeviceStatus } from '../../types';
import { formatLastSeen } from '../../utils/deviceDisplay';
import { describeBulkCommand, CommandOutcomeMessage } from '../../utils/commandOutcome';

interface Command {
  id: string;
  commandType: string;
  /** The target device's identifier, as the device list shows it. */
  deviceName: string;
  parameters: any;
  status: CommandStatus;
  result?: any;
  createdAt: string;
  updatedAt?: string;
}

interface Device {
  id: string;
  deviceName: string;
  deviceModel: string;
  status: DeviceStatus;
  lastSeen: string | null;
}

/** The server never sends commands to these; offering them only produces an error. */
const REVOKED: DeviceStatus[] = ['SUSPENDED', 'WIPED'];
const SETTLED: CommandStatus[] = ['EXECUTED', 'FAILED', 'CANCELLED'];

/** Pulls the server's reason out of an error, whichever field it used. */
function apiErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  const details = Array.isArray(data?.errors)
    ? data.errors.map((e: any) => e.message ?? e).join('; ')
    : '';
  return [data?.message ?? data?.error, details].filter(Boolean).join(': ') || err?.message || fallback;
}

interface CommandFormData {
  commandType: string;
  deviceIds: string[];
  parameters: any;
}

const CommandsPage: React.FC = () => {
  const { hasPermission } = useAuthContext();
  const [commands, setCommands] = useState<Command[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [outcome, setOutcome] = useState<CommandOutcomeMessage | null>(null);
  const [formData, setFormData] = useState<CommandFormData>({
    commandType: '',
    deviceIds: [],
    parameters: {},
  });

  // Only commands the device agent implements (AGENT_COMMANDS in @mdm/shared-types).
  // This offered wipe, reboot, ring, screenshot, app install, Wi-Fi and lost mode, none
  // of which the agent can execute; the backend now refuses them.
  const commandTypes: Array<{ value: CommandType; label: string; icon: React.ReactElement; category: string }> = [
    { value: 'LOCK_DEVICE', label: 'Lock Device', icon: <Lock />, category: 'Security' },
    { value: 'UNLOCK_DEVICE', label: 'Unlock Device', icon: <LockOpen />, category: 'Security' },
    { value: 'LOCATE_DEVICE', label: 'Locate Device', icon: <LocationOn />, category: 'Location' },
    { value: 'GET_DEVICE_INFO', label: 'Get Device Info', icon: <PhoneAndroid />, category: 'Monitoring' },
    { value: 'SET_KIOSK_MODE', label: 'Enable Kiosk Mode', icon: <Tablet />, category: 'Control' },
    { value: 'EXIT_KIOSK_MODE', label: 'Disable Kiosk Mode', icon: <TabletAndroid />, category: 'Control' },
    { value: 'SYNC_SETTINGS', label: 'Sync Settings', icon: <Refresh />, category: 'Control' },
  ];

  const fetchCommands = async () => {
    try {
      setLoading(true);
      const commandsData = await apiService.getCommands({ limit: 100 });

      const mappedCommands: Command[] = (commandsData.data || []).map((command: any) => ({
        id: command.id,
        commandType: command.command,
        deviceName: command.device?.deviceId ?? command.deviceId,
        parameters: command.parameters,
        status: command.status as CommandStatus,
        ...(command.result !== undefined ? { result: command.result } : {}),
        createdAt: command.createdAt,
        ...(command.updatedAt !== undefined ? { updatedAt: command.updatedAt } : {}),
      }));

      setCommands(mappedCommands);
      setError(null);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to fetch commands'));
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      // Not limit 100: the server treats exactly 100 as "every device, with its recent
      // commands and events". A searchable picker replaces this list at fleet scale.
      const devicesData = await apiService.getDevices({ limit: 500 });

      const mappedDevices: Device[] = (devicesData.data || []).map(device => ({
        id: device.id,
        deviceName: device.deviceId,
        deviceModel: device.model,
        status: device.status,
        lastSeen: device.lastSeen ?? null,
      }));

      setDevices(mappedDevices);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to load devices'));
    }
  };

  useEffect(() => {
    fetchCommands();
    fetchDevices();
  }, []);

  const handleSendCommand = async () => {
    try {
      // The API field is `command`. This page used to post `commandType`, which the
      // server's validation refuses, so no command was ever sent from here.
      const response = await apiService.sendCommandToMultipleDevices({
        command: formData.commandType as CommandType,
        deviceIds: formData.deviceIds,
        parameters: formData.parameters,
      });
      const label = commandTypes.find(c => c.value === formData.commandType)?.label ?? formData.commandType;
      setOutcome(describeBulkCommand(label, response));
      await fetchCommands();
      handleCloseDialog();
      setError(null);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to send command'));
    }
  };

  const getDefaultParameters = (commandType: string) => {
    switch (commandType) {
      case 'LOCK_DEVICE':
        return { message: 'Device locked by administrator' };
      default:
        return {};
    }
  };

  /** Opens the send dialog, optionally with a command already chosen (the quick actions). */
  const handleOpenDialog = (commandType = '') => {
    setFormData({
      commandType,
      deviceIds: [],
      parameters: commandType ? getDefaultParameters(commandType) : {},
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

  // The server's statuses. This handled IN_PROGRESS and COMPLETED, which it never sends,
  // so an executed command showed the "waiting" clock.
  const getStatusIcon = (status: CommandStatus) => {
    switch (status) {
      case 'PENDING':
        return <Tooltip title="Waiting for the tablet to check in"><Schedule color="info" /></Tooltip>;
      case 'SENT':
        return <Tooltip title="Delivered; waiting for the result"><PlayArrow color="warning" /></Tooltip>;
      case 'EXECUTED':
        return <CheckCircle color="success" />;
      case 'FAILED':
        return <ErrorIcon color="error" />;
      case 'CANCELLED':
        return <Block color="disabled" />;
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
      
      default:
        return null;
    }
  };

  // `create` is the permission the API checks. No role has `execute`, so only super
  // admins (who match everything) used to see these buttons.
  const canExecuteCommands = hasPermission('commands', 'create');

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
              onClick={() => { fetchCommands(); fetchDevices(); }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<Send />}
              onClick={() => handleOpenDialog()}
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
                    onClick={() => handleOpenDialog(cmd.value)}
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
          <Typography variant="h6" gutterBottom>
            Command History
          </Typography>
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
                      <TableCell>Device</TableCell>
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
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {command.deviceName}
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
                            {SETTLED.includes(command.status)
                              ? formatDuration(command.createdAt, command.updatedAt)
                              : `waiting ${formatDuration(command.createdAt)}`}
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
                                onClick={() => handleOpenDialog()}
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
                  {/* Offline tablets are offered too: the server queues the command until the
                      tablet checks in. Only ACTIVE devices used to be listed, so a tablet out
                      of coverage, which is most of them, could not be sent anything. */}
                  {devices
                    .filter(device => !REVOKED.includes(device.status))
                    .map((device) => (
                      <MenuItem key={device.id} value={device.id}>
                        <Box>
                          <Typography variant="subtitle2">{device.deviceName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {device.deviceModel} ·{' '}
                            {device.status === 'ACTIVE'
                              ? 'reporting now'
                              : `offline, last seen ${formatLastSeen(device.lastSeen)}: will be queued`}
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

      {/* What happened to the command just sent: delivered now, or queued until reconnect. */}
      {outcome && (
        <Snackbar
          open
          onClose={(_, reason) => { if (reason !== 'clickaway') setOutcome(null); }}
          autoHideDuration={12000}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Alert severity={outcome.severity} onClose={() => setOutcome(null)} sx={{ maxWidth: 560 }}>
            {outcome.message}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
};

export default CommandsPage;