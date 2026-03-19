import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Alert,
  CircularProgress,
  Tooltip,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Security,
  Wifi,
  Apps,
  Assessment,
  ExpandMore,
  PlayArrow,
  Pause,
  Visibility,
} from '@mui/icons-material';
import { useAuthContext } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';

interface Policy {
  id: string;
  name: string;
  description: string;
  type: 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  targetDevices: string[];
  targetGroups: string[];
  rules: any;
  complianceRate: number;
}

interface PolicyFormData {
  name: string;
  description: string;
  type: 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE';
  isActive: boolean;
  rules: any;
  targetDevices: string[];
  targetGroups: string[];
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const PoliciesPage: React.FC = () => {
  const { hasPermission } = useAuthContext();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [formData, setFormData] = useState<PolicyFormData>({
    name: '',
    description: '',
    type: 'SECURITY',
    isActive: true,
    rules: {},
    targetDevices: [],
    targetGroups: [],
  });

  const defaultRules = {
    SECURITY: {
      passwordRequired: true,
      passwordMinLength: 8,
      passwordComplexity: true,
      biometricEnabled: false,
      encryptionRequired: true,
      screenLockTimeout: 5,
      maxFailedAttempts: 5,
    },
    NETWORK: {
      wifiRestrictions: false,
      allowedWifiNetworks: [],
      vpnRequired: false,
      vpnConfiguration: {},
      cellularDataEnabled: true,
      roamingEnabled: false,
      hotspotEnabled: false,
    },
    APPLICATION: {
      appInstallationRestricted: false,
      allowedApps: [],
      blockedApps: [],
      kioskMode: false,
      kioskApp: '',
      sideloadingAllowed: false,
      appUpdateRequired: true,
    },
    COMPLIANCE: {
      minOsVersion: '',
      maxOsVersion: '',
      deviceEncryptionRequired: true,
      jailbreakDetection: true,
      antivirusRequired: false,
      healthCheckInterval: 24,
      locationTrackingEnabled: true,
    },
  };

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching policies...');
      
      const policiesData = await apiService.getPolicies({ limit: 100 });
      console.log('📋 Policies fetched:', { 
        count: policiesData.data?.length || 0, 
        total: policiesData.pagination?.total || 0,
        hasPagination: !!policiesData.pagination
      });
      
      // Map the API response to the local Policy interface
      const mappedPolicies: Policy[] = (policiesData.data || []).map(policy => ({
        id: policy.id,
        name: policy.name,
        description: policy.description,
        type: policy.type as 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE',
        isActive: policy.isActive,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
        targetDevices: [], // Would need to be populated from API
        targetGroups: [], // Would need to be populated from API
        rules: policy.rules,
        complianceRate: 0 // Would need to be calculated
      }));
      
      setPolicies(mappedPolicies);
      setError(null);
      console.log('✅ Policies loaded successfully:', mappedPolicies.length);
    } catch (err: any) {
      console.error('❌ Error fetching policies:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleCreatePolicy = async () => {
    try {
      console.log('🔄 Creating policy:', formData.name);
      await apiService.createPolicy(formData);
      await fetchPolicies();
      handleCloseDialog();
      setError(null);
      console.log('✅ Policy created successfully');
    } catch (err: any) {
      console.error('❌ Error creating policy:', err);
      setError(err.response?.data?.message || err.message || 'Failed to create policy');
    }
  };

  const handleUpdatePolicy = async () => {
    if (!editingPolicy) return;

    try {
      console.log('🔄 Updating policy:', editingPolicy.id);
      await apiService.updatePolicy(editingPolicy.id, formData);
      await fetchPolicies();
      handleCloseDialog();
      setError(null);
      console.log('✅ Policy updated successfully');
    } catch (err: any) {
      console.error('❌ Error updating policy:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update policy');
    }
  };

  const handleDeletePolicy = async (policyId: string) => {
    if (!window.confirm('Are you sure you want to delete this policy?')) return;

    try {
      console.log('🔄 Deleting policy:', policyId);
      await apiService.deletePolicy(policyId);
      await fetchPolicies();
      setError(null);
      console.log('✅ Policy deleted successfully');
    } catch (err: any) {
      console.error('❌ Error deleting policy:', err);
      setError(err.response?.data?.message || err.message || 'Failed to delete policy');
    }
  };

  const handleToggleActive = async (policyId: string, isActive: boolean) => {
    try {
      await apiService.put(`/policies/${policyId}/status`, { isActive: !isActive });
      await fetchPolicies();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update policy status');
    }
  };

  const handleOpenDialog = (policy?: Policy) => {
    if (policy) {
      setEditingPolicy(policy);
      setFormData({
        name: policy.name,
        description: policy.description,
        type: policy.type,
        isActive: policy.isActive,
        rules: policy.rules,
        targetDevices: policy.targetDevices,
        targetGroups: policy.targetGroups,
      });
    } else {
      setEditingPolicy(null);
      setFormData({
        name: '',
        description: '',
        type: 'SECURITY',
        isActive: true,
        rules: defaultRules['SECURITY'],
        targetDevices: [],
        targetGroups: [],
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingPolicy(null);
  };

  const handleTypeChange = (type: 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE') => {
    setFormData({
      ...formData,
      type,
      rules: defaultRules[type],
    });
  };

  const handleRuleChange = (rulePath: string, value: any) => {
    const newRules = { ...formData.rules };
    const keys = rulePath.split('.');
    let current = newRules;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    setFormData({ ...formData, rules: newRules });
  };

  const getPolicyTypeIcon = (type: string) => {
    switch (type) {
      case 'SECURITY':
        return <Security />;
      case 'NETWORK':
        return <Wifi />;
      case 'APPLICATION':
        return <Apps />;
      case 'COMPLIANCE':
        return <Assessment />;
      default:
        return <Security />;
    }
  };

  const getPolicyTypeColor = (type: string) => {
    switch (type) {
      case 'SECURITY':
        return 'error';
      case 'NETWORK':
        return 'info';
      case 'APPLICATION':
        return 'primary';
      case 'COMPLIANCE':
        return 'warning';
      default:
        return 'default';
    }
  };

  const renderSecurityRules = () => (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.passwordRequired}
              onChange={(e) => handleRuleChange('passwordRequired', e.target.checked)}
            />
          }
          label="Password Required"
        />
      </Grid>
      {formData.rules.passwordRequired && (
        <>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Minimum Password Length"
              type="number"
              value={formData.rules.passwordMinLength}
              onChange={(e) => handleRuleChange('passwordMinLength', parseInt(e.target.value))}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.rules.passwordComplexity}
                  onChange={(e) => handleRuleChange('passwordComplexity', e.target.checked)}
                />
              }
              label="Require Complex Password"
            />
          </Grid>
        </>
      )}
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.biometricEnabled}
              onChange={(e) => handleRuleChange('biometricEnabled', e.target.checked)}
            />
          }
          label="Enable Biometric Authentication"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.encryptionRequired}
              onChange={(e) => handleRuleChange('encryptionRequired', e.target.checked)}
            />
          }
          label="Device Encryption Required"
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label="Screen Lock Timeout (minutes)"
          type="number"
          value={formData.rules.screenLockTimeout}
          onChange={(e) => handleRuleChange('screenLockTimeout', parseInt(e.target.value))}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label="Max Failed Login Attempts"
          type="number"
          value={formData.rules.maxFailedAttempts}
          onChange={(e) => handleRuleChange('maxFailedAttempts', parseInt(e.target.value))}
        />
      </Grid>
    </Grid>
  );

  const renderNetworkRules = () => (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.wifiRestrictions}
              onChange={(e) => handleRuleChange('wifiRestrictions', e.target.checked)}
            />
          }
          label="Enable WiFi Restrictions"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.vpnRequired}
              onChange={(e) => handleRuleChange('vpnRequired', e.target.checked)}
            />
          }
          label="VPN Required"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.cellularDataEnabled}
              onChange={(e) => handleRuleChange('cellularDataEnabled', e.target.checked)}
            />
          }
          label="Allow Cellular Data"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.roamingEnabled}
              onChange={(e) => handleRuleChange('roamingEnabled', e.target.checked)}
            />
          }
          label="Allow Data Roaming"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.hotspotEnabled}
              onChange={(e) => handleRuleChange('hotspotEnabled', e.target.checked)}
            />
          }
          label="Allow Mobile Hotspot"
        />
      </Grid>
    </Grid>
  );

  const renderApplicationRules = () => (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.appInstallationRestricted}
              onChange={(e) => handleRuleChange('appInstallationRestricted', e.target.checked)}
            />
          }
          label="Restrict App Installation"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.kioskMode}
              onChange={(e) => handleRuleChange('kioskMode', e.target.checked)}
            />
          }
          label="Enable Kiosk Mode"
        />
      </Grid>
      {formData.rules.kioskMode && (
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Kiosk App Package Name"
            value={formData.rules.kioskApp}
            onChange={(e) => handleRuleChange('kioskApp', e.target.value)}
          />
        </Grid>
      )}
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.sideloadingAllowed}
              onChange={(e) => handleRuleChange('sideloadingAllowed', e.target.checked)}
            />
          }
          label="Allow App Sideloading"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.appUpdateRequired}
              onChange={(e) => handleRuleChange('appUpdateRequired', e.target.checked)}
            />
          }
          label="Require App Updates"
        />
      </Grid>
    </Grid>
  );

  const renderComplianceRules = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label="Minimum OS Version"
          value={formData.rules.minOsVersion}
          onChange={(e) => handleRuleChange('minOsVersion', e.target.value)}
          placeholder="e.g., 10.0"
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label="Maximum OS Version"
          value={formData.rules.maxOsVersion}
          onChange={(e) => handleRuleChange('maxOsVersion', e.target.value)}
          placeholder="e.g., 14.0"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.deviceEncryptionRequired}
              onChange={(e) => handleRuleChange('deviceEncryptionRequired', e.target.checked)}
            />
          }
          label="Device Encryption Required"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.jailbreakDetection}
              onChange={(e) => handleRuleChange('jailbreakDetection', e.target.checked)}
            />
          }
          label="Jailbreak/Root Detection"
        />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.rules.locationTrackingEnabled}
              onChange={(e) => handleRuleChange('locationTrackingEnabled', e.target.checked)}
            />
          }
          label="Enable Location Tracking"
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth
          label="Health Check Interval (hours)"
          type="number"
          value={formData.rules.healthCheckInterval}
          onChange={(e) => handleRuleChange('healthCheckInterval', parseInt(e.target.value))}
        />
      </Grid>
    </Grid>
  );

  const renderRulesForm = () => {
    switch (formData.type) {
      case 'SECURITY':
        return renderSecurityRules();
      case 'NETWORK':
        return renderNetworkRules();
      case 'APPLICATION':
        return renderApplicationRules();
      case 'COMPLIANCE':
        return renderComplianceRules();
      default:
        return null;
    }
  };

  const canManagePolicies = hasPermission('policies', 'manage');

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Policy Management
        </Typography>
        {canManagePolicies && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
          >
            Create Policy
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
              <Tab label="All Policies" />
              <Tab label="Active" />
              <Tab label="Inactive" />
              <Tab label="Compliance" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Policy</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Targets</TableCell>
                      <TableCell>Compliance</TableCell>
                      <TableCell>Updated</TableCell>
                      {canManagePolicies && <TableCell>Actions</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {policies.map((policy) => (
                      <TableRow key={policy.id} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="subtitle2">{policy.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {policy.description}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={getPolicyTypeIcon(policy.type)}
                            label={policy.type}
                            color={getPolicyTypeColor(policy.type) as any}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={policy.isActive ? 'Active' : 'Inactive'}
                            color={policy.isActive ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {policy.targetDevices.length + policy.targetGroups.length} targets
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2">
                              {policy.complianceRate}%
                            </Typography>
                            <Box
                              sx={{
                                width: 60,
                                height: 4,
                                backgroundColor: 'grey.300',
                                borderRadius: 2,
                              }}
                            >
                              <Box
                                sx={{
                                  width: `${policy.complianceRate}%`,
                                  height: '100%',
                                  backgroundColor: policy.complianceRate > 80 ? 'success.main' : 'warning.main',
                                  borderRadius: 2,
                                }}
                              />
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {new Date(policy.updatedAt).toLocaleDateString()}
                        </TableCell>
                        {canManagePolicies && (
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Tooltip title="View Policy">
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpenDialog(policy)}
                                >
                                  <Visibility />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit Policy">
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpenDialog(policy)}
                                >
                                  <Edit />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={policy.isActive ? 'Deactivate' : 'Activate'}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleToggleActive(policy.id, policy.isActive)}
                                  color={policy.isActive ? 'warning' : 'success'}
                                >
                                  {policy.isActive ? <Pause /> : <PlayArrow />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Policy">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeletePolicy(policy.id)}
                                  color="error"
                                >
                                  <Delete />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {policies.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canManagePolicies ? 7 : 6} align="center">
                          <Box sx={{ py: 4 }}>
                            <Security sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                            <Typography variant="h6" color="text.secondary">
                              No policies created
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                              Create your first policy to start managing device compliance
                            </Typography>
                            {canManagePolicies && (
                              <Button
                                variant="contained"
                                startIcon={<Add />}
                                onClick={() => handleOpenDialog()}
                              >
                                Create Policy
                              </Button>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Typography variant="body1">Active policies view</Typography>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Typography variant="body1">Inactive policies view</Typography>
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Typography variant="body1">Compliance monitoring dashboard</Typography>
          </TabPanel>
        </CardContent>
      </Card>

      {/* Create/Edit Policy Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="lg" fullWidth>
        <DialogTitle>
          {editingPolicy ? 'Edit Policy' : 'Create New Policy'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Policy Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Policy Type</InputLabel>
                <Select
                  value={formData.type}
                  label="Policy Type"
                  onChange={(e) => handleTypeChange(e.target.value as any)}
                >
                  <MenuItem value="SECURITY">Security</MenuItem>
                  <MenuItem value="NETWORK">Network</MenuItem>
                  <MenuItem value="APPLICATION">Application</MenuItem>
                  <MenuItem value="COMPLIANCE">Compliance</MenuItem>
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
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                }
                label="Policy Active"
              />
            </Grid>
            <Grid item xs={12}>
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography variant="h6">Policy Rules</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {renderRulesForm()}
                </AccordionDetails>
              </Accordion>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={editingPolicy ? handleUpdatePolicy : handleCreatePolicy}
            variant="contained"
          >
            {editingPolicy ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PoliciesPage;