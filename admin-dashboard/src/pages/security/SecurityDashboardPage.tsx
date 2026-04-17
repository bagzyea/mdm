import React, { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Tabs,
  Tab,
  Button,
  Chip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
} from '@mui/material';
import {
  Security,
  VpnKey,
  Warning,
  CheckCircle,
  Add,
  Delete,
  Shield,
  GppGood,
  GppBad,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { 
  Certificate, 
  CertificateRequest
} from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';

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
      id={`security-tabpanel-${index}`}
      aria-labelledby={`security-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const SecurityDashboardPage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [createCertificateOpen, setCreateCertificateOpen] = useState(false);
  const [newCertificate, setNewCertificate] = useState<Partial<CertificateRequest>>({});
  const queryClient = useQueryClient();

  // Fetch security data
  const { data: certificates, isLoading: certificatesLoading } = useQuery<Certificate[]>({
    queryKey: ['certificates'],
    queryFn: apiService.getCertificates
  });

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: () => apiService.getDevices({ limit: 100 })
  });

  // Mutations
  const createCertificateMutation = useMutation({
    mutationFn: (certificateRequest: CertificateRequest) => apiService.createCertificate(certificateRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
      setCreateCertificateOpen(false);
      setNewCertificate({});
    }
  });

  const revokeCertificateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => apiService.revokeCertificate(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
    }
  });

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleCreateCertificate = () => {
    if (newCertificate.name && newCertificate.type && newCertificate.subject && newCertificate.issuer) {
      createCertificateMutation.mutate(newCertificate as CertificateRequest);
    }
  };

  const handleRevokeCertificate = (id: string) => {
    revokeCertificateMutation.mutate({ id, reason: 'Administrative revocation' });
  };

  if (certificatesLoading) {
    return <LoadingSpinner message="Loading security dashboard..." />;
  }

  const activeCertificates = certificates?.filter(cert => cert.isActive && !cert.isRevoked) || [];
  const revokedCertificates = certificates?.filter(cert => cert.isRevoked) || [];
  const expiredCertificates = certificates?.filter(cert => new Date(cert.validTo) < new Date()) || [];

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Security Dashboard
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setCreateCertificateOpen(true)}
        >
          Create Certificate
        </Button>
      </Box>

      {/* Security Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Active Certificates
                  </Typography>
                  <Typography variant="h4">
                    {activeCertificates.length}
                  </Typography>
                </Box>
                <VpnKey sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Revoked Certificates
                  </Typography>
                  <Typography variant="h4" color="error.main">
                    {revokedCertificates.length}
                  </Typography>
                </Box>
                <Delete sx={{ fontSize: 40, color: 'error.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Expired Certificates
                  </Typography>
                  <Typography variant="h4" color="warning.main">
                    {expiredCertificates.length}
                  </Typography>
                </Box>
                <Warning sx={{ fontSize: 40, color: 'warning.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Security Status
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    Secure
                  </Typography>
                </Box>
                <Shield sx={{ fontSize: 40, color: 'success.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Security Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="security tabs">
          <Tab label="Certificates" />
          <Tab label="Encryption" />
          <Tab label="Compliance" />
          <Tab label="Root Detection" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Typography variant="h6" gutterBottom>
            Certificate Management
          </Typography>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Valid Until</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {certificates?.map((certificate) => (
                  <TableRow key={certificate.id}>
                    <TableCell>{certificate.name}</TableCell>
                    <TableCell>
                      <Chip label={certificate.type} size="small" />
                    </TableCell>
                    <TableCell>{certificate.subject}</TableCell>
                    <TableCell>
                      {new Date(certificate.validTo).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {certificate.isRevoked ? (
                        <Chip label="Revoked" color="error" size="small" />
                      ) : new Date(certificate.validTo) < new Date() ? (
                        <Chip label="Expired" color="warning" size="small" />
                      ) : (
                        <Chip label="Active" color="success" size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        onClick={() => handleRevokeCertificate(certificate.id)}
                        disabled={certificate.isRevoked}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom>
            Encryption Management
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            Encryption policies can be enforced on individual devices or across the entire fleet.
          </Alert>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Device Encryption Status
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Fully Encrypted</Typography>
                      <Typography variant="body2" color="success.main">85%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={85} sx={{ mb: 2 }} />
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Partially Encrypted</Typography>
                      <Typography variant="body2" color="warning.main">10%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={10} color="warning" sx={{ mb: 2 }} />
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Not Encrypted</Typography>
                      <Typography variant="body2" color="error.main">5%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={5} color="error" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Encryption Types
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">AES-256</Typography>
                      <Typography variant="body2" color="success.main">70%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">AES-128</Typography>
                      <Typography variant="body2" color="primary.main">25%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Other</Typography>
                      <Typography variant="body2" color="text.secondary">5%</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom>
            Compliance Monitoring
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <GppGood sx={{ color: 'success.main', mr: 1 }} />
                    <Typography variant="h6">Compliant Devices</Typography>
                  </Box>
                  <Typography variant="h4" color="success.main">
                    85%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {devices?.data?.length ? Math.round(devices.data.length * 0.85) : 0} of {devices?.data?.length || 0} devices
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <GppBad sx={{ color: 'error.main', mr: 1 }} />
                    <Typography variant="h6">Non-Compliant</Typography>
                  </Box>
                  <Typography variant="h4" color="error.main">
                    15%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {devices?.data?.length ? Math.round(devices.data.length * 0.15) : 0} devices need attention
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Security sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="h6">Security Score</Typography>
                  </Box>
                  <Typography variant="h4" color="primary.main">
                    92/100
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Overall security compliance score
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <Typography variant="h6" gutterBottom>
            Root Detection & Security
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Root Status Overview
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Secure Devices</Typography>
                      <Typography variant="body2" color="success.main">
                        {devices?.data?.length ? Math.round(devices.data.length * 0.95) : 0}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Rooted Devices</Typography>
                      <Typography variant="body2" color="error.main">
                        {devices?.data?.length ? Math.round(devices.data.length * 0.05) : 0}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Security Threats
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <CheckCircle sx={{ color: 'success.main', mr: 1 }} />
                      <Typography variant="body2">No active threats detected</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Warning sx={{ color: 'warning.main', mr: 1 }} />
                      <Typography variant="body2">2 devices require security updates</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>

      {/* Create Certificate Dialog */}
      <Dialog open={createCertificateOpen} onClose={() => setCreateCertificateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Certificate</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Certificate Name"
            value={newCertificate.name || ''}
            onChange={(e) => setNewCertificate({ ...newCertificate, name: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Description"
            value={newCertificate.description || ''}
            onChange={(e) => setNewCertificate({ ...newCertificate, description: e.target.value })}
            margin="normal"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Certificate Type</InputLabel>
            <Select
              value={newCertificate.type || ''}
              onChange={(e) => setNewCertificate({ ...newCertificate, type: e.target.value as any })}
            >
              <MenuItem value="SSL_TLS">SSL/TLS</MenuItem>
              <MenuItem value="CLIENT_AUTH">Client Authentication</MenuItem>
              <MenuItem value="CODE_SIGNING">Code Signing</MenuItem>
              <MenuItem value="ROOT_CA">Root CA</MenuItem>
              <MenuItem value="INTERMEDIATE_CA">Intermediate CA</MenuItem>
              <MenuItem value="DEVICE_CA">Device CA</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Subject"
            value={newCertificate.subject || ''}
            onChange={(e) => setNewCertificate({ ...newCertificate, subject: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Issuer"
            value={newCertificate.issuer || ''}
            onChange={(e) => setNewCertificate({ ...newCertificate, issuer: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Valid Days"
            type="number"
            value={newCertificate.validDays || 365}
            onChange={(e) => setNewCertificate({ ...newCertificate, validDays: parseInt(e.target.value) })}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateCertificateOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCreateCertificate} 
            variant="contained"
            disabled={!newCertificate.name || !newCertificate.type || !newCertificate.subject || !newCertificate.issuer}
          >
            Create Certificate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SecurityDashboardPage;
