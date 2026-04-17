import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
} from '@mui/material';
import {
  LocationOn,
  Smartphone,
  Battery90,
  Visibility,
  VisibilityOff,
  Refresh,
  FilterList,
  MyLocation,
  ZoomIn,
  ZoomOut,
  Layers,
} from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../styles/map.css';
import { useAuthContext } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { Device, DeviceStatus } from '../../types/index';

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom device status icons
const createCustomIcon = (status: DeviceStatus, batteryLevel: number) => {
  const getStatusColor = (status: DeviceStatus) => {
    switch (status) {
      case 'ENROLLED':
      case 'ACTIVE':
        return '#10b981'; // green
      case 'INACTIVE':
        return '#6b7280'; // gray
      case 'SUSPENDED':
        return '#f59e0b'; // yellow
      case 'WIPED':
        return '#ef4444'; // red
      default:
        return '#6b7280';
    }
  };

  const getBatteryColor = (level: number) => {
    if (level <= 20) return '#ef4444'; // red
    if (level <= 50) return '#f59e0b'; // yellow
    return '#10b981'; // green
  };

  const statusColor = getStatusColor(status);
  const batteryColor = getBatteryColor(batteryLevel);

  const svgIcon = `
    <svg width="32" height="40" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
      <!-- Phone body -->
      <rect x="6" y="3" width="12" height="20" rx="2" ry="2" fill="${statusColor}" stroke="white" stroke-width="2"/>
      <!-- Phone screen -->
      <rect x="8" y="6" width="8" height="12" rx="1" ry="1" fill="white"/>
      <!-- Home button -->
      <circle cx="12" cy="20.5" r="1" fill="white"/>
      <!-- Battery indicator -->
      <circle cx="20" cy="5" r="4" fill="${batteryColor}" stroke="white" stroke-width="1.5"/>
      <text x="20" y="7" text-anchor="middle" font-size="6" fill="white" font-weight="bold">${batteryLevel}</text>
    </svg>
  `;

  return L.divIcon({
    html: svgIcon,
    className: 'custom-device-marker',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  });
};

// Map controls component
const MapControls: React.FC<{
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitBounds: () => void;
}> = ({ onZoomIn, onZoomOut, onFitBounds }) => {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Paper elevation={2} sx={{ p: 0.5 }}>
        <IconButton size="small" onClick={onZoomIn}>
          <ZoomIn />
        </IconButton>
      </Paper>
      <Paper elevation={2} sx={{ p: 0.5 }}>
        <IconButton size="small" onClick={onZoomOut}>
          <ZoomOut />
        </IconButton>
      </Paper>
      <Paper elevation={2} sx={{ p: 0.5 }}>
        <Tooltip title="Fit all devices">
          <IconButton size="small" onClick={onFitBounds}>
            <MyLocation />
          </IconButton>
        </Tooltip>
      </Paper>
    </Box>
  );
};

