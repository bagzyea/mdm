import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Tooltip,
  LinearProgress,
  MenuItem,
  Divider,
  Paper,
  Snackbar,
} from '@mui/material';
import {
  CloudUpload,
  Delete,
  Download,
  ContentCopy,
  Android,
  Refresh,
  Search,
  CheckCircle,
  Storage as StorageIcon,
  Apps,
} from '@mui/icons-material';
import { apkVaultService } from '../../services/api';

interface VaultApp {
  id: string;
  packageName: string;
  appName: string;
  displayName: string;
  description?: string;
  category: string;
  version: string;
  versionCode: number;
  fileSize: string; // BigInt serialised as string from backend
  filePath: string;
  fileHash: string;
  isActive: boolean;
  uploadedBy: string;
  uploadedAt: string;
}

// Must match the APKCategory enum in backend/prisma/schema.prisma. The previous list
// (Business, Security, Utilities, Navigation, Other) did not, and the database refused
// every upload that used one of them, including the default.
const CATEGORY_OPTIONS = [
  { value: 'CENSUS', label: 'Census' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'PRODUCTIVITY', label: 'Productivity' },
  { value: 'UTILITY', label: 'Utility' },
  { value: 'COMMUNICATION', label: 'Communication' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'CUSTOM', label: 'Custom' },
];

const CATEGORY_COLORS: Record<string, string> = {
  CENSUS: '#3b82f6',
  GOVERNMENT: '#0ea5e9',
  PRODUCTIVITY: '#10b981',
  UTILITY: '#f59e0b',
  COMMUNICATION: '#8b5cf6',
  MEDIA: '#ec4899',
  EDUCATION: '#06b6d4',
  CUSTOM: '#6b7280',
};

