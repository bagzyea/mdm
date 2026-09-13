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
  Grid,
  Divider
} from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  MoreVert as MoreVertIcon,
  Check as ValidateIcon,
  Devices as DevicesIcon,
  Apps as AppsIcon,
  Folder as FilesIcon,
  QrCode as QrCodeIcon
} from '@mui/icons-material';
import {
  FormControlLabel,
  Switch
} from '@mui/material';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { APKSelectionBuilder } from '../../components/provisioning/APKSelectionBuilder';
import { 
  ProvisioningProfile, 
  CreateProvisioningProfileRequest,
  ProvisioningApp,
  FilePackage,
  APNConfiguration,
  ProvisioningSecurityConfig,
  GeographicRules,
  ProvisioningValidationResult,
  CompatibleDevicesResponse
} from '../../types';
import { provisioningService } from '../../services/api';
interface ProfileFormData {
  name: string;
  description: string;
  deviceModels: string[];
  applications: Omit<ProvisioningApp, 'id' | 'profileId'>[];
  selectedAPKs?: any[]; // For new flexible APK system
  networkConfig?: APNConfiguration;
  securityConfig?: ProvisioningSecurityConfig;
  filePackages: Omit<FilePackage, 'id' | 'profileId'>[];
  geographicRules?: GeographicRules;
}
const DEVICE_MODELS = ['Samsung-T225', 'Samsung-T295', 'ZTE', 'MiOne', 'Laxton'];
const FILE_TYPES = ['CONFIG', 'FORM', 'DATA', 'CERTIFICATE', 'DOCUMENTATION', 'MEDIA', 'OTHER'];
export const ProvisioningProfilesPage: React.FC = () => {
  const [profiles, setProfiles] = useState<ProvisioningProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'view'>('create');
  const [selectedProfile, setSelectedProfile] = useState<ProvisioningProfile | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuProfile, setMenuProfile] = useState<ProvisioningProfile | null>(null);
  const [validationResult, setValidationResult] = useState<ProvisioningValidationResult | null>(null);
  const [compatibleDevices, setCompatibleDevices] = useState<CompatibleDevicesResponse | null>(null);

  // QR Code Enrollment State
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [enrollmentProfile, setEnrollmentProfile] = useState<ProvisioningProfile | null>(null);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [apkUrl, setApkUrl] = useState('https://mdm.yourcompany.com/api/v1/apk');

  // Form state
  const [formData, setFormData] = useState<ProfileFormData>({
    name: '',
    description: '',
    deviceModels: [],
    applications: [],
    selectedAPKs: [],
    filePackages: []
  });
  const [useFlexibleAPKs, setUseFlexibleAPKs] = useState(false);
  useEffect(() => {
    fetchProfiles();
  }, []);
  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const response = await provisioningService.getProfiles();
      setProfiles(response);
    } catch (err) {
      setError('Failed to fetch provisioning profiles');
    } finally {
      setLoading(false);
    }
  };
  const handleCreateProfile = () => {
    setDialogMode('create');
    setSelectedProfile(null);
    setFormData({
      name: '',
      description: '',
      deviceModels: [],
      applications: [],
      selectedAPKs: [],
      filePackages: []
    });
    setUseFlexibleAPKs(false);
    setDialogOpen(true);
  };
  const handleEditProfile = (profile: ProvisioningProfile) => {
    setDialogMode('edit');
    setSelectedProfile(profile);
    setFormData({
      name: profile.name,
      description: profile.description || '',
      deviceModels: profile.deviceModels,
      applications: profile.applications.map(app => ({
        packageName: app.packageName,
        appName: app.appName,
        version: app.version || '',
        apkUrl: app.apkUrl || '',
        apkHash: app.apkHash || '',
        requiredPermissions: app.requiredPermissions,
        installOrder: app.installOrder,
        isRequired: app.isRequired
      })),
      // Optional fields are omitted rather than set to undefined, which
      // exactOptionalPropertyTypes treats as a different thing from absent.
      ...(profile.networkConfig !== undefined ? { networkConfig: profile.networkConfig } : {}),
      ...(profile.securityConfig !== undefined
        ? { securityConfig: profile.securityConfig }
        : {}),
      filePackages: profile.filePackages.map(pkg => ({
        name: pkg.name,
        description: pkg.description || '',
        fileType: pkg.fileType,
        filePath: pkg.filePath,
        fileHash: pkg.fileHash || '',
        targetPath: pkg.targetPath,
        isRequired: pkg.isRequired,
        fileSize: pkg.fileSize || 0
      })),
      ...(profile.geographicRules !== undefined
        ? { geographicRules: profile.geographicRules }
        : {}),
    });
    setDialogOpen(true);
  };
  const handleViewProfile = (profile: ProvisioningProfile) => {
    setDialogMode('view');
    setSelectedProfile(profile);
    setDialogOpen(true);
  };
  const handleDeleteProfile = async (profile: ProvisioningProfile) => {
    if (window.confirm(`Are you sure you want to delete profile "${profile.name}"?`)) {
      try {
        await provisioningService.deleteProfile(profile.id);
        await fetchProfiles();
      } catch (err) {
        setError('Failed to delete profile');
      }
    }
  };
  const handleValidateProfile = async (profile: ProvisioningProfile) => {
    try {
      const result = await provisioningService.validateProfile(profile.id);
      setValidationResult(result);
    } catch (err) {
      setError('Failed to validate profile');
    }
  };
  const handleGetCompatibleDevices = async (profile: ProvisioningProfile) => {
    try {
      const result = await provisioningService.getCompatibleDevices(profile.id);
      setCompatibleDevices(result);
    } catch (err) {
      setError('Failed to fetch compatible devices');
    }
  };
  const handleSaveProfile = async () => {
    try {
      const request: CreateProvisioningProfileRequest = { ...formData };

      // Map selectedAPKs to applications if flexible APK mode is enabled
      if (useFlexibleAPKs && formData.selectedAPKs && formData.selectedAPKs.length > 0) {
        request.applications = formData.selectedAPKs.map(sel => ({
          packageName: sel.apk.packageName,
          appName: sel.apk.appName,
          version: sel.apk.version,
          // Store a stable reference, not a URL. The backend mints a short-lived
          // signed download URL at dispatch time (finding F-06) — a signed URL baked
          // into a profile here would expire long before the profile was used.
          apkUrl: sel.apk.filePath,
          apkHash: sel.apk.apkHash,
          requiredPermissions: sel.apk.permissions,
          installOrder: sel.installOrder,
          isRequired: sel.isRequired
        }));
      }
      if (dialogMode === 'create') {
        await provisioningService.createProfile(request);
      } else if (dialogMode === 'edit' && selectedProfile) {
        await provisioningService.updateProfile(selectedProfile.id, request);
      }
      setDialogOpen(false);
      await fetchProfiles();
    } catch (err) {
      setError('Failed to save profile');
    }
  };
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, profile: ProvisioningProfile) => {
    setAnchorEl(event.currentTarget);
    setMenuProfile(profile);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuProfile(null);
  };
  const addApplication = () => {
    setFormData(prev => ({
      ...prev,
      applications: [
        ...prev.applications,
        {
          packageName: '',
          appName: '',
          version: '',
          apkUrl: '',
          apkHash: '',
          requiredPermissions: [],
          installOrder: prev.applications.length,
          isRequired: true
        }
      ]
    }));
  };
  const updateApplication = (index: number, field: keyof ProvisioningApp, value: any) => {
    setFormData(prev => ({
      ...prev,
      applications: prev.applications.map((app, i) => 
        i === index ? { ...app, [field]: value } : app
      )
    }));
  };
  const removeApplication = (index: number) => {
    setFormData(prev => ({
      ...prev,
      applications: prev.applications.filter((_, i) => i !== index)
    }));
  };
  const addFilePackage = () => {
    setFormData(prev => ({
      ...prev,
      filePackages: [
        ...prev.filePackages,
        {
          name: '',
          description: '',
          fileType: 'CONFIG' as const,
          filePath: '',
          fileHash: '',
          targetPath: '',
          isRequired: true
        }
      ]
    }));
  };
  const updateFilePackage = (index: number, field: keyof FilePackage, value: any) => {
    setFormData(prev => ({
      ...prev,
      filePackages: prev.filePackages.map((pkg, i) => 
        i === index ? { ...pkg, [field]: value } : pkg
      )
    }));
  };
  const removeFilePackage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      filePackages: prev.filePackages.filter((_, i) => i !== index)
    }));
  };
  const handleOpenQrEnrollment = (profile: ProvisioningProfile) => {
    setEnrollmentProfile(profile);
    setQrDialogOpen(true);
  };
  const generateProvisioningJson = () => {
    if (!enrollmentProfile) return '';
    const payload = {
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.mdm.app/com.mdm.app.admin.MDMDeviceAdminReceiver",
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "", // Add correct SHA-256 hash if enforcing security
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": apkUrl,
      "android.app.extra.PROVISIONING_WIFI_SSID": wifiSsid,
      "android.app.extra.PROVISIONING_WIFI_PASSWORD": wifiPassword,
      "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
      "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
      "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
        "provisioning_profile_id": enrollmentProfile.id
      }
    };
    return JSON.stringify(payload);
  };
  if (loading) return <LoadingSpinner />;
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Provisioning Profiles
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateProfile}
        >
          Create Profile
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Device Models</TableCell>
                  <TableCell>Applications</TableCell>
                  <TableCell>Files</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Sessions</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {profile.name}
                        </Typography>
                        {profile.description && (
                          <Typography variant="caption" color="text.secondary">
                            {profile.description}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {profile.deviceModels.map((model) => (
                          <Chip key={model} label={model} size="small" />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={`${profile._count?.applications || 0} applications`}>
                        <Chip
                          icon={<AppsIcon />}
                          label={profile._count?.applications || 0}
                          size="small"
                          variant="outlined"
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={`${profile._count?.filePackages || 0} file packages`}>
                        <Chip
                          icon={<FilesIcon />}
                          label={profile._count?.filePackages || 0}
                          size="small"
                          variant="outlined"
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={profile.isActive ? 'Active' : 'Inactive'}
                        color={profile.isActive ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {profile._count?.sessions || 0}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="View Profile">
                          <IconButton size="small" onClick={() => handleViewProfile(profile)}>
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Profile">
                          <IconButton size="small" onClick={() => handleEditProfile(profile)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, profile)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItemComponent onClick={() => {
          if (menuProfile) handleValidateProfile(menuProfile);
          handleMenuClose();
        }}>
          <ValidateIcon sx={{ mr: 1 }} />
          Validate Profile
        </MenuItemComponent>
        <MenuItemComponent onClick={() => {
          if (menuProfile) handleGetCompatibleDevices(menuProfile);
          handleMenuClose();
        }}>
          <DevicesIcon sx={{ mr: 1 }} />
          Compatible Devices
        </MenuItemComponent>
        <MenuItemComponent onClick={() => {
          if (menuProfile) handleOpenQrEnrollment(menuProfile);
          handleMenuClose();
        }}>
          <QrCodeIcon sx={{ mr: 1, color: 'primary.main' }} />
          Zero-Touch QR Setup
        </MenuItemComponent>
        <Divider />
        <MenuItemComponent 
          onClick={() => {
            if (menuProfile) handleDeleteProfile(menuProfile);
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          Delete Profile
        </MenuItemComponent>
      </Menu>

      {/* Profile Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {dialogMode === 'create' && 'Create Provisioning Profile'}
          {dialogMode === 'edit' && 'Edit Provisioning Profile'}
          {dialogMode === 'view' && 'View Provisioning Profile'}
        </DialogTitle>
        <DialogContent>
          {/* Basic Information */}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Profile Name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={dialogMode === 'view'}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Device Models</InputLabel>
                <Select
                  multiple
                  value={formData.deviceModels}
                  onChange={(e) => setFormData(prev => ({ ...prev, deviceModels: e.target.value as string[] }))}
                  disabled={dialogMode === 'view'}
                  required
                >
                  {DEVICE_MODELS.map((model) => (
                    <MenuItem key={model} value={model}>
                      {model}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                multiline
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                disabled={dialogMode === 'view'}
              />
            </Grid>
          </Grid>

          {/* Application Selection Mode */}
          <Box sx={{ mt: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Application Management
            </Typography>
            <FormControl component="fieldset" disabled={dialogMode === 'view'}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={useFlexibleAPKs}
                      onChange={(e) => setUseFlexibleAPKs(e.target.checked)}
                    />
                  }
                  label="Use Flexible APK Selection"
                />
                <Typography variant="body2" color="text.secondary">
                  Enable to select APKs from registry with data folder configuration
                </Typography>
              </Box>
            </FormControl>
          </Box>

          {useFlexibleAPKs ? (
            /* New Flexible APK Selection */
            <APKSelectionBuilder
              deviceModels={formData.deviceModels}
              {...(formData.geographicRules &&
              (formData.geographicRules.districts || formData.geographicRules.regions)
                ? {
                    deviceLocation: {
                      district: formData.geographicRules.districts?.[0] || '',
                      region: formData.geographicRules.regions?.[0] || '',
                    },
                  }
                : {})}
              onSelectionChange={(selectedAPKs) => {
                setFormData(prev => ({ ...prev, selectedAPKs }));
              }}
              initialSelection={formData.selectedAPKs || []}
            />
          ) : (
            /* Legacy Application Configuration */
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Applications (Legacy Mode)
              </Typography>
              {formData.applications.map((app, index) => (
            <Card key={index} sx={{ mb: 2, p: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="App Name"
                    value={app.appName}
                    onChange={(e) => updateApplication(index, 'appName', e.target.value)}
                    disabled={dialogMode === 'view'}
                    required
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Package Name"
                    value={app.packageName}
                    onChange={(e) => updateApplication(index, 'packageName', e.target.value)}
                    disabled={dialogMode === 'view'}
                    required
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Version"
                    value={app.version}
                    onChange={(e) => updateApplication(index, 'version', e.target.value)}
                    disabled={dialogMode === 'view'}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Install Order"
                    type="number"
                    value={app.installOrder}
                    onChange={(e) => updateApplication(index, 'installOrder', parseInt(e.target.value))}
                    disabled={dialogMode === 'view'}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth>
                    <InputLabel>Required</InputLabel>
                    <Select
                      value={app.isRequired}
                      onChange={(e) => updateApplication(index, 'isRequired', e.target.value)}
                      disabled={dialogMode === 'view'}
                    >
                      <MenuItem value="true">Yes</MenuItem>
                      <MenuItem value="false">No</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                {dialogMode !== 'view' && (
                  <Grid item xs={12}>
                    <Button
                      color="error"
                      onClick={() => removeApplication(index)}
                    >
                      Remove Application
                    </Button>
                  </Grid>
                )}
              </Grid>
            </Card>
          ))}
          {dialogMode !== 'view' && (
            <Button
              startIcon={<AddIcon />}
              onClick={addApplication}
              sx={{ mb: 2 }}
            >
                Add Application
              </Button>
            )}
            </Box>
          )}

          {/* File Packages Section */}
          <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
            File Packages
          </Typography>
          {formData.filePackages.map((pkg, index) => (
            <Card key={index} sx={{ mb: 2, p: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Package Name"
                    value={pkg.name}
                    onChange={(e) => updateFilePackage(index, 'name', e.target.value)}
                    disabled={dialogMode === 'view'}
                    required
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>File Type</InputLabel>
                    <Select
                      value={pkg.fileType}
                      onChange={(e) => updateFilePackage(index, 'fileType', e.target.value)}
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
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Target Path"
                    value={pkg.targetPath}
                    onChange={(e) => updateFilePackage(index, 'targetPath', e.target.value)}
                    disabled={dialogMode === 'view'}
                    required
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Required</InputLabel>
                    <Select
                      value={pkg.isRequired}
                      onChange={(e) => updateFilePackage(index, 'isRequired', e.target.value)}
                      disabled={dialogMode === 'view'}
                    >
                      <MenuItem value="true">Yes</MenuItem>
                      <MenuItem value="false">No</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                {dialogMode !== 'view' && (
                  <Grid item xs={12}>
                    <Button
                      color="error"
                      onClick={() => removeFilePackage(index)}
                    >
                      Remove File Package
                    </Button>
                  </Grid>
                )}
              </Grid>
            </Card>
          ))}
          {dialogMode !== 'view' && (
            <Button
              startIcon={<AddIcon />}
              onClick={addFilePackage}
              sx={{ mb: 2 }}
            >
              Add File Package
            </Button>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            {dialogMode === 'view' ? 'Close' : 'Cancel'}
          </Button>
          {dialogMode !== 'view' && (
            <Button onClick={handleSaveProfile} variant="contained">
              {dialogMode === 'create' ? 'Create' : 'Update'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Validation Result Dialog */}
      <Dialog
        open={Boolean(validationResult)}
        onClose={() => setValidationResult(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Profile Validation</DialogTitle>
        <DialogContent>
          {validationResult && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {validationResult.profileName}
              </Typography>
              <Alert 
                severity={validationResult.validation.isValid ? 'success' : 'error'}
                sx={{ mb: 2 }}
              >
                {validationResult.validation.isValid 
                  ? 'Profile is valid and ready for deployment'
                  : 'Profile has validation issues that need to be resolved'
                }
              </Alert>
              
              {validationResult.validation.warnings.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">Warnings:</Typography>
                  <ul>
                    {validationResult.validation.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              
              {validationResult.validation.errors.length > 0 && (
                <Alert severity="error">
                  <Typography variant="subtitle2">Errors:</Typography>
                  <ul>
                    {validationResult.validation.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setValidationResult(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Compatible Devices Dialog */}
      <Dialog
        open={Boolean(compatibleDevices)}
        onClose={() => setCompatibleDevices(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Compatible Devices</DialogTitle>
        <DialogContent>
          {compatibleDevices && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Found {compatibleDevices.totalCompatible} compatible devices
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Supported models: {compatibleDevices.supportedModels.join(', ')}
              </Typography>
              
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Device ID</TableCell>
                      <TableCell>Model</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Provisioning Status</TableCell>
                      <TableCell>Last Seen</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {compatibleDevices.compatibleDevices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>{device.deviceId}</TableCell>
                        <TableCell>{device.model}</TableCell>
                        <TableCell>
                          <Chip
                            label={device.status}
                            size="small"
                            color={device.status === 'ACTIVE' ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={device.provisioningStatus || 'NOT_PROVISIONED'}
                            size="small"
                            color={device.provisioningStatus === 'COMPLETED' ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          {new Date(device.lastSeen).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompatibleDevices(null)}>Close</Button>
        </DialogActions>
      </Dialog>
      
      {/* QR Code Enrollment Dialog */}
      <Dialog
        open={qrDialogOpen}
        onClose={() => setQrDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Zero-Touch QR Enrollment</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body1" paragraph>
              To provision a new device, factory reset the Android device, tap the "Hello" or "Welcome" screen 6 times rapidly, and scan the generated QR code.
            </Typography>
            
            <Grid container spacing={4}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Network & Server Config</Typography>
                <TextField
                  fullWidth
                  label="Enrollment Target APK URL"
                  value={apkUrl}
                  onChange={(e) => setApkUrl(e.target.value)}
                  sx={{ mb: 2 }}
                />
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
              </Grid>
              <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Paper elevation={3} sx={{ p: 4, display: 'inline-block', bgcolor: 'white' }}>
                  {wifiSsid && apkUrl ? (
                    <QRCodeSVG 
                      value={generateProvisioningJson()} 
                      size={256}
                      level="M"
                    />
                  ) : (
                    <Box sx={{ width: 256, height: 256, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed grey' }}>
                      <Typography color="text.secondary" align="center">
                        Please provide Wi-Fi SSID and APK URL to generate QR payload
                      </Typography>
                    </Box>
                  )}
                </Paper>
                <Typography variant="caption" sx={{ mt: 2, color: 'text.secondary', textAlign: 'center', display: 'block' }}>
                  Profile ID: {enrollmentProfile?.id}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};