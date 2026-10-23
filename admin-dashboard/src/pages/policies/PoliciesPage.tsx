import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
import { parseGoogleAccountIds } from '../../utils/resetProtection';
interface Policy {
  id: string;
  name: string;
  description: string;
  type: 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE' | 'HARDWARE' | 'SYSTEM';
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
  type: 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE' | 'HARDWARE' | 'SYSTEM';
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
  const defaultRules: Record<string, any> = {
    SECURITY: {
      passwordRequired: true,
      passwordMinLength: 8,
      passwordComplexity: true,
      passwordExpiryDays: 90,
      passwordHistoryCount: 5,
      biometricEnabled: false,
      encryptionRequired: true,
      screenLockTimeout: 5,
      maxFailedAttempts: 5,
      autoWipeOnFailure: false,
      trustAgentsAllowed: false,
    },
    NETWORK: {
      wifiRestrictions: false,
      allowedWifiNetworks: [],
      vpnRequired: false,
      vpnConfiguration: {},
      cellularDataEnabled: true,
      roamingEnabled: false,
      hotspotEnabled: false,
      nfcDisabled: false,
      airplaneModeDisabled: false,
      globalProxyUrl: '',
    },
    APPLICATION: {
      appInstallationRestricted: false,
      allowedApps: [],
      blockedApps: [],
      kioskMode: false,
      kioskApp: '',
      sideloadingAllowed: false,
      appUpdateRequired: true,
      clipboardDlpEnabled: false,
      preventAppDataClearing: true,
      safeSearchEnforced: false,
    },
    HARDWARE: {
      cameraDisabled: false,
      usbFileTransferDisabled: false,
      externalStorageDisabled: false,
      screenCaptureDisabled: false,
      microphoneDisabled: false,
    },
    SYSTEM: {
      systemUpdatePolicy: 'AUTOMATIC',
      updateWindowStart: '02:00',
      updateWindowEnd: '05:00',
      factoryResetDisabled: true,
      safeBootDisabled: true,
      timeDateModificationDisabled: true,
      accountModificationDisabled: true,
    },
    COMPLIANCE: {
      minOsVersion: '',
      maxOsVersion: '',
      deviceEncryptionRequired: true,
      jailbreakDetection: true,
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
  // Free text for the reset-protection accounts, so separators can be typed; the parsed
  // list is what is stored in the rules.
  const [frpAccountsText, setFrpAccountsText] = useState('');
  const frpParsed = parseGoogleAccountIds(frpAccountsText);
  const handleFrpAccountsChange = (text: string) => {
    setFrpAccountsText(text);
    const { ids } = parseGoogleAccountIds(text);
    const rules = { ...formData.rules };
    if (ids.length > 0) rules.factoryResetProtectionAccounts = ids;
    else delete rules.factoryResetProtectionAccounts;
    setFormData({ ...formData, rules });
  };
  const handleOpenDialog = (policy?: Policy) => {
    if (policy) {
      setEditingPolicy(policy);
      setFrpAccountsText((policy.rules?.factoryResetProtectionAccounts ?? []).join('\n'));
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
      setFrpAccountsText('');
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
  const handleTypeChange = (type: 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE' | 'HARDWARE' | 'SYSTEM') => {
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
      const key = keys[i] as string;
      if (!current[key]) current[key] = {};
      current = current[key];
    }
    current[keys[keys.length - 1] as string] = value;
    setFormData({ ...formData, rules: newRules });
  };
  const getPolicyTypeIcon = (type: string) => {
    switch (type) {
      case 'SECURITY': return <Security />;
      case 'NETWORK': return <Wifi />;
      case 'APPLICATION': return <Apps />;
      case 'COMPLIANCE': return <Assessment />;
      case 'HARDWARE': return <Security />; // can use another icon if imported
      case 'SYSTEM': return <Assessment />; // can use another icon if imported
      default: return <Security />;
    }
  };
  const getPolicyTypeColor = (type: string) => {
    switch (type) {
      case 'SECURITY': return 'error';
      case 'NETWORK': return 'info';
      case 'APPLICATION': return 'primary';
      case 'COMPLIANCE': return 'warning';
      case 'HARDWARE': return 'error';
      case 'SYSTEM': return 'primary';
      default: return 'default';
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
            <TextField fullWidth label="Minimum Password Length" type="number" value={formData.rules.passwordMinLength} onChange={(e) => handleRuleChange('passwordMinLength', parseInt(e.target.value))} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Password Expiration (Days)" type="number" value={formData.rules.passwordExpiryDays} onChange={(e) => handleRuleChange('passwordExpiryDays', parseInt(e.target.value))} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Prevent Reused Passwords (Last X)" type="number" value={formData.rules.passwordHistoryCount} onChange={(e) => handleRuleChange('passwordHistoryCount', parseInt(e.target.value))} />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel control={<Switch checked={formData.rules.passwordComplexity} onChange={(e) => handleRuleChange('passwordComplexity', e.target.checked)} />} label="Require Complex Password" />
          </Grid>
        </>
      )}
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.biometricEnabled} onChange={(e) => handleRuleChange('biometricEnabled', e.target.checked)} />} label="Enable Biometric Authentication" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.trustAgentsAllowed} onChange={(e) => handleRuleChange('trustAgentsAllowed', e.target.checked)} />} label="Enable Trust Agents (Smart Lock)" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.encryptionRequired} onChange={(e) => handleRuleChange('encryptionRequired', e.target.checked)} />} label="Device Encryption Required" />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth label="Screen Lock Timeout (minutes)" type="number" value={formData.rules.screenLockTimeout} onChange={(e) => handleRuleChange('screenLockTimeout', parseInt(e.target.value))} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth label="Max Failed Login Attempts" type="number" value={formData.rules.maxFailedAttempts} onChange={(e) => handleRuleChange('maxFailedAttempts', parseInt(e.target.value))} />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.autoWipeOnFailure} onChange={(e) => handleRuleChange('autoWipeOnFailure', e.target.checked)} />} label="Auto-Wipe Data After Max Failed Attempts" />
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
        <FormControlLabel control={<Switch checked={formData.rules.hotspotEnabled} onChange={(e) => handleRuleChange('hotspotEnabled', e.target.checked)} />} label="Allow Mobile Hotspot" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.nfcDisabled} onChange={(e) => handleRuleChange('nfcDisabled', e.target.checked)} />} label="Disable NFC Features" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.airplaneModeDisabled} onChange={(e) => handleRuleChange('airplaneModeDisabled', e.target.checked)} />} label="Disable Airplane Mode" />
      </Grid>
      <Grid item xs={12}>
        <TextField fullWidth label="Global Proxy URL (Optional)" value={formData.rules.globalProxyUrl || ''} onChange={(e) => handleRuleChange('globalProxyUrl', e.target.value)} placeholder="e.g., proxy.company.com:8080" />
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
        <FormControlLabel control={<Switch checked={formData.rules.appUpdateRequired} onChange={(e) => handleRuleChange('appUpdateRequired', e.target.checked)} />} label="Require App Updates" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.clipboardDlpEnabled} onChange={(e) => handleRuleChange('clipboardDlpEnabled', e.target.checked)} />} label="Block Clipboard Cross-Profile (DLP)" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.preventAppDataClearing} onChange={(e) => handleRuleChange('preventAppDataClearing', e.target.checked)} />} label="Prevent Users Clearing App Data" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.safeSearchEnforced} onChange={(e) => handleRuleChange('safeSearchEnforced', e.target.checked)} />} label="Enforce Browser Safe Search" />
      </Grid>
    </Grid>
  );
  const renderHardwareRules = () => (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.cameraDisabled} onChange={(e) => handleRuleChange('cameraDisabled', e.target.checked)} />} label="Disable Camera Globally" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.usbFileTransferDisabled} onChange={(e) => handleRuleChange('usbFileTransferDisabled', e.target.checked)} />} label="Disable USB File Transfer (MTP)" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.externalStorageDisabled} onChange={(e) => handleRuleChange('externalStorageDisabled', e.target.checked)} />} label="Disable External Storage (SD Card)" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.screenCaptureDisabled} onChange={(e) => handleRuleChange('screenCaptureDisabled', e.target.checked)} />} label="Disable Screenshots / Screen Recording" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.microphoneDisabled} onChange={(e) => handleRuleChange('microphoneDisabled', e.target.checked)} />} label="Disable Microphone" />
      </Grid>
    </Grid>
  );
  const renderSystemRules = () => (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <InputLabel>System Update Policy</InputLabel>
          <Select value={formData.rules.systemUpdatePolicy || 'AUTOMATIC'} onChange={(e) => handleRuleChange('systemUpdatePolicy', e.target.value)} label="System Update Policy">
            <MenuItem value="AUTOMATIC">Automatic (Install Immediately)</MenuItem>
            <MenuItem value="POSTPONED">Postponed (Delay 30 Days)</MenuItem>
            <MenuItem value="WINDOWED">Windowed (Time Restricted)</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      {formData.rules.systemUpdatePolicy === 'WINDOWED' && (
        <>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Update Window Start" value={formData.rules.updateWindowStart} onChange={(e) => handleRuleChange('updateWindowStart', e.target.value)} placeholder="02:00" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Update Window End" value={formData.rules.updateWindowEnd} onChange={(e) => handleRuleChange('updateWindowEnd', e.target.value)} placeholder="05:00" />
          </Grid>
        </>
      )}
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.factoryResetDisabled} onChange={(e) => handleRuleChange('factoryResetDisabled', e.target.checked)} />} label="Disable Factory Reset" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.safeBootDisabled} onChange={(e) => handleRuleChange('safeBootDisabled', e.target.checked)} />} label="Disable Safe Boot Mode" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.timeDateModificationDisabled} onChange={(e) => handleRuleChange('timeDateModificationDisabled', e.target.checked)} />} label="Disable User Time/Date Changes" />
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel control={<Switch checked={formData.rules.accountModificationDisabled} onChange={(e) => handleRuleChange('accountModificationDisabled', e.target.checked)} />} label="Block adding or removing accounts (stops personal Google accounts being signed in)" />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="UBOS Google accounts that can unlock a reset tablet"
          value={frpAccountsText}
          onChange={(e) => handleFrpAccountsChange(e.target.value)}
          placeholder="One Google account ID per line, e.g. 112233445566778899"
          error={frpParsed.problems.length > 0}
          helperText={
            frpParsed.problems.length > 0
              ? frpParsed.problems.join('; ')
              : 'After a factory reset only these accounts can set the tablet up again, so a personal ' +
                'account left on it cannot lock UBOS out. Use numeric account IDs, not emails ' +
                '(see docs/android-agent.md). Needs the agent as Device Owner on Android 11+.'
          }
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
      case 'HARDWARE':
        return renderHardwareRules();
      case 'SYSTEM':
        return renderSystemRules();
      default:
        return null;
    }
  };
  const canManagePolicies = hasPermission('policies', 'manage');
  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography 
          variant="h4" 
          component="h1"
          sx={{ 
            fontWeight: 800,
            background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            letterSpacing: '-0.02em'
          }}
        >
          Policy Management
        </Typography>
        {canManagePolicies && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
            sx={{ 
              borderRadius: 2, 
              textTransform: 'none', 
              fontWeight: 600,
              boxShadow: '0 4px 14px 0 rgba(37, 99, 235, 0.25)',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)',
              }
            }}
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

      <Card sx={{ borderRadius: 2, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ px: 3, pt: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={tabValue} 
            onChange={(_, newValue) => setTabValue(newValue)}
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                minWidth: 'auto',
                px: 3,
                py: 1.5,
              }
            }}
          >
            <Tab label="All Policies" />
            <Tab label="Active" />
            <Tab label="Inactive" />
            <Tab label="Compliance" />
          </Tabs>
        </Box>
        <Box sx={{ p: 0 }}>

          <TabPanel value={tabValue} index={0}>
            {loading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
                <CircularProgress size={32} thickness={4} />
                <Typography variant="body2" color="text.secondary">Loading policies...</Typography>
              </Box>
            ) : (
              <TableContainer sx={{ overflowX: 'auto', borderRadius: 0 }}>
                <Table sx={{ minWidth: 800 }}>
                  <TableHead sx={{ backgroundColor: '#fafafa', borderBottom: '2px solid', borderColor: 'divider' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Policy</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Targets</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Compliance</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Updated</TableCell>
                      {canManagePolicies && <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Actions</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {policies.map((policy) => (
                      <TableRow key={policy.id} hover>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>{policy.name}</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              {policy.description}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: getPolicyTypeColor(policy.type) === 'error' ? '#ef4444' : getPolicyTypeColor(policy.type) === 'info' ? '#3b82f6' : getPolicyTypeColor(policy.type) === 'primary' ? '#8b5cf6' : '#f59e0b' }}>
                            {getPolicyTypeIcon(policy.type)}
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>{policy.type}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Chip
                            label={policy.isActive ? 'Active' : 'Inactive'}
                            color={policy.isActive ? 'success' : 'default'}
                            size="small"
                            sx={{ fontWeight: 600, borderRadius: 1, height: 24, fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                            {policy.targetDevices.length + policy.targetGroups.length} targets
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ flexGrow: 1, height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                              <Box sx={{ width: `${policy.complianceRate}%`, height: '100%', backgroundColor: policy.complianceRate > 80 ? '#10b981' : '#f59e0b', borderRadius: 3 }} />
                            </Box>
                            <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 32 }}>{policy.complianceRate}%</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {new Date(policy.updatedAt).toLocaleDateString()}
                          </Typography>
                        </TableCell>
                        {canManagePolicies && (
                          <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }} align="right">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <Tooltip title="View Policy">
                                <IconButton size="small" onClick={() => handleOpenDialog(policy)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'primary.50' } }}>
                                  <Visibility fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit Policy">
                                <IconButton size="small" onClick={() => handleOpenDialog(policy)} sx={{ color: 'text.secondary', '&:hover': { color: 'warning.main', bgcolor: 'warning.50' } }}>
                                  <Edit fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={policy.isActive ? 'Deactivate' : 'Activate'}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleToggleActive(policy.id, policy.isActive)}
                                  sx={{ color: policy.isActive ? '#f59e0b' : '#10b981', '&:hover': { bgcolor: policy.isActive ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)' } }}
                                >
                                  {policy.isActive ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Policy">
                                <IconButton size="small" onClick={() => handleDeletePolicy(policy.id)} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'error.50' } }}>
                                  <Delete fontSize="small" />
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
            <Typography variant="body2" color="text.secondary">Active policies view</Typography>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Typography variant="body2" color="text.secondary">Inactive policies view</Typography>
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Typography variant="body2" color="text.secondary">Compliance monitoring dashboard</Typography>
          </TabPanel>
        </Box>
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
                  <MenuItem value="HARDWARE">Hardware</MenuItem>
                  <MenuItem value="SYSTEM">System Updates & Restrictions</MenuItem>
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
            // An invalid unlock account would be dropped silently and could leave reset
            // tablets that nobody can unlock.
            disabled={formData.type === 'SYSTEM' && frpParsed.problems.length > 0}
          >
            {editingPolicy ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default PoliciesPage;