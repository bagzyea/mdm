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
  ListItemIcon
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  MoreVert as MoreVertIcon,
  PlayArrow as ApplyIcon,
  Check as ValidateIcon,
  Devices as DevicesIcon,
  Apps as AppsIcon,
  Folder as FilesIcon,
  LocationOn as LocationIcon
} from '@mui/icons-material';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { provisioningService } from '../../services/api';

interface FieldConfiguration {
  id: string;
  name: string;
  description?: string;
  deviceModels: string[];
  applications: string[];
  networkConfig?: any;
  securityConfig?: any;
  filePackages: any[];
  geographicRules?: any;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

interface FieldConfigurationFormData {
  name: string;
  description: string;
  deviceModels: string[];
  applications: string[];
  networkConfig?: any;
  securityConfig?: any;
  filePackages: any[];
  geographicRules?: any;
}

const DEVICE_MODELS = ['Samsung-T225', 'Samsung-T295', 'ZTE', 'MiOne', 'Laxton'];
const FILE_TYPES = ['CONFIG', 'FORM', 'DATA', 'CERTIFICATE', 'DOCUMENTATION', 'MEDIA', 'OTHER'];

export const FieldConfigurationsPage: React.FC = () => {
  const [configurations, setConfigurations] = useState<FieldConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'view'>('create');
  const [selectedConfiguration, setSelectedConfiguration] = useState<FieldConfiguration | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuConfiguration, setMenuConfiguration] = useState<FieldConfiguration | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState<FieldConfigurationFormData>({
    name: '',
    description: '',
    deviceModels: [],
    applications: [],
    filePackages: []
  });

  useEffect(() => {
    fetchConfigurations();
    fetchDevices();
  }, []);

