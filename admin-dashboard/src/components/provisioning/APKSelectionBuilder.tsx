import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Checkbox,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  LinearProgress,
  Avatar
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  Apps as AppsIcon,
  Folder as FolderIcon
} from '@mui/icons-material';

interface APK {
  id: string;
  packageName: string;
  appName: string;
  displayName: string;
  description?: string;
  category: string;
  version: string;
  fileSize: number;
  icon?: string;
  permissions: string[];
  supportedDeviceModels: string[];
  dataFolders: DataFolder[];
}

interface DataFolder {
  id: string;
  name: string;
  description?: string;
  folderType: string;
  size: number;
  fileCount?: number;
  isRequired: boolean;
  geographicScope?: string;
  applicableDistricts: string[];
}

interface SelectedAPK {
  apkId: string;
  apk: APK;
  selectedDataFolders: string[];
  installOrder: number;
  isRequired: boolean;
  customConfiguration?: any;
}

interface APKSelectionBuilderProps {
  deviceModels: string[];
  deviceLocation?: {
    district: string;
    region: string;
  };
  onSelectionChange: (selectedAPKs: SelectedAPK[]) => void;
  initialSelection?: SelectedAPK[];
}

export const APKSelectionBuilder: React.FC<APKSelectionBuilderProps> = ({
  deviceModels,
  deviceLocation,
  onSelectionChange,
  initialSelection = []
}) => {
  const [availableAPKs, setAvailableAPKs] = useState<APK[]>([]);
  const [selectedAPKs, setSelectedAPKs] = useState<SelectedAPK[]>(initialSelection);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [detailsDialog, setDetailsDialog] = useState<{
    open: boolean;
    apk?: APK;
    selectedFolders?: string[];
  }>({ open: false });

  // Categories for filtering
  const categories = [
    'ALL', 'CENSUS', 'PRODUCTIVITY', 'UTILITY', 'COMMUNICATION', 
    'MEDIA', 'EDUCATION', 'GOVERNMENT', 'CUSTOM'
  ];

  useEffect(() => {
    fetchCompatibleAPKs();
  }, [deviceModels]);

  useEffect(() => {
    onSelectionChange(selectedAPKs);
  }, [selectedAPKs, onSelectionChange]);

  const fetchCompatibleAPKs = async () => {
    try {
      setLoading(true);
      // Replace with actual API call
      const response = await fetch(`/api/apk-registry/compatible?deviceModels=${deviceModels.join(',')}`);
      const data = await response.json();
      setAvailableAPKs(data.apks || []);
    } catch (err) {
      setError('Failed to fetch compatible APKs');
    } finally {
      setLoading(false);
    }
  };

  const handleAPKSelection = (apk: APK) => {
    const isSelected = selectedAPKs.some(selected => selected.apkId === apk.id);
    
    if (isSelected) {
      // Remove APK
      setSelectedAPKs(prev => prev.filter(selected => selected.apkId !== apk.id));
    } else {
      // Show details dialog for data folder selection
      const requiredFolders = apk.dataFolders.filter(folder => 
        folder.isRequired && 
        isDataFolderCompatible(folder, deviceLocation)
      );
      
      setDetailsDialog({
        open: true,
        apk,
        selectedFolders: requiredFolders.map(f => f.id)
      });
    }
  };

  const handleDataFolderSelection = (apk: APK, selectedFolders: string[]) => {
    const newAPKSelection: SelectedAPK = {
      apkId: apk.id,
      apk,
      selectedDataFolders: selectedFolders,
      installOrder: selectedAPKs.length + 1,
      isRequired: true,
      customConfiguration: {}
    };

    setSelectedAPKs(prev => [...prev, newAPKSelection]);
    setDetailsDialog({ open: false });
  };

  const handleEditSelection = (apkId: string) => {
    const selected = selectedAPKs.find(s => s.apkId === apkId);
    if (selected) {
      setDetailsDialog({
        open: true,
        apk: selected.apk,
        selectedFolders: selected.selectedDataFolders
      });
    }
  };

  const handleRemoveSelection = (apkId: string) => {
    setSelectedAPKs(prev => prev.filter(s => s.apkId !== apkId));
  };

  const isDataFolderCompatible = (folder: DataFolder, location?: { district: string; region: string }): boolean => {
    if (!folder.geographicScope || folder.geographicScope === 'ALL') {
      return true;
    }

    if (!location) {
      return false;
    }

    if (folder.geographicScope === 'DISTRICT_SPECIFIC') {
      return folder.applicableDistricts.includes(location.district);
    }

    if (folder.geographicScope === 'REGION_SPECIFIC') {
      return folder.applicableDistricts.includes(location.region);
    }

    return true;
  };

  const calculateTotalSize = (): number => {
    return selectedAPKs.reduce((total, selected) => {
      const apkSize = selected.apk.fileSize;
      const dataSize = selected.selectedDataFolders.reduce((dataTotal, folderId) => {
        const folder = selected.apk.dataFolders.find(f => f.id === folderId);
        return dataTotal + (folder?.size || 0);
      }, 0);
      return total + apkSize + dataSize;
    }, 0);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredAPKs = availableAPKs.filter(apk => {
    const matchesSearch = apk.appName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         apk.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         apk.packageName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'ALL' || apk.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" gap={2}>
            <LinearProgress sx={{ flexGrow: 1 }} />
            <Typography>Loading compatible APKs...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                APK Selection & Configuration
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Select APKs and their associated data folders for provisioning
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              {/* Upload functionality would go here */}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {/* Available APKs */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Available Applications ({filteredAPKs.length})
              </Typography>
              
              {/* Filters */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Search APKs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      label="Category"
                    >
                      {categories.map(category => (
                        <MenuItem key={category} value={category}>
                          {category}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {/* APK List */}
              <List>
                {filteredAPKs.map(apk => {
                  const isSelected = selectedAPKs.some(selected => selected.apkId === apk.id);
                  const compatibleFolders = apk.dataFolders.filter(folder =>
                    isDataFolderCompatible(folder, deviceLocation)
                  );
                  
                  return (
                    <ListItem key={apk.id} divider>
                      <ListItemIcon>
                        <Avatar sx={{ bgcolor: 'primary.main' }}>
                          <AppsIcon />
                        </Avatar>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="subtitle1">
                              {apk.displayName}
                            </Typography>
                            <Chip
                              label={apk.category}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                            {compatibleFolders.length > 0 && (
                              <Chip
                                label={`${compatibleFolders.length} folders`}
                                size="small"
                                color="secondary"
                                variant="outlined"
                                icon={<FolderIcon />}
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              {apk.packageName} • v{apk.version} • {formatFileSize(apk.fileSize)}
                            </Typography>
                            {apk.description && (
                              <Typography variant="body2" color="text.secondary">
                                {apk.description}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Button
                          variant={isSelected ? "contained" : "outlined"}
                          color={isSelected ? "secondary" : "primary"}
                          onClick={() => handleAPKSelection(apk)}
                        >
                          {isSelected ? "Selected" : "Select"}
                        </Button>
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Selected APKs */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Selected for Installation ({selectedAPKs.length})
              </Typography>
              
              {/* Summary */}
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  Total Size: {formatFileSize(calculateTotalSize())}
                </Typography>
                <Typography variant="body2">
                  Installation Order: Drag to reorder
                </Typography>
              </Alert>

              {selectedAPKs.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                  No APKs selected. Choose from the available applications.
                </Typography>
              ) : (
                <List>
                  {selectedAPKs.map((selected, _index) => (
                    <ListItem key={selected.apkId} divider>
                      <ListItemIcon>
                        <Typography variant="caption" color="primary">
                          {selected.installOrder}
                        </Typography>
                      </ListItemIcon>
                      <ListItemText
                        primary={selected.apk.displayName}
                        secondary={
                          <Box>
                            <Typography variant="caption">
                              {selected.selectedDataFolders.length} data folders
                            </Typography>
                            <br />
                            <Typography variant="caption">
                              {formatFileSize(
                                selected.apk.fileSize +
                                selected.selectedDataFolders.reduce((sum, folderId) => {
                                  const folder = selected.apk.dataFolders.find(f => f.id === folderId);
                                  return sum + (folder?.size || 0);
                                }, 0)
                              )}
                            </Typography>
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Box display="flex" gap={0.5}>
                          <IconButton
                            size="small"
                            onClick={() => handleEditSelection(selected.apkId)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveSelection(selected.apkId)}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Data Folder Selection Dialog */}
      <Dialog
        open={detailsDialog.open}
        onClose={() => setDetailsDialog({ open: false })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Configure: {detailsDialog.apk?.displayName}
        </DialogTitle>
        <DialogContent>
          {detailsDialog.apk && (
            <DataFolderSelector
              apk={detailsDialog.apk}
              deviceLocation={deviceLocation}
              initialSelection={detailsDialog.selectedFolders || []}
              onSelectionChange={(folders) => 
                setDetailsDialog(prev => ({ ...prev, selectedFolders: folders }))
              }
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialog({ open: false })}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (detailsDialog.apk && detailsDialog.selectedFolders) {
                handleDataFolderSelection(detailsDialog.apk, detailsDialog.selectedFolders);
              }
            }}
            variant="contained"
          >
            Add to Selection
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// Data Folder Selector Component
const DataFolderSelector: React.FC<{
  apk: APK;
  deviceLocation?: { district: string; region: string };
  initialSelection: string[];
  onSelectionChange: (folders: string[]) => void;
}> = ({ apk, deviceLocation, initialSelection, onSelectionChange }) => {
  const [selectedFolders, setSelectedFolders] = useState<string[]>(initialSelection);

  const handleFolderToggle = (folderId: string) => {
    const newSelection = selectedFolders.includes(folderId)
      ? selectedFolders.filter(id => id !== folderId)
      : [...selectedFolders, folderId];
    
    setSelectedFolders(newSelection);
    onSelectionChange(newSelection);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Group folders by type
  const groupedFolders = apk.dataFolders.reduce((acc, folder) => {
    if (!acc[folder.folderType]) {
      acc[folder.folderType] = [];
    }
    acc[folder.folderType].push(folder);
    return acc;
  }, {} as Record<string, DataFolder[]>);

  return (
    <Box>
      <Typography variant="body1" gutterBottom>
        Select data folders to deploy with {apk.displayName}:
      </Typography>
      
      {Object.entries(groupedFolders).map(([folderType, folders]) => (
        <Accordion key={folderType} defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">
              {folderType} ({folders.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List dense>
              {folders.map(folder => (
                <ListItem key={folder.id}>
                  <ListItemIcon>
                    <Checkbox
                      checked={selectedFolders.includes(folder.id)}
                      onChange={() => handleFolderToggle(folder.id)}
                      disabled={folder.isRequired}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography>{folder.name}</Typography>
                        {folder.isRequired && (
                          <Chip
                            label="Required"
                            size="small"
                            color="error"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box>
                        {folder.description && (
                          <Typography variant="body2">
                            {folder.description}
                          </Typography>
                        )}
                        <Typography variant="caption">
                          Size: {formatFileSize(folder.size)}
                          {folder.fileCount && ` • ${folder.fileCount} files`}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default APKSelectionBuilder;