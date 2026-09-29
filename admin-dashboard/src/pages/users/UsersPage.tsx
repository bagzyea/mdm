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
} from '@mui/material';
import {
  PersonAdd,
  Edit,
  Delete,
  Block,
  CheckCircle,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { useAuthContext } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}
interface CreateUserData {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
}
const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuthContext();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<CreateUserData>({
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'VIEWER',
  });
  const fetchUsers = async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching users...');
      const usersData = await apiService.getUsers({ limit: 100 });
      console.log('👥 Users fetched:', { 
        count: usersData.data?.length || 0, 
        total: usersData.pagination?.total || 0,
        hasPagination: !!usersData.pagination
      });
      
      // Map the API response to the local User interface
      const mappedUsers: User[] = (usersData.data || []).map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role as 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER',
        isActive: user.isActive,
        createdAt: user.createdAt,
        ...(user.lastLogin !== undefined ? { lastLogin: user.lastLogin } : {}),
      }));
      setUsers(mappedUsers);
      setError(null);
      console.log('✅ Users loaded successfully:', mappedUsers.length);
    } catch (err: any) {
      console.error('❌ Error fetching users:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchUsers();
  }, []);
  const handleCreateUser = async () => {
    try {
      console.log('🔄 Creating user:', formData.username);
      await apiService.createUser(formData);
      await fetchUsers();
      handleCloseDialog();
      setError(null);
      console.log('✅ User created successfully');
    } catch (err: any) {
      console.error('❌ Error creating user:', err);
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create user');
    }
  };
  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const updateData = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
      };
      await apiService.put(`/auth/users/${editingUser.id}`, updateData);
      await fetchUsers();
      handleCloseDialog();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to update user');
    }
  };
  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      // There is no /status route; this 404'd, so accounts could not be deactivated.
      await apiService.put(`/auth/users/${userId}`, { isActive: !isActive });
      await fetchUsers();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to update user status');
    }
  };
  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await apiService.delete(`/auth/users/${userId}`);
      await fetchUsers();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to delete user');
    }
  };
  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        email: user.email,
        password: '',
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: '',
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        role: 'VIEWER',
      });
    }
    setOpenDialog(true);
  };
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingUser(null);
    setShowPassword(false);
  };
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'error';
      case 'ADMIN':
        return 'warning';
      case 'OPERATOR':
        return 'primary';
      case 'VIEWER':
        return 'default';
      default:
        return 'default';
    }
  };
  const canManageUsers = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
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
          User Management
        </Typography>
        {canManageUsers && (
          <Button
            variant="contained"
            startIcon={<PersonAdd />}
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
            Add User
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ borderRadius: 2, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)', border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
              <CircularProgress size={32} thickness={4} />
              <Typography variant="body2" color="text.secondary">Loading users...</Typography>
            </Box>
          ) : (
            <TableContainer sx={{ overflowX: 'auto', borderRadius: 0 }}>
              <Table sx={{ minWidth: 800 }}>
                <TableHead sx={{ backgroundColor: '#fafafa', borderBottom: '2px solid', borderColor: 'divider' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Username</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Role</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Created</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Last Login</TableCell>
                    {canManageUsers && <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', py: 1.5 }}>Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                          {user.firstName} {user.lastName}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{user.username}</Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{user.email}</Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: getRoleColor(user.role) === 'error' ? '#ef4444' : getRoleColor(user.role) === 'warning' ? '#f59e0b' : getRoleColor(user.role) === 'primary' ? '#8b5cf6' : '#64748b' }}>
                          {user.role.replace('_', ' ')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                        <Chip
                          label={user.isActive ? 'Active' : 'Inactive'}
                          color={user.isActive ? 'success' : 'error'}
                          size="small"
                          sx={{ fontWeight: 600, borderRadius: 1, height: 24, fontSize: '0.7rem' }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {new Date(user.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                        </Typography>
                      </TableCell>
                      {canManageUsers && (
                        <TableCell align="right" sx={{ py: 1.5, borderBottom: '1px solid', borderColor: '#f1f5f9' }}>
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="Edit User">
                              <IconButton size="small" onClick={() => handleOpenDialog(user)} sx={{ color: 'text.secondary', '&:hover': { color: 'warning.main', bgcolor: 'warning.50' } }}>
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={user.isActive ? 'Deactivate' : 'Activate'}>
                              <IconButton
                                size="small"
                                onClick={() => handleToggleActive(user.id, user.isActive)}
                                sx={{ color: user.isActive ? '#f59e0b' : '#10b981', '&:hover': { bgcolor: user.isActive ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)' } }}
                              >
                                {user.isActive ? <Block fontSize="small" /> : <CheckCircle fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                            {currentUser?.role === 'SUPER_ADMIN' && user.id !== currentUser.id && (
                              <Tooltip title="Delete User">
                                <IconButton size="small" onClick={() => handleDeleteUser(user.id)} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'error.50' } }}>
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={canManageUsers ? 8 : 7} align="center">
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Card>

      {/* Add/Edit User Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingUser ? 'Edit User' : 'Create New User'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                disabled={!!editingUser}
                helperText="Use their UBOS domain username (e.g. allan.agaba) so they can sign in with AD"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              />
            </Grid>
            {!editingUser && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  helperText={`Must be at least 8 characters with uppercase, lowercase, number, and special character (!@#$%^&*(),.?":{}|<>)`}
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    ),
                  }}
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={formData.role}
                  label="Role"
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                >
                  <MenuItem value="VIEWER">Viewer</MenuItem>
                  <MenuItem value="OPERATOR">Operator</MenuItem>
                  <MenuItem value="ADMIN">Admin</MenuItem>
                  {currentUser?.role === 'SUPER_ADMIN' && (
                    <MenuItem value="SUPER_ADMIN">Super Admin</MenuItem>
                  )}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={editingUser ? handleUpdateUser : handleCreateUser}
            variant="contained"
          >
            {editingUser ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default UsersPage;