import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
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
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Menu,
  MenuItem as MenuItemComponent,
  Alert,
  LinearProgress,
  Grid,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  Add as AddIcon,
  PlayArrow as StartIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Visibility as ViewIcon,
  MoreVert as MoreVertIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Schedule as PendingIcon,
  Devices as DevicesIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import {
  ProvisioningSession,
  ProvisioningProfile,
  CreateProvisioningSessionRequest,
  ProvisioningDeviceStatus
} from '../../types';
import { provisioningService } from '../../services/api';
import websocketService from '../../services/websocket';
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
      id={`session-tabpanel-${index}`}
      aria-labelledby={`session-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}
export const ProvisioningSessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<ProvisioningSession[]>([]);
  const [profiles, setProfiles] = useState<ProvisioningProfile[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ProvisioningSession | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuSession, setMenuSession] = useState<ProvisioningSession | null>(null);
  const [tabValue, setTabValue] = useState(0);

  // Form state
  const [formData, setFormData] = useState<CreateProvisioningSessionRequest>({
    profileId: '',
    name: '',
    description: '',
    deviceIds: []
  });
  useEffect(() => {
    fetchSessions();
    fetchProfiles();
    fetchDevices();

    // Subscribe to provisioning progress updates using global websocket service
    const handleProvisioningProgress = (data: any) => {
      console.log('Received provisioning progress update:', data);
      setSessions(prevSessions =>
        prevSessions.map(session =>
          session.id === data.sessionId
            ? {
                ...session,
                progress: session.progress.map(progress =>
                  progress.deviceId === data.deviceId
                    ? {
                        ...progress,
                        status: data.status,
                        currentStep: data.currentStep || progress.currentStep,
                        completedSteps: data.completedSteps ?? progress.completedSteps,
                        totalSteps: data.totalSteps ?? progress.totalSteps,
                        errorMessage: data.errorMessage || progress.errorMessage,
                        errorCode: data.errorCode || progress.errorCode
                      }
                    : progress
                )
              }
            : session
        )
      );
    };
    websocketService.on('provisioningProgressUpdate', handleProvisioningProgress);

    // Set up polling as fallback (every 30 seconds instead of 5 to reduce server load now that we have socket updates)
    const interval = setInterval(() => {
      fetchSessions();
    }, 30000); // Refresh every 30 seconds
    return () => {
      if (interval) {
        clearInterval(interval);
      }
      websocketService.off('provisioningProgressUpdate', handleProvisioningProgress);
    };
  }, []);
  const fetchSessions = async () => {
    try {
      const response = await provisioningService.getSessions();
      setSessions(response.sessions || response);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching sessions:', err);
      setError(err.message || 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  };
  const fetchProfiles = async () => {
    try {
      const response = await provisioningService.getProfiles();
      setProfiles(response);
    } catch (err: any) {
      console.error('Error fetching profiles:', err);
    }
  };
  const fetchDevices = async () => {
    try {
      const response = await provisioningService.getDevices();
      setDevices(response.data || response);
    } catch (err: any) {
      console.error('Error fetching devices:', err);
    }
  };
  const handleCreateSession = () => {
    setFormData({
      profileId: '',
      name: '',
      description: '',
      deviceIds: []
    });
    setDialogOpen(true);
  };
  const handleViewSession = (session: ProvisioningSession) => {
    setSelectedSession(session);
    setTabValue(0);
  };
  const handleDeleteSession = async (session: ProvisioningSession) => {
    if (window.confirm(`Are you sure you want to delete session "${session.name}"?`)) {
      try {
        await provisioningService.deleteSession(session.id);
        fetchSessions();
      } catch (err: any) {
        setError(err.message || 'Failed to delete session');
      }
    }
  };
  const handleStartSession = async (session: ProvisioningSession) => {
    try {
      await provisioningService.startSession(session.id);
      fetchSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to start session');
    }
  };
  const handlePauseSession = async (session: ProvisioningSession) => {
    try {
      await provisioningService.pauseSession(session.id);
      fetchSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to pause session');
    }
  };
  const handleCancelSession = async (session: ProvisioningSession) => {
    if (window.confirm(`Are you sure you want to cancel session "${session.name}"?`)) {
      try {
        await provisioningService.cancelSession(session.id);
        fetchSessions();
      } catch (err: any) {
        setError(err.message || 'Failed to cancel session');
      }
    }
  };
  const handleSaveSession = async () => {
    try {
      if (selectedSession) {
        await provisioningService.updateSession(selectedSession.id, formData);
      } else {
        await provisioningService.createSession(formData);
      }
      setDialogOpen(false);
      fetchSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to save session');
    }
  };
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, session: ProvisioningSession) => {
    setAnchorEl(event.currentTarget);
    setMenuSession(session);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuSession(null);
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'IN_PROGRESS':
        return 'primary';
      case 'FAILED':
        return 'error';
      case 'CANCELLED':
        return 'default';
      case 'PAUSED':
        return 'warning';
      default:
        return 'default';
    }
  };
  const getProgressPercentage = (session: ProvisioningSession) => {
    if (session.totalDevices === 0) return 0;
    return Math.round((session.completedDevices / session.totalDevices) * 100);
  };
  const getDeviceStatusCount = (session: ProvisioningSession, status: ProvisioningDeviceStatus) => {
    return session.progress?.filter(p => p.status === status).length || 0;
  };
  const formatDuration = (startTime?: string, endTime?: string) => {
    if (!startTime) return 'Not started';
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diff = end.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };
  if (loading) {
    return <LoadingSpinner message="Loading provisioning sessions..." />;
  }
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Provisioning Sessions
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateSession}
        >
          Create Session
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Sessions Table */}
      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Session Name</TableCell>
                  <TableCell>Profile</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Progress</TableCell>
                  <TableCell>Devices</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{session.name}</Typography>
                      {session.description && (
                        <Typography variant="body2" color="text.secondary">
                          {session.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={session.profile?.name || 'Unknown Profile'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={session.status}
                        color={getStatusColor(session.status) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={getProgressPercentage(session)}
                          sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {getProgressPercentage(session)}%
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {session.completedDevices}/{session.totalDevices} devices
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Chip
                          icon={<SuccessIcon />}
                          label={getDeviceStatusCount(session, 'COMPLETED')}
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                        <Chip
                          icon={<ErrorIcon />}
                          label={getDeviceStatusCount(session, 'FAILED')}
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      {formatDuration(session.startedAt, session.completedAt)}
                    </TableCell>
                    <TableCell>
                      {new Date(session.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        onClick={(e) => handleMenuOpen(e, session)}
                        size="small"
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {sessions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Box sx={{ py: 4 }}>
                        <DevicesIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                          No provisioning sessions
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Create your first provisioning session to get started
                        </Typography>
                        <Button
                          variant="contained"
                          startIcon={<AddIcon />}
                          onClick={handleCreateSession}
                        >
                          Create Session
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Session Details Dialog */}
      {selectedSession && (
        <Dialog
          open={Boolean(selectedSession)}
          onClose={() => setSelectedSession(null)}
          maxWidth="lg"
          fullWidth
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">{selectedSession.name}</Typography>
              <Chip
                label={selectedSession.status}
                color={getStatusColor(selectedSession.status) as any}
              />
            </Box>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                <Tab label="Overview" />
                <Tab label="Progress" />
                <Tab label="Devices" />
                <Tab label="Logs" />
              </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Session Details</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Profile:</Typography>
                          <Typography variant="body2">{selectedSession.profile?.name}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Total Devices:</Typography>
                          <Typography variant="body2">{selectedSession.totalDevices}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Completed:</Typography>
                          <Typography variant="body2" color="success.main">
                            {selectedSession.completedDevices}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Failed:</Typography>
                          <Typography variant="body2" color="error.main">
                            {selectedSession.failedDevices}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Duration:</Typography>
                          <Typography variant="body2">
                            {formatDuration(selectedSession.startedAt, selectedSession.completedAt)}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Progress Overview</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="body2">Overall Progress</Typography>
                            <Typography variant="body2">{getProgressPercentage(selectedSession)}%</Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={getProgressPercentage(selectedSession)}
                            sx={{ height: 10, borderRadius: 5 }}
                          />
                        </Box>
                        <Grid container spacing={1}>
                          <Grid item xs={6}>
                            <Chip
                              icon={<SuccessIcon />}
                              label={`${getDeviceStatusCount(selectedSession, 'COMPLETED')} Completed`}
                              color="success"
                              variant="outlined"
                              sx={{ width: '100%' }}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <Chip
                              icon={<ErrorIcon />}
                              label={`${getDeviceStatusCount(selectedSession, 'FAILED')} Failed`}
                              color="error"
                              variant="outlined"
                              sx={{ width: '100%' }}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <Chip
                              icon={<PendingIcon />}
                              label={`${getDeviceStatusCount(selectedSession, 'PENDING')} Pending`}
                              color="default"
                              variant="outlined"
                              sx={{ width: '100%' }}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <Chip
                              icon={<WarningIcon />}
                              label={`${getDeviceStatusCount(selectedSession, 'DOWNLOADING_APPS') + getDeviceStatusCount(selectedSession, 'INSTALLING_APPS') + getDeviceStatusCount(selectedSession, 'CONFIGURING_NETWORK') + getDeviceStatusCount(selectedSession, 'CONFIGURING_SECURITY') + getDeviceStatusCount(selectedSession, 'DEPLOYING_FILES') + getDeviceStatusCount(selectedSession, 'VALIDATING')} In Progress`}
                              color="warning"
                              variant="outlined"
                              sx={{ width: '100%' }}
                            />
                          </Grid>
                        </Grid>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <Typography variant="h6" gutterBottom>Provisioning Progress</Typography>
              {selectedSession.progress?.map((progress) => (
                <Accordion key={progress.id}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                      <Chip
                        label={progress.status}
                        color={getStatusColor(progress.status) as any}
                        size="small"
                      />
                      <Typography variant="subtitle2">
                        {progress.device?.deviceId || progress.deviceId}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {progress.currentStep || 'Initializing...'}
                      </Typography>
                      <Box sx={{ flexGrow: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        {progress.completedSteps}/{progress.totalSteps} steps
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {progress.logs && progress.logs.length > 0 && (
                        <List dense>
                          {progress.logs.map((log, index) => (
                            <ListItem key={index}>
                              <ListItemIcon>
                                {log.level === 'ERROR' && <ErrorIcon color="error" />}
                                {log.level === 'WARN' && <WarningIcon color="warning" />}
                                {log.level === 'INFO' && <SuccessIcon color="success" />}
                              </ListItemIcon>
                              <ListItemText
                                primary={log.message}
                                secondary={new Date(log.timestamp).toLocaleString()}
                              />
                            </ListItem>
                          ))}
                        </List>
                      )}
                      {progress.errorMessage && (
                        <Alert severity="error">
                          <Typography variant="subtitle2">Error:</Typography>
                          {progress.errorMessage}
                        </Alert>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ))}
            </TabPanel>

            <TabPanel value={tabValue} index={2}>
              <Typography variant="h6" gutterBottom>Device Details</Typography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Device ID</TableCell>
                      <TableCell>Model</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Current Step</TableCell>
                      <TableCell>Progress</TableCell>
                      <TableCell>Started</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedSession.progress?.map((progress) => (
                      <TableRow key={progress.id}>
                        <TableCell>{progress.device?.deviceId || progress.deviceId}</TableCell>
                        <TableCell>{progress.device?.model || 'Unknown'}</TableCell>
                        <TableCell>
                          <Chip
                            label={progress.status}
                            color={getStatusColor(progress.status) as any}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{progress.currentStep || 'Initializing...'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={progress.totalSteps > 0 ? (progress.completedSteps / progress.totalSteps) * 100 : 0}
                              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                            />
                            <Typography variant="caption">
                              {progress.completedSteps}/{progress.totalSteps}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {progress.startedAt ? new Date(progress.startedAt).toLocaleString() : 'Not started'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </TabPanel>

            <TabPanel value={tabValue} index={3}>
              <Typography variant="h6" gutterBottom>Session Logs</Typography>
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {selectedSession.progress?.flatMap(p => p.logs || []).length > 0 ? (
                  <List dense>
                    {selectedSession.progress
                      ?.flatMap(p => p.logs || [])
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((log, index) => (
                        <ListItem key={index}>
                          <ListItemIcon>
                            {log.level === 'ERROR' && <ErrorIcon color="error" />}
                            {log.level === 'WARN' && <WarningIcon color="warning" />}
                            {log.level === 'INFO' && <SuccessIcon color="success" />}
                          </ListItemIcon>
                          <ListItemText
                            primary={log.message}
                            secondary={`${new Date(log.timestamp).toLocaleString()} - ${log.level}`}
                          />
                        </ListItem>
                      ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No logs available for this session.
                  </Typography>
                )}
              </Box>
            </TabPanel>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedSession(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Create/Edit Session Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedSession ? 'Edit Session' : 'Create New Session'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Session Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            <FormControl fullWidth required>
              <InputLabel>Profile</InputLabel>
              <Select
                value={formData.profileId}
                onChange={(e) => setFormData({ ...formData, profileId: e.target.value })}
                label="Profile"
              >
                {profiles.map((profile) => (
                  <MenuItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Devices</InputLabel>
              <Select
                multiple
                value={formData.deviceIds}
                onChange={(e) => setFormData({ ...formData, deviceIds: e.target.value as string[] })}
                label="Devices"
              >
                {devices.map((device) => (
                  <MenuItem key={device.id} value={device.id}>
                    {device.deviceId} ({device.model})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveSession} variant="contained">
            {selectedSession ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Session Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItemComponent onClick={() => {
          if (menuSession) handleViewSession(menuSession);
          handleMenuClose();
        }}>
          <ViewIcon sx={{ mr: 1 }} />
          View Details
        </MenuItemComponent>
        {menuSession?.status === 'PENDING' && (
          <MenuItemComponent onClick={() => {
            if (menuSession) handleStartSession(menuSession);
            handleMenuClose();
          }}>
            <StartIcon sx={{ mr: 1 }} />
            Start Session
          </MenuItemComponent>
        )}
        {menuSession?.status === 'IN_PROGRESS' && (
          <>
            <MenuItemComponent onClick={() => {
              if (menuSession) handlePauseSession(menuSession);
              handleMenuClose();
            }}>
              <PauseIcon sx={{ mr: 1 }} />
              Pause Session
            </MenuItemComponent>
            <MenuItemComponent onClick={() => {
              if (menuSession) handleCancelSession(menuSession);
              handleMenuClose();
            }}>
              <StopIcon sx={{ mr: 1 }} />
              Cancel Session
            </MenuItemComponent>
          </>
        )}
        {menuSession?.status === 'PAUSED' && (
          <MenuItemComponent onClick={() => {
            if (menuSession) handleStartSession(menuSession);
            handleMenuClose();
          }}>
            <StartIcon sx={{ mr: 1 }} />
            Resume Session
          </MenuItemComponent>
        )}
        <MenuItemComponent onClick={() => {
          if (menuSession) handleDeleteSession(menuSession);
          handleMenuClose();
        }}>
          <DeleteIcon sx={{ mr: 1 }} />
          Delete Session
        </MenuItemComponent>
      </Menu>
    </Box>
  );
};
