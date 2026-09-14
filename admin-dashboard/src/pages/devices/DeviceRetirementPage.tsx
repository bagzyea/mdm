import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Autocomplete,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Stack,
  FormControlLabel,
  Checkbox,
  
  
  Chip
} from '@mui/material';
import {
  Delete as RetireIcon,
  Security as DataWipeIcon,
  Assignment as DocumentIcon,
  Warning as WarningIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import LoadingSpinner from '../../components/common/LoadingSpinner';
interface DeviceRetirement {
  id: string;
  deviceId: string;
  retirementReason: string;
  retirementType: string;
  dataWipeRequired: boolean;
  dataWipeCompleted: boolean;
  dataWipeCompletedAt?: string;
  physicalReturn: boolean;
  physicalReturnCompleted: boolean;
  physicalReturnDate?: string;
  disposalMethod?: string;
  disposalDate?: string;
  certificateOfDestruction?: string;
  retiredBy: string;
  approvedBy?: string;
  status: string;
  notes?: string;
  createdAt: string;
  device: {
    deviceId: string;
    name?: string;
    model?: string;
    manufacturer?: string;
    assignedUserEmail?: string;
  };
}
const DeviceRetirementPage: React.FC = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [statusFilter, setStatusFilter] = useState('');
  const [retirementDialogOpen, setRetirementDialogOpen] = useState(false);
  const [statusUpdateDialogOpen, setStatusUpdateDialogOpen] = useState(false);
  const [selectedRetirement, setSelectedRetirement] = useState<DeviceRetirement | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Form state for new retirement
  const [retirementForm, setRetirementForm] = useState({
    deviceId: '',
    retirementReason: '',
    retirementType: 'STANDARD',
    dataWipeRequired: true,
    physicalReturn: false,
    notes: ''
  });

  // Form state for status update
  const [statusUpdateForm, setStatusUpdateForm] = useState({
    status: '',
    notes: '',
    dataWipeCompleted: false,
    physicalReturnCompleted: false
  });

  // Fetch retirements
  const { data: retirementsData, isLoading } = useQuery({
    queryKey: ['device-retirements', page, rowsPerPage, statusFilter],
    queryFn: () => apiService.get('/lifecycle/retirements', {
      params: {
        page: page + 1,
        limit: rowsPerPage,
        ...(statusFilter && { status: statusFilter })
      }
    }).then(res => res.data),
    placeholderData: (previousData: unknown) => previousData
  });

  // Fetch devices for retirement selection
  const { data: devices } = useQuery({
    queryKey: ['devices-for-retirement'],
    queryFn: () => apiService.get('/devices', {
      params: { limit: 1000, isRetired: false }
    }).then(res => res.data.data)
  });

  // Initiate retirement mutation
  const initiateRetirementMutation = useMutation({
    mutationFn: (retirementData: any) => apiService.post('/lifecycle/retirements', retirementData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-retirements'] });
      queryClient.invalidateQueries({ queryKey: ['devices-for-retirement'] });
      setRetirementDialogOpen(false);
      resetRetirementForm();
      setError(null);
    },
    onError: (error: any) => {
      setError(error.response?.data?.error || 'Failed to initiate retirement');
    }
  });

  // Update retirement status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ retirementId, updateData }: { retirementId: string; updateData: any }) =>
      apiService.put(`/lifecycle/retirements/${retirementId}`, updateData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-retirements'] });
      setStatusUpdateDialogOpen(false);
      setSelectedRetirement(null);
      setError(null);
    },
    onError: (error: any) => {
      setError(error.response?.data?.error || 'Failed to update status');
    }
  });
  const resetRetirementForm = () => {
    setRetirementForm({
      deviceId: '',
      retirementReason: '',
      retirementType: 'STANDARD',
      dataWipeRequired: true,
      physicalReturn: false,
      notes: ''
    });
    setSelectedDevice(null);
  };
  const handleInitiateRetirement = () => {
    if (!selectedDevice) {
      setError('Please select a device');
      return;
    }
    const retirementData = {
      deviceId: selectedDevice.deviceId,
      retirementReason: retirementForm.retirementReason,
      retirementType: retirementForm.retirementType,
      dataWipeRequired: retirementForm.dataWipeRequired,
      physicalReturn: retirementForm.physicalReturn,
      notes: retirementForm.notes
    };
    initiateRetirementMutation.mutate(retirementData);
  };
  const handleStatusUpdate = () => {
    if (!selectedRetirement) return;
    updateStatusMutation.mutate({
      retirementId: selectedRetirement.id,
      updateData: statusUpdateForm
    });
  };
  if (isLoading) return <LoadingSpinner message="Loading device retirements..." />;
  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Device Retirement Management"
        subtitle="Manage device retirement workflow and data security"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setRetirementDialogOpen(true)}
          >
            Retire Device
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Filter by Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="Filter by Status"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="INITIATED">Initiated</MenuItem>
                  <MenuItem value="APPROVED">Approved</MenuItem>
                  <MenuItem value="DATA_WIPE_PENDING">Data Wipe Pending</MenuItem>
                  <MenuItem value="DATA_WIPED">Data Wiped</MenuItem>
                  <MenuItem value="PHYSICAL_RETURN_PENDING">Physical Return Pending</MenuItem>
                  <MenuItem value="PHYSICAL_RETURNED">Physical Returned</MenuItem>
                  <MenuItem value="DISPOSED">Disposed</MenuItem>
                  <MenuItem value="COMPLETED">Completed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Retirements Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Device</TableCell>
                <TableCell>Assigned User</TableCell>
                <TableCell>Retirement Type</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Initiated</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {retirementsData?.data?.map((retirement: DeviceRetirement) => (
                <TableRow key={retirement.id} hover>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {retirement.device.name || retirement.device.deviceId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {retirement.device.manufacturer} {retirement.device.model}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {retirement.device.assignedUserEmail || 'Unassigned'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={retirement.retirementType}
                      size="small"
                      color={retirement.retirementType === 'EMERGENCY' ? 'error' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap title={retirement.retirementReason}>
                      {retirement.retirementReason}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={retirement.status} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {retirement.dataWipeRequired && (
                        <Tooltip title={retirement.dataWipeCompleted ? 'Data Wiped' : 'Data Wipe Required'}>
                          <DataWipeIcon
                            fontSize="small"
                            color={retirement.dataWipeCompleted ? 'success' : 'warning'}
                          />
                        </Tooltip>
                      )}
                      {retirement.physicalReturn && (
                        <Tooltip title={retirement.physicalReturnCompleted ? 'Physical Returned' : 'Physical Return Required'}>
                          <DocumentIcon
                            fontSize="small"
                            color={retirement.physicalReturnCompleted ? 'success' : 'warning'}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(retirement.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Tooltip title="Update Status">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedRetirement(retirement);
                            setStatusUpdateForm({
                              status: retirement.status,
                              notes: retirement.notes || '',
                              dataWipeCompleted: retirement.dataWipeCompleted,
                              physicalReturnCompleted: retirement.physicalReturnCompleted
                            });
                            setStatusUpdateDialogOpen(true);
                          }}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="View Details">
                        <IconButton size="small">
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={retirementsData?.pagination?.total || 0}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Initiate Retirement Dialog */}
      <Dialog
        open={retirementDialogOpen}
        onClose={() => setRetirementDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RetireIcon />
            Initiate Device Retirement
          </Box>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <Autocomplete
                options={devices || []}
                getOptionLabel={(option) => 
                  `${option.name || option.deviceId} (${option.manufacturer} ${option.model})`
                }
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box>
                      <Typography variant="body2">
                        {option.name || option.deviceId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.manufacturer} {option.model} • 
                        Assigned to: {option.assignedUserEmail || 'Unassigned'}
                      </Typography>
                    </Box>
                  </Box>
                )}
                value={selectedDevice}
                onChange={(_, newValue) => setSelectedDevice(newValue)}
                renderInput={(params) => (
                  <TextField
                    // MUI types these params with explicitly-optional properties, which
                    // exactOptionalPropertyTypes refuses to spread onto TextField. The
                    // values themselves come straight from Autocomplete.
                    {...(params as React.ComponentProps<typeof TextField>)}
                    label="Select Device to Retire"
                    required
                    fullWidth
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth required>
                <InputLabel>Retirement Type</InputLabel>
                <Select
                  value={retirementForm.retirementType}
                  onChange={(e) => setRetirementForm(prev => ({ ...prev, retirementType: e.target.value }))}
                  label="Retirement Type"
                >
                  <MenuItem value="STANDARD">Standard</MenuItem>
                  <MenuItem value="EMERGENCY">Emergency</MenuItem>
                  <MenuItem value="END_OF_LIFE">End of Life</MenuItem>
                  <MenuItem value="DAMAGED">Damaged</MenuItem>
                  <MenuItem value="LOST_STOLEN">Lost/Stolen</MenuItem>
                  <MenuItem value="UPGRADE">Upgrade</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={retirementForm.dataWipeRequired}
                      onChange={(e) => setRetirementForm(prev => ({ ...prev, dataWipeRequired: e.target.checked }))}
                    />
                  }
                  label="Data Wipe Required"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={retirementForm.physicalReturn}
                      onChange={(e) => setRetirementForm(prev => ({ ...prev, physicalReturn: e.target.checked }))}
                    />
                  }
                  label="Physical Return Required"
                />
              </Box>
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Retirement Reason"
                value={retirementForm.retirementReason}
                onChange={(e) => setRetirementForm(prev => ({ ...prev, retirementReason: e.target.value }))}
                fullWidth
                required
                multiline
                rows={3}
                placeholder="Provide a detailed reason for retirement..."
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Additional Notes"
                value={retirementForm.notes}
                onChange={(e) => setRetirementForm(prev => ({ ...prev, notes: e.target.value }))}
                fullWidth
                multiline
                rows={2}
                placeholder="Any additional notes or instructions..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRetirementDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleInitiateRetirement}
            disabled={initiateRetirementMutation.isLoading}
            startIcon={<WarningIcon />}
          >
            {initiateRetirementMutation.isLoading ? 'Initiating...' : 'Initiate Retirement'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Status Update Dialog */}
      <Dialog
        open={statusUpdateDialogOpen}
        onClose={() => setStatusUpdateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Update Retirement Status</DialogTitle>
        <DialogContent>
          {selectedRetirement && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                {selectedRetirement.device.name || selectedRetirement.device.deviceId}
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={statusUpdateForm.status}
                      onChange={(e) => setStatusUpdateForm(prev => ({ ...prev, status: e.target.value }))}
                      label="Status"
                    >
                      <MenuItem value="INITIATED">Initiated</MenuItem>
                      <MenuItem value="APPROVED">Approved</MenuItem>
                      <MenuItem value="DATA_WIPE_PENDING">Data Wipe Pending</MenuItem>
                      <MenuItem value="DATA_WIPED">Data Wiped</MenuItem>
                      <MenuItem value="PHYSICAL_RETURN_PENDING">Physical Return Pending</MenuItem>
                      <MenuItem value="PHYSICAL_RETURNED">Physical Returned</MenuItem>
                      <MenuItem value="DISPOSED">Disposed</MenuItem>
                      <MenuItem value="COMPLETED">Completed</MenuItem>
                      <MenuItem value="CANCELLED">Cancelled</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {selectedRetirement.dataWipeRequired && (
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={statusUpdateForm.dataWipeCompleted}
                          onChange={(e) => setStatusUpdateForm(prev => ({ ...prev, dataWipeCompleted: e.target.checked }))}
                        />
                      }
                      label="Data Wipe Completed"
                    />
                  </Grid>
                )}

                {selectedRetirement.physicalReturn && (
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={statusUpdateForm.physicalReturnCompleted}
                          onChange={(e) => setStatusUpdateForm(prev => ({ ...prev, physicalReturnCompleted: e.target.checked }))}
                        />
                      }
                      label="Physical Return Completed"
                    />
                  </Grid>
                )}

                <Grid item xs={12}>
                  <TextField
                    label="Update Notes"
                    value={statusUpdateForm.notes}
                    onChange={(e) => setStatusUpdateForm(prev => ({ ...prev, notes: e.target.value }))}
                    fullWidth
                    multiline
                    rows={3}
                    placeholder="Add notes about this status update..."
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusUpdateDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleStatusUpdate}
            disabled={updateStatusMutation.isLoading}
          >
            {updateStatusMutation.isLoading ? 'Updating...' : 'Update Status'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default DeviceRetirementPage;