  const fetchConfigurations = async () => {
    try {
      setLoading(true);
      const data = await provisioningService.getFieldConfigurations();
      setConfigurations(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching field configurations:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch field configurations');
    } finally {
      setLoading(false);
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

  const handleCreateConfiguration = () => {
    setDialogMode('create');
    setSelectedConfiguration(null);
    setFormData({
      name: '',
      description: '',
      deviceModels: [],
      applications: [],
      filePackages: []
    });
    setDialogOpen(true);
  };

  const handleEditConfiguration = (configuration: FieldConfiguration) => {
    setDialogMode('edit');
    setSelectedConfiguration(configuration);
    setFormData({
      name: configuration.name,
      description: configuration.description || '',
      deviceModels: configuration.deviceModels || [],
      applications: configuration.applications || [],
      networkConfig: configuration.networkConfig,
      securityConfig: configuration.securityConfig,
      filePackages: configuration.filePackages || [],
      geographicRules: configuration.geographicRules
    });
    setDialogOpen(true);
  };

  const handleViewConfiguration = (configuration: FieldConfiguration) => {
    setDialogMode('view');
    setSelectedConfiguration(configuration);
    setFormData({
      name: configuration.name,
      description: configuration.description || '',
      deviceModels: configuration.deviceModels || [],
      applications: configuration.applications || [],
      networkConfig: configuration.networkConfig,
      securityConfig: configuration.securityConfig,
      filePackages: configuration.filePackages || [],
      geographicRules: configuration.geographicRules
    });
    setDialogOpen(true);
  };

  const handleDeleteConfiguration = async (configuration: FieldConfiguration) => {
    if (!window.confirm(`Are you sure you want to delete "${configuration.name}"?`)) {
      return;
    }

    try {
      await provisioningService.deleteFieldConfiguration(configuration.id);
      await fetchConfigurations();
      setError(null);
    } catch (err: any) {
      console.error('Error deleting field configuration:', err);
      setError(err.response?.data?.message || err.message || 'Failed to delete field configuration');
    }
  };

  const handleApplyConfiguration = (configuration: FieldConfiguration) => {
    setSelectedConfiguration(configuration);
    setSelectedDevices([]);
    setApplyDialogOpen(true);
  };

  const handleSaveConfiguration = async () => {
    try {
      if (dialogMode === 'create') {
        await provisioningService.createFieldConfiguration(formData);
      } else if (selectedConfiguration) {
        await provisioningService.updateFieldConfiguration(selectedConfiguration.id, formData);
      }
      await fetchConfigurations();
      setDialogOpen(false);
      setError(null);
    } catch (err: any) {
      console.error('Error saving field configuration:', err);
      setError(err.response?.data?.message || err.message || 'Failed to save field configuration');
    }
  };

  const handleApplyToDevices = async () => {
    if (!selectedConfiguration || selectedDevices.length === 0) return;

    try {
      await provisioningService.applyFieldConfiguration(selectedConfiguration.id, selectedDevices);
      setApplyDialogOpen(false);
      setError(null);
    } catch (err: any) {
      console.error('Error applying field configuration:', err);
      setError(err.response?.data?.message || err.message || 'Failed to apply field configuration');
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, configuration: FieldConfiguration) => {
    setAnchorEl(event.currentTarget);
    setMenuConfiguration(configuration);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuConfiguration(null);
  };

  const addFilePackage = () => {
    setFormData({
      ...formData,
      filePackages: [
        ...formData.filePackages,
        {
          name: '',
          description: '',
          fileType: 'CONFIG',
          filePath: '',
          targetPath: '',
          isRequired: false
        }
      ]
    });
  };

  const updateFilePackage = (index: number, field: string, value: any) => {
    const updatedPackages = [...formData.filePackages];
    updatedPackages[index] = { ...updatedPackages[index], [field]: value };
    setFormData({ ...formData, filePackages: updatedPackages });
  };

  const removeFilePackage = (index: number) => {
    const updatedPackages = formData.filePackages.filter((_, i) => i !== index);
    setFormData({ ...formData, filePackages: updatedPackages });
  };

  if (loading) {
    return <LoadingSpinner message="Loading field configurations..." />;
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Field Configurations
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateConfiguration}
        >
          Create Configuration
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {configurations.map((configuration) => (
          <Grid item xs={12} md={6} lg={4} key={configuration.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography variant="h6" component="h2">
                    {configuration.name}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, configuration)}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </Box>
                
                {configuration.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {configuration.description}
                  </Typography>
                )}

                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Device Models:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {configuration.deviceModels.map((model) => (
                      <Chip key={model} label={model} size="small" />
                    ))}
                  </Box>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Applications:
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {configuration.applications.length} applications configured
                  </Typography>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    File Packages:
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {configuration.filePackages.length} packages configured
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Chip
                    label={configuration.isActive ? 'Active' : 'Inactive'}
                    color={configuration.isActive ? 'success' : 'default'}
                    size="small"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(configuration.createdAt).toLocaleDateString()}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialogMode === 'create' ? 'Create Field Configuration' : 
           dialogMode === 'edit' ? 'Edit Field Configuration' : 'View Field Configuration'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Configuration Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
              disabled={dialogMode === 'view'}
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
              disabled={dialogMode === 'view'}
            />
            <FormControl fullWidth>
              <InputLabel>Device Models</InputLabel>
              <Select
                multiple
                value={formData.deviceModels}
                onChange={(e) => setFormData({ ...formData, deviceModels: e.target.value as string[] })}
                label="Device Models"
                disabled={dialogMode === 'view'}
              >
                {DEVICE_MODELS.map((model) => (
                  <MenuItem key={model} value={model}>
                    {model}
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
                disabled={dialogMode === 'view'}
              >
                {['com.example.app1', 'com.example.app2', 'com.example.app3'].map((app) => (
                  <MenuItem key={app} value={app}>
                    {app}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Divider />
            <Typography variant="h6">File Packages</Typography>
            {formData.filePackages.map((pkg, index) => (
              <Box key={index} sx={{ border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Package Name"
                      value={pkg.name}
                      onChange={(e) => updateFilePackage(index, 'name', e.target.value)}
                      fullWidth
                      disabled={dialogMode === 'view'}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>File Type</InputLabel>
                      <Select
                        value={pkg.fileType}
                        onChange={(e) => updateFilePackage(index, 'fileType', e.target.value)}
                        label="File Type"
                        disabled={dialogMode === 'view'}
                      >
                        {FILE_TYPES.map((type) => (
                          <MenuItem key={type} value={type}>
                            {type}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="File Path"
                      value={pkg.filePath}
                      onChange={(e) => updateFilePackage(index, 'filePath', e.target.value)}
                      fullWidth
                      disabled={dialogMode === 'view'}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Target Path"
                      value={pkg.targetPath}
                      onChange={(e) => updateFilePackage(index, 'targetPath', e.target.value)}
                      fullWidth
                      disabled={dialogMode === 'view'}
                    />
                  </Grid>
                  {dialogMode !== 'view' && (
                    <Grid item xs={12}>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => removeFilePackage(index)}
                      >
                        Remove Package
                      </Button>
                    </Grid>
                  )}
                </Grid>
              </Box>
            ))}
            {dialogMode !== 'view' && (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addFilePackage}
              >
                Add File Package
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            {dialogMode === 'view' ? 'Close' : 'Cancel'}
          </Button>
          {dialogMode !== 'view' && (
            <Button onClick={handleSaveConfiguration} variant="contained">
              {dialogMode === 'create' ? 'Create' : 'Update'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Apply Configuration Dialog */}
      <Dialog open={applyDialogOpen} onClose={() => setApplyDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Apply Field Configuration</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body1" gutterBottom>
              Select devices to apply the &quot;{selectedConfiguration?.name}&quot; configuration:
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Devices</InputLabel>
              <Select
                multiple
                value={selectedDevices}
                onChange={(e) => setSelectedDevices(e.target.value as string[])}
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
          <Button onClick={() => setApplyDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleApplyToDevices} 
            variant="contained"
            disabled={selectedDevices.length === 0}
          >
            Apply to {selectedDevices.length} Device{selectedDevices.length !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Configuration Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItemComponent onClick={() => {
          if (menuConfiguration) handleViewConfiguration(menuConfiguration);
          handleMenuClose();
        }}>
          <ViewIcon sx={{ mr: 1 }} />
          View Details
        </MenuItemComponent>
        <MenuItemComponent onClick={() => {
          if (menuConfiguration) handleEditConfiguration(menuConfiguration);
          handleMenuClose();
        }}>
          <EditIcon sx={{ mr: 1 }} />
          Edit Configuration
        </MenuItemComponent>
        <MenuItemComponent onClick={() => {
          if (menuConfiguration) handleApplyConfiguration(menuConfiguration);
          handleMenuClose();
        }}>
          <ApplyIcon sx={{ mr: 1 }} />
          Apply to Devices
        </MenuItemComponent>
        <MenuItemComponent onClick={() => {
          if (menuConfiguration) handleDeleteConfiguration(menuConfiguration);
          handleMenuClose();
        }}>
          <DeleteIcon sx={{ mr: 1 }} />
          Delete Configuration
        </MenuItemComponent>
      </Menu>
    </Box>
  );
};