// Map center control component
const MapCenterControl: React.FC<{ devices: Device[] }> = ({ devices }) => {
  const map = useMap();

  const fitBounds = useCallback(() => {
    const devicesWithLocation = devices.filter(d => d.location?.latitude && d.location?.longitude);
    if (devicesWithLocation.length > 0) {
      const bounds = L.latLngBounds(
        devicesWithLocation.map(d => [d.location!.latitude, d.location!.longitude])
      );
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [devices, map]);

  React.useEffect(() => {
    fitBounds();
  }, [fitBounds]);

  return null;
};

const MapViewPage: React.FC = () => {
  const { hasPermission } = useAuthContext();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [mapRef, setMapRef] = useState<L.Map | null>(null);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'ALL'>('ALL');
  const [showOfflineDevices, setShowOfflineDevices] = useState(true);
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const response = await apiService.getDevices({ limit: 1000 });
      
      let devicesList: any[] = [];
      if (Array.isArray(response)) {
        devicesList = response;
      } else if (response.data && Array.isArray(response.data)) {
        devicesList = response.data;
      } else if (response.devices && Array.isArray(response.devices)) {
        devicesList = response.devices;
      }

      const mappedDevices: Device[] = devicesList.map((device: any) => ({
        id: device.id || 'unknown',
        deviceId: device.deviceId || device.id || 'unknown',
        manufacturer: device.manufacturer || 'Unknown',
        model: device.model || 'Unknown Model',
        androidVersion: device.androidVersion || device.osVersion || 'Unknown',
        sdkVersion: device.sdkVersion || 0,
        fingerprint: device.fingerprint || '',
        status: (device.status as DeviceStatus) || 'INACTIVE',
        enrolledAt: device.enrolledAt || device.createdAt || new Date().toISOString(),
        lastSeen: device.lastSeen || new Date().toISOString(),
        location: device.location,
        assignedTo: device.assignedTo,
        policies: device.policies || [],
        commands: device.commands || [],
        createdAt: device.createdAt || new Date().toISOString(),
        updatedAt: device.updatedAt || new Date().toISOString(),
        batteryLevel: device.batteryLevel || 0,
        isCharging: device.isCharging || false,
        totalStorage: device.totalStorage,
        availableStorage: device.availableStorage,
        totalRAM: device.totalRAM,
        availableRAM: device.availableRAM,
        networkInfo: device.networkInfo,
        appUsageStats: device.appUsageStats,
        systemHealth: device.systemHealth,
      }));
      
      setDevices(mappedDevices);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  // Filter devices based on status and location
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      // Status filter
      if (statusFilter !== 'ALL' && device.status !== statusFilter) {
        return false;
      }
      
      // Location filter - only show devices with location data unless showing offline
      if (!showOfflineDevices && (!device.location?.latitude || !device.location?.longitude)) {
        return false;
      }
      
      return true;
    });
  }, [devices, statusFilter, showOfflineDevices]);

  // Devices with location for map display
  const devicesWithLocation = useMemo(() => {
    return filteredDevices.filter(device => 
      device.location?.latitude && device.location?.longitude
    );
  }, [filteredDevices]);

  // Calculate map center
  const mapCenter = useMemo(() => {
    if (devicesWithLocation.length === 0) {
      return [0.3476, 32.5825]; // Uganda center as default
    }
    
    const avgLat = devicesWithLocation.reduce((sum, device) => 
      sum + device.location!.latitude, 0) / devicesWithLocation.length;
    const avgLng = devicesWithLocation.reduce((sum, device) => 
      sum + device.location!.longitude, 0) / devicesWithLocation.length;
    
    return [avgLat, avgLng];
  }, [devicesWithLocation]);

  const handleDeviceSelect = (device: Device) => {
    setSelectedDevice(device);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedDevice(null);
  };

  const getStatusColor = (status: DeviceStatus) => {
    switch (status) {
      case 'ENROLLED':
      case 'ACTIVE':
        return 'success';
      case 'INACTIVE':
        return 'default';
      case 'SUSPENDED':
        return 'warning';
      case 'WIPED':
        return 'error';
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

  const tileLayerUrl = mapLayer === 'satellite' 
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const tileLayerAttribution = mapLayer === 'satellite'
    ? '&copy; <a href="https://www.esri.com/">Esri</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  if (!hasPermission('devices', 'view')) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          You don&apos;t have permission to view device locations.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      {/* Header */}
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
          Device Map View
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Visualize device locations and monitor their status on an interactive map
        </Typography>

        {/* Controls */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => setStatusFilter(e.target.value as DeviceStatus | 'ALL')}
            >
              <MenuItem value="ALL">All Status</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="INACTIVE">Inactive</MenuItem>
              <MenuItem value="SUSPENDED">Suspended</MenuItem>
              <MenuItem value="WIPED">Wiped</MenuItem>
            </Select>
          </FormControl>

          <ToggleButtonGroup
            value={mapLayer}
            exclusive
            onChange={(_, value) => value && setMapLayer(value)}
            size="small"
          >
            <ToggleButton value="streets">
              <Layers sx={{ mr: 1 }} />
              Streets
            </ToggleButton>
            <ToggleButton value="satellite">
              <Layers sx={{ mr: 1 }} />
              Satellite
            </ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup
            value={showOfflineDevices}
            exclusive
            onChange={(_, value) => setShowOfflineDevices(value)}
            size="small"
          >
            <ToggleButton value={true}>
              <Visibility sx={{ mr: 1 }} />
              Show All
            </ToggleButton>
            <ToggleButton value={false}>
              <VisibilityOff sx={{ mr: 1 }} />
              Located Only
            </ToggleButton>
          </ToggleButtonGroup>

          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={fetchDevices}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Statistics */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Chip 
          label={`${devices.length} Total Devices`} 
          color="primary" 
          variant="outlined" 
        />
        <Chip 
          label={`${devicesWithLocation.length} Located`} 
          color="success" 
          variant="outlined" 
        />
        <Chip 
          label={`${devices.filter(d => d.status === 'ACTIVE').length} Active`} 
          color="success" 
          variant="outlined" 
        />
        <Chip 
          label={`${devices.filter(d => !d.location?.latitude).length} Unknown Location`} 
          color="warning" 
          variant="outlined" 
        />
      </Box>

      <Grid container spacing={3}>
        {/* Map */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent sx={{ p: 0, position: 'relative', height: 600 }}>
              {loading ? (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  height: '100%'
                }}>
                  <CircularProgress />
                </Box>
              ) : (
                <>
                  <MapContainer
                    center={mapCenter as [number, number]}
                    zoom={devicesWithLocation.length > 0 ? 10 : 6}
                    style={{ height: '100%', width: '100%' }}
                    ref={setMapRef}
                  >
                    <TileLayer
                      url={tileLayerUrl}
                      attribution={tileLayerAttribution}
                    />
                    
                    <MapCenterControl devices={devicesWithLocation} />
                    
                    {devicesWithLocation.map((device) => (
                      <Marker
                        key={device.id}
                        position={[device.location!.latitude, device.location!.longitude]}
                        icon={createCustomIcon(device.status, device.batteryLevel || 0)}
                        eventHandlers={{
                          click: () => handleDeviceSelect(device),
                        }}
                      >
                        <Popup>
                          <Box sx={{ minWidth: 200 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                              {device.deviceId}
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption">Status:</Typography>
                                <Chip 
                                  label={device.status} 
                                  color={getStatusColor(device.status) as any}
                                  size="small"
                                />
                              </Box>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption">Battery:</Typography>
                                <Typography variant="caption">{device.batteryLevel}%</Typography>
                              </Box>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption">Last Seen:</Typography>
                                <Typography variant="caption">{formatLastSeen(device.lastSeen)}</Typography>
                              </Box>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                onClick={() => handleDeviceSelect(device)}
                                sx={{ mt: 1 }}
                              >
                                View Details
                              </Button>
                            </Box>
                          </Box>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                  
                  <MapControls 
                    onZoomIn={() => mapRef?.zoomIn()}
                    onZoomOut={() => mapRef?.zoomOut()}
                    onFitBounds={() => {
                      if (mapRef && devicesWithLocation.length > 0) {
                        const bounds = L.latLngBounds(
                          devicesWithLocation.map(d => [d.location!.latitude, d.location!.longitude])
                        );
                        mapRef.fitBounds(bounds, { padding: [20, 20] });
                      }
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Device List */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <FilterList sx={{ mr: 1 }} />
                Filtered Devices ({filteredDevices.length})
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              {filteredDevices.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No devices match the current filters
                </Typography>
              ) : (
                <List sx={{ maxHeight: 500, overflow: 'auto' }}>
                  {filteredDevices.map((device, index) => (
                    <React.Fragment key={device.id}>
                      <ListItem 
                        button 
                        onClick={() => handleDeviceSelect(device)}
                        sx={{ px: 1, borderRadius: 1 }}
                      >
                        <ListItemAvatar>
                          <Avatar sx={{ 
                            bgcolor: device.location?.latitude ? 'primary.main' : 'grey.400',
                            width: 32, 
                            height: 32 
                          }}>
                            {device.location?.latitude ? <LocationOn fontSize="small" /> : <Smartphone fontSize="small" />}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {device.deviceId}
                            </Typography>
                          }
                          secondary={
                            <Box>
                              <Typography variant="caption" display="block">
                                {device.manufacturer} • {device.batteryLevel}%
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                <Chip 
                                  label={device.status} 
                                  color={getStatusColor(device.status) as any}
                                  size="small"
                                  sx={{ height: 18, fontSize: '0.6rem' }}
                                />
                                {!device.location?.latitude && (
                                  <Chip 
                                    label="No Location" 
                                    color="warning"
                                    size="small"
                                    sx={{ height: 18, fontSize: '0.6rem' }}
                                  />
                                )}
                              </Box>
                            </Box>
                          }
                        />
                      </ListItem>
                      {index < filteredDevices.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Device Details Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Device Details</DialogTitle>
        <DialogContent>
          {selectedDevice && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Device ID"
                  value={selectedDevice.deviceId}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Status"
                  value={selectedDevice.status}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Manufacturer"
                  value={selectedDevice.manufacturer}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Model"
                  value={selectedDevice.model}
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
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Seen"
                  value={formatLastSeen(selectedDevice.lastSeen)}
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              {selectedDevice.location?.latitude && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Latitude"
                      value={selectedDevice.location.latitude.toFixed(6)}
                      InputProps={{ readOnly: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Longitude"
                      value={selectedDevice.location.longitude.toFixed(6)}
                      InputProps={{ readOnly: true }}
                    />
                  </Grid>
                </>
              )}
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
    </Box>
  );
};

export default MapViewPage;