const formatBytes = (sizeStr: string): string => {
  const bytes = parseInt(sizeStr, 10);
  if (isNaN(bytes)) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AppVaultPage: React.FC = () => {
  const [apps, setApps] = useState<VaultApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');

  // Upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    packageName: '',
    appName: '',
    displayName: '',
    description: '',
    category: 'CUSTOM',
    version: '1.0.0',
    versionCode: '1',
  });

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [appToDelete, setAppToDelete] = useState<VaultApp | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchApps = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apkVaultService.getAll();
      setApps(data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load App Vault');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  // ── Drag & Drop ──────────────────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.apk')) {
      applyFile(file);
    } else {
      setSnackbar({ open: true, message: 'Only .apk files are accepted', severity: 'error' });
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
  };

  const applyFile = (file: File) => {
    setSelectedFile(file);
    const guessedName = file.name.replace('.apk', '');
    setUploadForm(prev => ({
      ...prev,
      appName: guessedName,
      displayName: guessedName,
    }));
  };

  // ── Upload ───────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('apk', selectedFile);
    Object.entries(uploadForm).forEach(([k, v]) => formData.append(k, v));

    try {
      setUploading(true);
      setUploadProgress(10);

      // Simulate progress ticks while real upload happens
      const interval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 15, 85));
      }, 400);

      await apkVaultService.upload(formData);
      clearInterval(interval);
      setUploadProgress(100);

      setTimeout(() => {
        setUploadDialogOpen(false);
        setSelectedFile(null);
        setUploadProgress(0);
        setUploading(false);
        setUploadForm({ packageName: '', appName: '', displayName: '', description: '', category: 'CUSTOM', version: '1.0.0', versionCode: '1' });
        fetchApps();
        setSnackbar({ open: true, message: 'App uploaded successfully to the Vault!', severity: 'success' });
      }, 500);
    } catch (err: any) {
      setUploading(false);
      setUploadProgress(0);
      setSnackbar({ open: true, message: err?.response?.data?.message || 'Upload failed', severity: 'error' });
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!appToDelete) return;
    try {
      await apkVaultService.delete(appToDelete.id);
      setDeleteDialogOpen(false);
      setAppToDelete(null);
      fetchApps();
      setSnackbar({ open: true, message: 'App removed from Vault', severity: 'success' });
    } catch (err: any) {
      setSnackbar({ open: true, message: err?.response?.data?.message || 'Delete failed', severity: 'error' });
    }
  };

  // Download URLs are now minted by the server and expire (finding F-06), so both of
  // these are asynchronous where they used to be simple string construction.
  const copyUrl = async (id: string) => {
    try {
      const url = await apkVaultService.getDownloadUrl(id);
      await navigator.clipboard.writeText(url);
      setSnackbar({
        open: true,
        message: 'Signed download URL copied — it expires in one hour',
        severity: 'success',
      });
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || 'Could not create a download URL',
        severity: 'error',
      });
    }
  };

  const downloadApk = async (id: string) => {
    try {
      const url = await apkVaultService.getDownloadUrl(id);
      window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || 'Could not create a download URL',
        severity: 'error',
      });
    }
  };

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filteredApps = apps.filter(app => {
    const matchesSearch =
      app.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.packageName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'ALL' || app.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const totalSize = apps.reduce((sum, a) => sum + parseInt(a.fileSize || '0', 10), 0);

  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box sx={{ mb: 5, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3 }}>
        <Box>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: 800,
              mb: 0.5,
              background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              letterSpacing: '-0.02em',
            }}
          >
            Enterprise App Vault
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
            Upload, host, and distribute corporate APKs to your entire device fleet
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={fetchApps}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, borderColor: 'divider' }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<CloudUpload />}
            onClick={() => setUploadDialogOpen(true)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
              boxShadow: '0 4px 14px 0 rgba(124, 58, 237, 0.4)',
              '&:hover': { background: 'linear-gradient(135deg, #6d28d9 0%, #1d4ed8 100%)' },
            }}
          >
            Upload APK
          </Button>
        </Box>
      </Box>

      {/* ── Stats Row ──────────────────────────────────────────────────────── */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[
          { label: 'Total Apps', value: apps.length, icon: <Apps />, color: '#7c3aed' },
          { label: 'Total Storage Used', value: formatBytes(totalSize.toString()), icon: <StorageIcon />, color: '#2563eb' },
          { label: 'Active Apps', value: apps.filter(a => a.isActive).length, icon: <CheckCircle />, color: '#10b981' },
          { label: 'Categories', value: new Set(apps.map(a => a.category)).size, icon: <Android />, color: '#f59e0b' },
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ color: stat.color, display: 'flex' }}>{stat.icon}</Box>
                  <Box>
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, lineHeight: 1 }}>{stat.label}</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>{stat.value}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search by name or package…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            InputProps={{ startAdornment: <Search sx={{ mr: 1, color: 'text.secondary', fontSize: 18 }} /> }}
            sx={{ flexGrow: 1, minWidth: 220 }}
          />
          <TextField
            select
            size="small"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            sx={{ minWidth: 160 }}
            label="Category"
          >
            <MenuItem value="ALL">All Categories</MenuItem>
            {CATEGORY_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Box>
      </Paper>

      {/* ── App Grid ───────────────────────────────────────────────────────── */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      ) : filteredApps.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 12,
            border: '2px dashed',
            borderColor: 'divider',
            borderRadius: 3,
            cursor: 'pointer',
          }}
          onClick={() => setUploadDialogOpen(true)}
        >
          <CloudUpload sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {searchQuery || filterCategory !== 'ALL' ? 'No apps match your filters' : 'Your App Vault is empty'}
          </Typography>
          <Typography variant="body2" color="text.disabled">
            {searchQuery || filterCategory !== 'ALL' ? 'Try adjusting your search' : 'Click here or the Upload button to add your first corporate APK'}
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredApps.map(app => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={app.id}>
              <Card
                sx={{
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: 'none',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: CATEGORY_COLORS[app.category] || '#6b7280',
                    boxShadow: `0 4px 20px ${CATEGORY_COLORS[app.category] || '#6b7280'}22`,
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1, p: 2.5 }}>
                  {/* App Icon Area */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                    <Box
                      sx={{
                        width: 52,
                        height: 52,
                        borderRadius: 2,
                        background: `linear-gradient(135deg, ${CATEGORY_COLORS[app.category] || '#6b7280'}33, ${CATEGORY_COLORS[app.category] || '#6b7280'}11)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Android sx={{ fontSize: 28, color: CATEGORY_COLORS[app.category] || '#6b7280' }} />
                    </Box>
                    <Chip
                      label={app.category}
                      size="small"
                      sx={{
                        backgroundColor: `${CATEGORY_COLORS[app.category] || '#6b7280'}15`,
                        color: CATEGORY_COLORS[app.category] || '#6b7280',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                      }}
                    />
                  </Box>

                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5, color: '#0f172a' }}>
                    {app.displayName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, fontFamily: 'monospace' }}>
                    {app.packageName}
                  </Typography>

                  {app.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.8rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {app.description}
                    </Typography>
                  )}

                  <Divider sx={{ my: 1.5 }} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="caption" color="text.disabled">Version</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>v{app.version}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.disabled">Size</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatBytes(app.fileSize)}</Typography>
                    </Box>
                  </Box>
                </CardContent>

                <CardActions sx={{ px: 2.5, pb: 2, pt: 0, gap: 1 }}>
                  <Tooltip title="Copy download URL for provisioning profiles">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ContentCopy sx={{ fontSize: 14 }} />}
                      onClick={() => copyUrl(app.id)}
                      sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: '0.75rem', flex: 1 }}
                    >
                      Copy URL
                    </Button>
                  </Tooltip>
                  <Tooltip title="Download APK">
                    <IconButton
                      size="small"
                      onClick={() => downloadApk(app.id)}
                      sx={{ color: 'text.secondary' }}
                    >
                      <Download fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove from Vault">
                    <IconButton
                      size="small"
                      onClick={() => { setAppToDelete(app); setDeleteDialogOpen(true); }}
                      sx={{ color: 'error.light' }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── Upload Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={uploadDialogOpen} onClose={() => !uploading && setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Upload APK to Vault</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            {/* Drop Zone */}
            <Box
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: '2px dashed',
                borderColor: isDragging ? 'primary.main' : selectedFile ? 'success.main' : 'divider',
                borderRadius: 3,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                bgcolor: isDragging ? 'primary.50' : selectedFile ? 'success.50' : 'grey.50',
                mb: 3,
              }}
            >
              <input ref={fileInputRef} type="file" accept=".apk" hidden onChange={handleFileInput} />
              {selectedFile ? (
                <>
                  <CheckCircle sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.dark' }}>{selectedFile.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{formatBytes(selectedFile.size.toString())} — click to change</Typography>
                </>
              ) : (
                <>
                  <CloudUpload sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>Drag & drop an APK here</Typography>
                  <Typography variant="caption" color="text.secondary">or click to browse your files</Typography>
                </>
              )}
            </Box>

            {/* Metadata form */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="App Name *" size="small" value={uploadForm.appName} onChange={e => setUploadForm(p => ({ ...p, appName: e.target.value }))} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Display Name *" size="small" value={uploadForm.displayName} onChange={e => setUploadForm(p => ({ ...p, displayName: e.target.value }))} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Package Name (e.g. com.company.app)" size="small" value={uploadForm.packageName} onChange={e => setUploadForm(p => ({ ...p, packageName: e.target.value }))} helperText="Unique identifier for this app in the system" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth label="Category" size="small" value={uploadForm.category} onChange={e => setUploadForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORY_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField fullWidth label="Version" size="small" value={uploadForm.version} onChange={e => setUploadForm(p => ({ ...p, version: e.target.value }))} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField fullWidth label="Version Code" size="small" type="number" value={uploadForm.versionCode} onChange={e => setUploadForm(p => ({ ...p, versionCode: e.target.value }))} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Description" size="small" multiline rows={2} value={uploadForm.description} onChange={e => setUploadForm(p => ({ ...p, description: e.target.value }))} />
              </Grid>
            </Grid>

            {/* Progress bar */}
            {uploading && (
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">Uploading…</Typography>
                  <Typography variant="caption" color="text.secondary">{uploadProgress}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={uploadProgress} sx={{ borderRadius: 2 }} />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setUploadDialogOpen(false)} disabled={uploading} variant="text" color="inherit">Cancel</Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !uploadForm.appName || uploading}
            variant="contained"
            startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <CloudUpload />}
            sx={{ background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)', textTransform: 'none', fontWeight: 600 }}
          >
            {uploading ? 'Uploading…' : 'Upload to Vault'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirm Dialog ──────────────────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Remove App from Vault</DialogTitle>
        <DialogContent>
          <Typography>
            Permanently remove <strong>{appToDelete?.displayName}</strong> from the vault? The APK file will be deleted from the server.
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Any provisioning profiles referencing this APK&apos;s URL will fail to install it on new devices.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} variant="text" color="inherit">Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error" sx={{ textTransform: 'none', fontWeight: 600 }}>
            Remove Permanently
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ───────────────────────────────────────────────────────── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))} sx={{ fontWeight: 600 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AppVaultPage;
