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
  Tooltip,
  Menu,
  MenuItem as MenuItemComponent,
  Alert,
  LinearProgress,
  Grid,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  MoreVert as MoreVertIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Schedule as PendingIcon,
  Devices as DevicesIcon,
  Apps as AppsIcon,
  Download as DownloadIcon,
  InstallDesktop as InstallIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { provisioningService } from '../../services/api';

interface DeploymentSession {
  id: string;
  profileId: string;
  name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  deviceIds: string[];
  applications: string[];
  totalDevices: number;
  completedDevices: number;
  failedDevices: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  progress?: DeploymentProgress[];
}

interface DeploymentProgress {
  deviceId: string;
  status: 'PENDING' | 'DOWNLOADING' | 'INSTALLING' | 'COMPLETED' | 'FAILED';
  currentStep?: string;
  progress?: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

interface DeploymentFormData {
  profileId: string;
  name: string;
  description?: string;
  deviceIds: string[];
  applications: string[];
  options: {
    parallelLimit?: number;
    retryAttempts?: number;
    skipValidation?: boolean;
  };
}

const APPLICATIONS = [
  'com.microsoft.office.outlook',
  'com.microsoft.office.word',
  'com.microsoft.office.excel',
  'com.google.android.apps.docs',
  'com.google.android.apps.sheets',
  'com.google.android.apps.slides',
  'com.spotify.music',
  'com.netflix.mediaclient',
  'com.whatsapp',
  'com.facebook.katana'
];

export const BulkDeploymentPage: React.FC = () => {
  const [deployments, setDeployments] = useState<DeploymentSession[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentSession | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuDeployment, setMenuDeployment] = useState<DeploymentSession | null>(null);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [deploymentProgress, setDeploymentProgress] = useState<DeploymentProgress[]>([]);

  // Form state
  const [formData, setFormData] = useState<DeploymentFormData>({
    profileId: '',
    name: '',
    description: '',
    deviceIds: [],
    applications: [],
    options: {
      parallelLimit: 5,
      retryAttempts: 3,
      skipValidation: false
    }
  });

  useEffect(() => {
    fetchDeployments();
    fetchProfiles();
    fetchDevices();
  }, []);

  const fetchDeployments = async () => {
    try {
      setLoading(true);
      // This would need to be implemented in the backend
      // For now, we'll use a mock implementation
      const mockDeployments: DeploymentSession[] = [
        {
          id: '1',
          profileId: 'profile1',
          name: 'Office Apps Deployment',
          status: 'COMPLETED',
          deviceIds: ['device1', 'device2'],
          applications: ['com.microsoft.office.outlook', 'com.microsoft.office.word'],
          totalDevices: 2,
          completedDevices: 2,
          failedDevices: 0,
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          completedAt: new Date(Date.now() - 1800000).toISOString(),
          createdAt: new Date(Date.now() - 7200000).toISOString()
        }
      ];
      setDeployments(mockDeployments);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching deployments:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch deployments');
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const data = await provisioningService.getProfiles();
      setProfiles(data);
    } catch (err: any) {
      console.error('Error fetching profiles:', err);
    }
  };

  const fetchDevices = async () => {
    try {
      const devicesData = await provisioningService.getDevices();
      setDevices(devicesData.data || []);
    } catch (err: any) {
      console.error('Error fetching devices:', err);
    }
  };

  const handleCreateDeployment = () => {
    setSelectedDeployment(null);
    setFormData({
      profileId: '',
      name: '',
      description: '',
      deviceIds: [],
      applications: [],
      options: {
        parallelLimit: 5,
        retryAttempts: 3,
        skipValidation: false
      }
    });
    setDialogOpen(true);
  };

  const handleViewDeployment = (deployment: DeploymentSession) => {
    setSelectedDeployment(deployment);
    setProgressDialogOpen(true);
    fetchDeploymentProgress(deployment.id);
  };

  const handleDeleteDeployment = async (deployment: DeploymentSession) => {
    if (!window.confirm(`Are you sure you want to delete "${deployment.name}"?`)) {
      return;
    }

    try {
      await provisioningService.cancelDeployment(deployment.id);
      await fetchDeployments();
      setError(null);
    } catch (err: any) {
      console.error('Error deleting deployment:', err);
      setError(err.response?.data?.message || err.message || 'Failed to delete deployment');
    }
  };

  const handleStartDeployment = async (deployment: DeploymentSession) => {
    try {
      await provisioningService.bulkDeployApplications(deployment.profileId, {
        deviceIds: deployment.deviceIds,
        applications: deployment.applications,
        options: {
          parallelLimit: 5,
          retryAttempts: 3,
          skipValidation: false
        }
      });
      await fetchDeployments();
      setError(null);
    } catch (err: any) {
      console.error('Error starting deployment:', err);
      setError(err.response?.data?.message || err.message || 'Failed to start deployment');
    }
  };

  const handleSaveDeployment = async () => {
    try {
      await provisioningService.bulkDeployApplications(formData.profileId, {
        deviceIds: formData.deviceIds,
        applications: formData.applications,
        options: formData.options
      });
      await fetchDeployments();
      setDialogOpen(false);
      setError(null);
    } catch (err: any) {
      console.error('Error creating deployment:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create deployment');
    }
  };

  const fetchDeploymentProgress = async (deploymentId: string) => {
    try {
      const progress = await provisioningService.getDeploymentProgress(deploymentId);
      setDeploymentProgress(progress);
    } catch (err: any) {
      console.error('Error fetching deployment progress:', err);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, deployment: DeploymentSession) => {
    setAnchorEl(event.currentTarget);
    setMenuDeployment(deployment);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuDeployment(null);
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
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <SuccessIcon />;
      case 'IN_PROGRESS':
        return <CircularProgress size={20} />;
      case 'FAILED':
        return <ErrorIcon />;
      case 'CANCELLED':
        return <WarningIcon />;
      default:
        return <PendingIcon />;
    }
  };

  const getProgressPercentage = (deployment: DeploymentSession) => {
    if (deployment.totalDevices === 0) return 0;
    return Math.round((deployment.completedDevices / deployment.totalDevices) * 100);
  };

  if (loading) {
    return <LoadingSpinner message="Loading bulk deployments..." />;
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Bulk Application Deployment
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateDeployment}
        >
          Create Deployment
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {deployments.map((deployment) => (
          <Grid item xs={12} md={6} lg={4} key={deployment.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography variant="h6" component="h2">
                    {deployment.name}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, deployment)}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  {getStatusIcon(deployment.status)}
                  <Chip
                    label={deployment.status}
                    color={getStatusColor(deployment.status) as any}
                    size="small"
                    sx={{ ml: 1 }}
                  />
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Progress:
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={getProgressPercentage(deployment)}
                    sx={{ mb: 1 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {deployment.completedDevices} of {deployment.totalDevices} devices completed
                  </Typography>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Applications:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {deployment.applications.slice(0, 3).map((app) => (
                      <Chip key={app} label={app.split('.').pop()} size="small" />
                    ))}
                    {deployment.applications.length > 3 && (
                      <Chip label={`+${deployment.applications.length - 3} more`} size="small" />
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(deployment.createdAt).toLocaleDateString()}
                  </Typography>
                  {deployment.startedAt && (
                    <Typography variant="caption" color="text.secondary">
                      Duration: {Math.round((new Date(deployment.completedAt || Date.now()).getTime() - new Date(deployment.startedAt).getTime()) / 60000)}m
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Create Deployment Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create Bulk Deployment</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Deployment Name"
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
            <FormControl fullWidth>
              <InputLabel>Applications</InputLabel>
              <Select
                multiple
                value={formData.applications}
                onChange={(e) => setFormData({ ...formData, applications: e.target.value as string[] })}
                label="Applications"
              >
                {APPLICATIONS.map((app) => (
                  <MenuItem key={app} value={app}>
                    {app}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Divider />
            <Typography variant="h6">Deployment Options</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Parallel Limit"
                  type="number"
                  value={formData.options.parallelLimit}
                  onChange={(e) => setFormData({
                    ...formData,
                    options: { ...formData.options, parallelLimit: parseInt(e.target.value) }
                  })}
                  fullWidth
                  inputProps={{ min: 1, max: 20 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Retry Attempts"
                  type="number"
                  value={formData.options.retryAttempts}
                  onChange={(e) => setFormData({
                    ...formData,
                    options: { ...formData.options, retryAttempts: parseInt(e.target.value) }
                  })}
                  fullWidth
                  inputProps={{ min: 0, max: 10 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Skip Validation</InputLabel>
                  <Select
                    value={formData.options.skipValidation ? 'true' : 'false'}
                    onChange={(e) => setFormData({
                      ...formData,
                      options: { ...formData.options, skipValidation: e.target.value === 'true' }
                    })}
                    label="Skip Validation"
                  >
                    <MenuItem value="false">No</MenuItem>
                    <MenuItem value="true">Yes</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveDeployment} variant="contained">
            Create Deployment
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deployment Progress Dialog */}
      <Dialog open={progressDialogOpen} onClose={() => setProgressDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Deployment Progress - {selectedDeployment?.name}
        </DialogTitle>
        <DialogContent>
          {deploymentProgress.length > 0 ? (
            <List>
              {deploymentProgress.map((progress) => (
                <ListItem key={progress.deviceId}>
                  <ListItemIcon>
                    {getStatusIcon(progress.status)}
                  </ListItemIcon>
                  <ListItemText
                    primary={`Device ${progress.deviceId}`}
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Status: {progress.status}
                        </Typography>
                        {progress.currentStep && (
                          <Typography variant="body2" color="text.secondary">
                            Current Step: {progress.currentStep}
                          </Typography>
                        )}
                        {progress.progress !== undefined && (
                          <LinearProgress
                            variant="determinate"
                            value={progress.progress}
                            sx={{ mt: 1 }}
                          />
                        )}
                        {progress.errorMessage && (
                          <Typography variant="body2" color="error">
                            Error: {progress.errorMessage}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body1" color="text.secondary">
              No progress data available
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgressDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Deployment Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItemComponent onClick={() => {
          if (menuDeployment) handleViewDeployment(menuDeployment);
          handleMenuClose();
        }}>
          <ViewIcon sx={{ mr: 1 }} />
          View Progress
        </MenuItemComponent>
        {menuDeployment?.status === 'PENDING' && (
          <MenuItemComponent onClick={() => {
            if (menuDeployment) handleStartDeployment(menuDeployment);
            handleMenuClose();
          }}>
            <StartIcon sx={{ mr: 1 }} />
            Start Deployment
          </MenuItemComponent>
        )}
        {menuDeployment?.status === 'IN_PROGRESS' && (
          <MenuItemComponent onClick={() => {
            if (menuDeployment) handleDeleteDeployment(menuDeployment);
            handleMenuClose();
          }}>
            <StopIcon sx={{ mr: 1 }} />
            Cancel Deployment
          </MenuItemComponent>
        )}
        <MenuItemComponent onClick={() => {
          if (menuDeployment) handleDeleteDeployment(menuDeployment);
          handleMenuClose();
        }}>
          <DeleteIcon sx={{ mr: 1 }} />
          Delete Deployment
        </MenuItemComponent>
      </Menu>
    </Box>
  );
};
