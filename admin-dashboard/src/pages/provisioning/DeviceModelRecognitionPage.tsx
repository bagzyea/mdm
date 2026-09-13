import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  
  
  
  
  
  
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  
  
  
  
  
  Menu,
  MenuItem as MenuItemComponent,
  Alert,
  Grid,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  
  
  
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  MoreVert as MoreVertIcon,
  
  
  Warning as WarningIcon,
  
  
  
  
  
} from '@mui/icons-material';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { provisioningService } from '../../services/api';
interface DeviceModelInfo {
  id: string;
  deviceId: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkVersion: number;
  detectedModel?: string;
  modelConfidence?: number;
  specifications?: DeviceSpecifications;
  compatibilityStatus?: 'COMPATIBLE' | 'PARTIALLY_COMPATIBLE' | 'INCOMPATIBLE';
  lastDetected?: string;
  createdAt: string;
}
interface DeviceSpecifications {
  screenResolution?: string;
  screenSize?: string;
  processor?: string;
  ram?: string;
  storage?: string;
  batteryCapacity?: string;
  cameraResolution?: string;
  networkCapabilities?: string[];
  sensors?: string[];
}
interface ModelDetectionResult {
  deviceId: string;
  detectedModel: string;
  confidence: number;
  specifications: DeviceSpecifications;
  recommendations: string[];
  compatibleProfiles: string[];
}
export const DeviceModelRecognitionPage: React.FC = () => {
  const [devices, setDevices] = useState<DeviceModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceModelInfo | null>(null);
  const [detectionResult, setDetectionResult] = useState<ModelDetectionResult | null>(null);
  const [detectionDialogOpen, setDetectionDialogOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuDevice, setMenuDevice] = useState<DeviceModelInfo | null>(null);
  useEffect(() => {
    fetchDevices();
  }, []);
  const fetchDevices = async () => {
    try {
      setLoading(true);
      const devicesData = await provisioningService.getDevices();
      const devicesWithModelInfo: DeviceModelInfo[] = (devicesData.data || []).map((device: any) => ({
        id: device.id,
        deviceId: device.deviceId,
        manufacturer: device.manufacturer,
        model: device.model,
        androidVersion: device.androidVersion,
        sdkVersion: device.sdkVersion,
        detectedModel: device.detectedModel,
        modelConfidence: device.modelConfidence,
        specifications: device.specifications,
        compatibilityStatus: device.compatibilityStatus,
        lastDetected: device.lastDetected,
        createdAt: device.createdAt
      }));
      setDevices(devicesWithModelInfo);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching devices:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };
  const handleDetectModel = async (device: DeviceModelInfo) => {
    try {
      setDetecting(true);
      setSelectedDevice(device);
      const result = await provisioningService.detectDeviceModel(device.deviceId);
      setDetectionResult(result);
      setDetectionDialogOpen(true);
      // Refresh devices to update the detection status
      await fetchDevices();
    } catch (err: any) {
      console.error('Error detecting device model:', err);
      setError(err.response?.data?.message || err.message || 'Failed to detect device model');
    } finally {
      setDetecting(false);
    }
  };
  const handleBulkDetection = async () => {
    try {
      setDetecting(true);
      const devicesToDetect = devices.filter(device => !device.detectedModel);
      for (const device of devicesToDetect) {
        try {
          await provisioningService.detectDeviceModel(device.deviceId);
          // Add a small delay to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          console.error(`Error detecting model for device ${device.deviceId}:`, err);
        }
      }
      await fetchDevices();
      setError(null);
    } catch (err: any) {
      console.error('Error in bulk detection:', err);
      setError(err.response?.data?.message || err.message || 'Failed to perform bulk detection');
    } finally {
      setDetecting(false);
    }
  };
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, device: DeviceModelInfo) => {
    setAnchorEl(event.currentTarget);
    setMenuDevice(device);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuDevice(null);
  };
  const getCompatibilityColor = (status?: string) => {
    switch (status) {
      case 'COMPATIBLE':
        return 'success';
      case 'PARTIALLY_COMPATIBLE':
        return 'warning';
      case 'INCOMPATIBLE':
        return 'error';
      default:
        return 'default';
    }
  };
  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'default';
    if (confidence >= 80) return 'success';
    if (confidence >= 60) return 'warning';
    return 'error';
  };
  if (loading) {
    return <LoadingSpinner message="Loading devices..." />;
  }
  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Device Model Recognition
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchDevices}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={handleBulkDetection}
            disabled={detecting}
          >
            {detecting ? 'Detecting...' : 'Bulk Detection'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {devices.map((device) => (
          <Grid item xs={12} md={6} lg={4} key={device.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography variant="h6" component="h2">
                    {device.deviceId}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, device)}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    {device.manufacturer} {device.model}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Android {device.androidVersion} (SDK {device.sdkVersion})
                  </Typography>
                </Box>

                {device.detectedModel && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Detected Model:
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={device.detectedModel}
                        color={getConfidenceColor(device.modelConfidence) as any}
                        size="small"
                      />
                      {device.modelConfidence && (
                        <Typography variant="caption" color="text.secondary">
                          {device.modelConfidence}% confidence
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

                {device.compatibilityStatus && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Compatibility:
                    </Typography>
                    <Chip
                      label={device.compatibilityStatus.replace('_', ' ')}
                      color={getCompatibilityColor(device.compatibilityStatus) as any}
                      size="small"
                    />
                  </Box>
                )}

                {device.specifications && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Specifications:
                    </Typography>
                    <Grid container spacing={1}>
                      {device.specifications.screenResolution && (
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Screen: {device.specifications.screenResolution}
                          </Typography>
                        </Grid>
                      )}
                      {device.specifications.ram && (
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            RAM: {device.specifications.ram}
                          </Typography>
                        </Grid>
                      )}
                      {device.specifications.storage && (
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Storage: {device.specifications.storage}
                          </Typography>
                        </Grid>
                      )}
                      {device.specifications.batteryCapacity && (
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Battery: {device.specifications.batteryCapacity}
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  </Box>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(device.createdAt).toLocaleDateString()}
                  </Typography>
                  {device.lastDetected && (
                    <Typography variant="caption" color="text.secondary">
                      Last detected: {new Date(device.lastDetected).toLocaleDateString()}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Model Detection Result Dialog */}
      <Dialog open={detectionDialogOpen} onClose={() => setDetectionDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Model Detection Result - {selectedDevice?.deviceId}
        </DialogTitle>
        <DialogContent>
          {detectionResult && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="h6" gutterBottom>
                  Detected Model
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Chip
                    label={detectionResult.detectedModel}
                    color={getConfidenceColor(detectionResult.confidence) as any}
                    size="medium"
                  />
                  <Typography variant="body2" color="text.secondary">
                    {detectionResult.confidence}% confidence
                  </Typography>
                </Box>
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" gutterBottom>
                  Device Specifications
                </Typography>
                <Grid container spacing={2}>
                  {detectionResult.specifications.screenResolution && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">Screen Resolution</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {detectionResult.specifications.screenResolution}
                      </Typography>
                    </Grid>
                  )}
                  {detectionResult.specifications.screenSize && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">Screen Size</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {detectionResult.specifications.screenSize}
                      </Typography>
                    </Grid>
                  )}
                  {detectionResult.specifications.processor && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">Processor</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {detectionResult.specifications.processor}
                      </Typography>
                    </Grid>
                  )}
                  {detectionResult.specifications.ram && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">RAM</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {detectionResult.specifications.ram}
                      </Typography>
                    </Grid>
                  )}
                  {detectionResult.specifications.storage && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">Storage</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {detectionResult.specifications.storage}
                      </Typography>
                    </Grid>
                  )}
                  {detectionResult.specifications.batteryCapacity && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">Battery Capacity</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {detectionResult.specifications.batteryCapacity}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </Box>

              {detectionResult.recommendations.length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="h6" gutterBottom>
                      Recommendations
                    </Typography>
                    <List dense>
                      {detectionResult.recommendations.map((recommendation, index) => (
                        <ListItem key={index}>
                          <ListItemIcon>
                            <WarningIcon color="warning" />
                          </ListItemIcon>
                          <ListItemText primary={recommendation} />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                </>
              )}

              {detectionResult.compatibleProfiles.length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="h6" gutterBottom>
                      Compatible Profiles
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {detectionResult.compatibleProfiles.map((profile) => (
                        <Chip key={profile} label={profile} size="small" />
                      ))}
                    </Box>
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetectionDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Device Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItemComponent onClick={() => {
          if (menuDevice) handleDetectModel(menuDevice);
          handleMenuClose();
        }}>
          <SearchIcon sx={{ mr: 1 }} />
          Detect Model
        </MenuItemComponent>
        <MenuItemComponent onClick={() => {
          if (menuDevice) {
            setSelectedDevice(menuDevice);
            setDetectionDialogOpen(true);
          }
          handleMenuClose();
        }}>
          <ViewIcon sx={{ mr: 1 }} />
          View Details
        </MenuItemComponent>
      </Menu>
    </Box>
  );
};
