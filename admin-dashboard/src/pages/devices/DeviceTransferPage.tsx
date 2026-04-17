import React, { useState, useEffect } from 'react';
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
  Chip,
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
  Divider
} from '@mui/material';
import {
  SwapHoriz as TransferIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  History as HistoryIcon,
  Person as PersonIcon,
  Business as DepartmentIcon,
  Add as AddIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import LoadingSpinner from '../../components/common/LoadingSpinner';

interface DeviceTransfer {
  id: string;
  deviceId: string;
  fromUserEmail?: string;
  fromUserName?: string;
  fromDepartmentName?: string;
  toUserEmail?: string;
  toUserName?: string;
  toDepartmentName?: string;
  transferReason?: string;
  transferNotes?: string;
  requestedBy: string;
  approvedBy?: string;
  status: string;
  requestedAt: string;
  approvedAt?: string;
  completedAt?: string;
  device: {
    deviceId: string;
    name?: string;
    model?: string;
    manufacturer?: string;
  };
}

interface Department {
  id: string;
  name: string;
  code?: string;
  location?: string;
}

const DeviceTransferPage: React.FC = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [statusFilter, setStatusFilter] = useState('');
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<DeviceTransfer | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Form state for new transfer
  const [transferForm, setTransferForm] = useState({
    deviceId: '',
    toUserEmail: '',
    toUserName: '',
    toDepartmentId: '',
    transferReason: '',
    transferNotes: ''
  });

  // Fetch transfers
  const { data: transfersData, isLoading } = useQuery({
    queryKey: ['device-transfers', page, rowsPerPage, statusFilter],
    queryFn: () => apiService.get('/lifecycle/transfers', {
      params: {
        page: page + 1,
        limit: rowsPerPage,
        ...(statusFilter && { status: statusFilter })
      }
    }).then(res => res.data),
    placeholderData: (previousData) => previousData
  });

  // Fetch departments
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiService.get('/lifecycle/departments').then(res => res.data)
  });

  // Fetch devices for transfer selection
  const { data: devices } = useQuery({
    queryKey: ['devices-for-transfer'],
    queryFn: () => apiService.get('/devices', {
      params: { limit: 1000, status: 'ACTIVE' }
    }).then(res => res.data.data)
  });

  // Request transfer mutation
  const requestTransferMutation = useMutation({
    mutationFn: (transferData: any) => apiService.post('/lifecycle/transfers', transferData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-transfers'] });
      setTransferDialogOpen(false);
      resetTransferForm();
      setError(null);
    },
    onError: (error: any) => {
      setError(error.response?.data?.error || 'Failed to request transfer');
    }
  });

  // Approve transfer mutation
  const approveTransferMutation = useMutation({
    mutationFn: ({ transferId, approved, notes }: { transferId: string; approved: boolean; notes?: string }) =>
      apiService.put(`/lifecycle/transfers/${transferId}/approve`, { approved, approvalNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-transfers'] });
      setApprovalDialogOpen(false);
      setSelectedTransfer(null);
      setError(null);
    },
    onError: (error: any) => {
      setError(error.response?.data?.error || 'Failed to process approval');
    }
  });

  const resetTransferForm = () => {
    setTransferForm({
      deviceId: '',
      toUserEmail: '',
      toUserName: '',
      toDepartmentId: '',
      transferReason: '',
      transferNotes: ''
    });
    setSelectedDevice(null);
  };

  const handleRequestTransfer = () => {
    if (!selectedDevice) {
      setError('Please select a device');
      return;
    }

    const transferData = {
      deviceId: selectedDevice.deviceId,
      fromUserId: selectedDevice.assignedUserId,
      fromUserEmail: selectedDevice.assignedUserEmail,
      fromUserName: selectedDevice.assignedUserName,
      fromDepartmentId: selectedDevice.departmentId,
      fromDepartmentName: selectedDevice.departmentName,
      toUserEmail: transferForm.toUserEmail,
      toUserName: transferForm.toUserName,
      toDepartmentId: transferForm.toDepartmentId,
      toDepartmentName: departments?.find((d: Department) => d.id === transferForm.toDepartmentId)?.name,
      transferReason: transferForm.transferReason,
      transferNotes: transferForm.transferNotes
    };

    requestTransferMutation.mutate(transferData);
  };

  const handleApproval = (approved: boolean, notes?: string) => {
    if (!selectedTransfer) return;
    
    approveTransferMutation.mutate({
      transferId: selectedTransfer.id,
      approved,
      notes
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'warning';
      case 'APPROVED': return 'info';
      case 'IN_PROGRESS': return 'info';
      case 'COMPLETED': return 'success';
      case 'CANCELLED': return 'default';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  };

  if (isLoading) return <LoadingSpinner message="Loading device transfers..." />;

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Device Transfer Management"
        subtitle="Manage device transfers between users and departments"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setTransferDialogOpen(true)}
          >
            Request Transfer
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
                  <MenuItem value="PENDING">Pending</MenuItem>
                  <MenuItem value="APPROVED">Approved</MenuItem>
                  <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                  <MenuItem value="COMPLETED">Completed</MenuItem>
                  <MenuItem value="CANCELLED">Cancelled</MenuItem>
                  <MenuItem value="REJECTED">Rejected</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Transfers Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Device</TableCell>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Requested</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transfersData?.data?.map((transfer: DeviceTransfer) => (
                <TableRow key={transfer.id} hover>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {transfer.device.name || transfer.device.deviceId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {transfer.device.manufacturer} {transfer.device.model}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PersonIcon fontSize="small" color="action" />
                      <Box>
                        <Typography variant="body2">
                          {transfer.fromUserName || transfer.fromUserEmail || 'Unassigned'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {transfer.fromDepartmentName}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PersonIcon fontSize="small" color="action" />
                      <Box>
                        <Typography variant="body2">
                          {transfer.toUserName || transfer.toUserEmail}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {transfer.toDepartmentName}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap title={transfer.transferReason}>
                      {transfer.transferReason || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusChip
                      status={transfer.status}
                      color={getStatusColor(transfer.status)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(transfer.requestedAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      {transfer.status === 'PENDING' && (
                        <>
                          <Tooltip title="Approve Transfer">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => {
                                setSelectedTransfer(transfer);
                                setApprovalDialogOpen(true);
                              }}
                            >
                              <ApproveIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Reject Transfer">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleApproval(false)}
                            >
                              <RejectIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip title="View History">
                        <IconButton size="small">
                          <HistoryIcon />
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
          count={transfersData?.pagination?.total || 0}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Request Transfer Dialog */}
      <Dialog
        open={transferDialogOpen}
        onClose={() => setTransferDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TransferIcon />
            Request Device Transfer
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
                    {...params}
                    label="Select Device"
                    required
                    fullWidth
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />
                    }}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="To User Email"
                value={transferForm.toUserEmail}
                onChange={(e) => setTransferForm(prev => ({ ...prev, toUserEmail: e.target.value }))}
                fullWidth
                required
                InputProps={{
                  startAdornment: <PersonIcon color="action" sx={{ mr: 1 }} />
                }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="To User Name"
                value={transferForm.toUserName}
                onChange={(e) => setTransferForm(prev => ({ ...prev, toUserName: e.target.value }))}
                fullWidth
              />
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>To Department</InputLabel>
                <Select
                  value={transferForm.toDepartmentId}
                  onChange={(e) => setTransferForm(prev => ({ ...prev, toDepartmentId: e.target.value }))}
                  label="To Department"
                  startAdornment={<DepartmentIcon color="action" sx={{ mr: 1 }} />}
                >
                  {departments?.map((dept: Department) => (
                    <MenuItem key={dept.id} value={dept.id}>
                      {dept.name} {dept.code && `(${dept.code})`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Transfer Reason"
                value={transferForm.transferReason}
                onChange={(e) => setTransferForm(prev => ({ ...prev, transferReason: e.target.value }))}
                fullWidth
                required
                multiline
                rows={2}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Additional Notes"
                value={transferForm.transferNotes}
                onChange={(e) => setTransferForm(prev => ({ ...prev, transferNotes: e.target.value }))}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRequestTransfer}
            disabled={requestTransferMutation.isLoading}
          >
            {requestTransferMutation.isLoading ? 'Requesting...' : 'Request Transfer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog
        open={approvalDialogOpen}
        onClose={() => setApprovalDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Approve Device Transfer</DialogTitle>
        <DialogContent>
          {selectedTransfer && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                Transfer Details
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Device:</Typography>
                  <Typography variant="body1">
                    {selectedTransfer.device.name || selectedTransfer.device.deviceId}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">From:</Typography>
                  <Typography variant="body1">
                    {selectedTransfer.fromUserEmail || 'Unassigned'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">To:</Typography>
                  <Typography variant="body1">
                    {selectedTransfer.toUserEmail}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Reason:</Typography>
                  <Typography variant="body1">
                    {selectedTransfer.transferReason}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            color="error"
            onClick={() => handleApproval(false)}
            disabled={approveTransferMutation.isLoading}
          >
            Reject
          </Button>
          <Button onClick={() => setApprovalDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={() => handleApproval(true)}
            disabled={approveTransferMutation.isLoading}
          >
            Approve
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeviceTransferPage;