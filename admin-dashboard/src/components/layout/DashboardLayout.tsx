import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Avatar,
  Badge,
  Tooltip,
  Collapse,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Devices,
  Security,
  Send,
  People,
  Settings,
  SwapHoriz as SwapHorizIcon,
  Delete as DeleteIcon,
  Logout,
  AccountCircle,
  Notifications,
  Build as BuildIcon,
  Assignment as AssignmentIcon,
  ExpandLess,
  ExpandMore,
  Folder as FolderIcon,
  CloudDownload as CloudDownloadIcon,
  Search as SearchIcon,
  Map as MapIcon,
  List as ListIcon,
  Inventory2 as VaultIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications, Notification } from '../../contexts/NotificationContext';

const drawerWidth = 280;

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ReactElement;
  path: string;
  requiredPermission?: { resource: string; action: string };
  requiredRole?: string[];
  children?: NavigationItem[];
}

const navigationItems: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <Dashboard />,
    path: '/dashboard',
  },
  {
    id: 'devices',
    label: 'Devices',
    icon: <Devices />,
    path: '/dashboard/devices',
    requiredPermission: { resource: 'devices', action: 'read' },
    children: [
      {
        id: 'devices-list',
        label: 'Device List',
        icon: <ListIcon />,
        path: '/dashboard/devices',
        requiredPermission: { resource: 'devices', action: 'read' },
      },
      {
        id: 'devices-map',
        label: 'Map View',
        icon: <MapIcon />,
        path: '/dashboard/devices/map',
        requiredPermission: { resource: 'devices', action: 'read' },
      },
      {
        id: 'device-transfer',
        label: 'Device Transfer',
        icon: <SwapHorizIcon />,
        path: '/dashboard/devices/transfer',
        requiredPermission: { resource: 'devices', action: 'write' },
      },
      {
        id: 'device-retirement',
        label: 'Device Retirement',
        icon: <DeleteIcon />,
        path: '/dashboard/devices/retirement',
        requiredPermission: { resource: 'devices', action: 'write' },
      },
    ],
  },
  {
    id: 'provisioning',
    label: 'Provisioning',
    icon: <BuildIcon />,
    path: '/dashboard/provisioning',
    requiredPermission: { resource: 'provisioning', action: 'read' },
    children: [
      {
        id: 'provisioning-profiles',
        label: 'Profiles',
        icon: <AssignmentIcon />,
        path: '/dashboard/provisioning/profiles',
        requiredPermission: { resource: 'provisioning', action: 'read' },
      },
      {
        id: 'provisioning-sessions',
        label: 'Sessions',
        icon: <BuildIcon />,
        path: '/dashboard/provisioning/sessions',
        requiredPermission: { resource: 'provisioning', action: 'read' },
      },
      {
        id: 'field-configurations',
        label: 'Field Configurations',
        icon: <FolderIcon />,
        path: '/dashboard/provisioning/field-configurations',
        requiredPermission: { resource: 'provisioning', action: 'read' },
      },
      {
        id: 'bulk-deployment',
        label: 'Bulk Deployment',
        icon: <CloudDownloadIcon />,
        path: '/dashboard/provisioning/bulk-deployment',
        requiredPermission: { resource: 'provisioning', action: 'read' },
      },
      {
        id: 'device-model-recognition',
        label: 'Device Recognition',
        icon: <SearchIcon />,
        path: '/dashboard/provisioning/device-model-recognition',
        requiredPermission: { resource: 'provisioning', action: 'read' },
      },
    ],
  },
  {
    id: 'policies',
    label: 'Policies',
    icon: <Security />,
    path: '/dashboard/policies',
    requiredPermission: { resource: 'policies', action: 'read' },
  },
  {
    id: 'commands',
    label: 'Commands',
    icon: <Send />,
    path: '/dashboard/commands',
    requiredPermission: { resource: 'commands', action: 'read' },
  },
  {
    id: 'app-vault',
    label: 'App Vault',
    icon: <VaultIcon />,
    path: '/dashboard/app-vault',
    requiredPermission: { resource: 'provisioning', action: 'read' },
  },
  {
    id: 'users',
    label: 'Users',
    icon: <People />,
    path: '/dashboard/users',
    requiredPermission: { resource: 'users', action: 'read' },
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings />,
    path: '/dashboard/settings',
  },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const notificationTypeColors: Record<string, string> = {
  commandFailed: '#dc2626',
  deviceOffline: '#d97706',
  securityViolation: '#7c3aed',
  info: '#0891b2',
};

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifAnchorEl, setNotifAnchorEl] = useState<null | HTMLElement>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission, hasRole } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleProfileMenuClose();
    await logout();
    navigate('/login');
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleExpandItem = (itemId: string) => {
    setExpandedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  // Filter navigation items based on permissions
  const visibleNavigationItems = navigationItems.filter(item => {
    if (item.requiredRole && !hasRole(...item.requiredRole)) {
      return false;
    }
    if (item.requiredPermission && !hasPermission(item.requiredPermission.resource, item.requiredPermission.action)) {
      return false;
    }
    return true;
  });

  const renderNavigationItem = (item: NavigationItem, level: number = 0) => {
    const isActive = location.pathname === item.path || 
      (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.id);

    return (
      <Box key={item.id}>
        <ListItem disablePadding>
          <ListItemButton
            selected={isActive}
            onClick={() => {
              if (hasChildren) {
                handleExpandItem(item.id);
              } else {
                handleNavigation(item.path);
              }
            }}
            sx={{
              minHeight: 48,
              px: 2.5 + level * 2,
              borderRadius: 0,
              mx: level === 0 ? 0 : 2,
              mb: level === 0 ? 0 : 0.5,
              '&.Mui-selected': {
                backgroundColor: level === 0 ? 'primary.main' : 'rgba(37, 99, 235, 0.1)',
                color: level === 0 ? 'primary.contrastText' : 'primary.main',
                fontWeight: 600,
                '& .MuiListItemIcon-root': {
                  color: level === 0 ? 'primary.contrastText' : 'primary.main',
                },
                '&:hover': {
                  backgroundColor: level === 0 ? 'primary.dark' : 'rgba(37, 99, 235, 0.15)',
                },
                '&::before': level === 0 ? {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  backgroundColor: 'primary.contrastText',
                } : {},
              },
              '&:hover': {
                backgroundColor: level === 0 ? 'rgba(37, 99, 235, 0.08)' : 'rgba(37, 99, 235, 0.05)',
                borderRadius: 0,
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: 3,
                justifyContent: 'center',
              }}
            >
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} />
            {hasChildren && (
              isExpanded ? <ExpandLess /> : <ExpandMore />
            )}
          </ListItemButton>
        </ListItem>
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {item.children!.map(child => renderNavigationItem(child, level + 1))}
            </List>
          </Collapse>
        )}
      </Box>
    );
  };

  const drawer = (
    <Box>
      {/* Logo/Brand */}
      <Box sx={{ 
        p: 3, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 2,
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(124, 58, 237, 0.05) 100%)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
      }}>
        <img 
          src="/ubos_logo.png" 
          alt="UBOS Logo" 
          style={{ 
            width: 32, 
            height: 32, 
            borderRadius: '50%',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }} 
        />
        <Typography 
          variant="h6" 
          noWrap 
          component="div"
          sx={{ 
            fontWeight: 700,
            background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
          }}
        >
          UBOS MDM
        </Typography>
      </Box>
      <Divider />

      {/* Navigation */}
      <List sx={{ px: 2, pt: 2 }}>
        {visibleNavigationItems.map((item) => renderNavigationItem(item))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          {/* Page Title */}
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {visibleNavigationItems.find(item => 
              location.pathname === item.path || 
              (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
            )?.label || 'Dashboard'}
          </Typography>

          {/* Notifications */}
          <Tooltip title="Notifications">
            <IconButton color="inherit" onClick={(e) => setNotifAnchorEl(e.currentTarget)}>
              <Badge badgeContent={unreadCount} color="error">
                <Notifications />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* User Profile */}
          <Tooltip title="Account">
            <IconButton
              size="large"
              edge="end"
              onClick={handleProfileMenuOpen}
              color="inherit"
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user?.firstName?.[0] || user?.username?.[0] || <AccountCircle />}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Profile Menu */}
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        keepMounted
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
      >
        <MenuItem disabled>
          <Box>
            <Typography variant="body2" fontWeight="bold">
              {user?.firstName} {user?.lastName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.email}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Role: {user?.role}
            </Typography>
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleNavigation('/dashboard/settings')}>
          <ListItemIcon>
            <Settings fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>

      {/* Notification Drawer */}
      <Menu
        anchorEl={notifAnchorEl}
        open={Boolean(notifAnchorEl)}
        onClose={() => setNotifAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 360, maxHeight: 480 } } }}
      >
        <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontSize="1rem">Notifications</Typography>
          {unreadCount > 0 && (
            <Typography
              variant="caption"
              sx={{ cursor: 'pointer', color: 'primary.main' }}
              onClick={markAllAsRead}
            >
              Mark all read
            </Typography>
          )}
        </Box>
        <Divider />
        {notifications.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No notifications</Typography>
          </Box>
        ) : (
          notifications.map((n: Notification) => (
            <MenuItem
              key={n.id}
              onClick={() => { markAsRead(n.id); }}
              sx={{
                whiteSpace: 'normal',
                py: 1.5,
                backgroundColor: n.read ? 'transparent' : 'rgba(37, 99, 235, 0.04)',
              }}
            >
              <Box sx={{ display: 'flex', gap: 1.5, width: '100%' }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    mt: 0.8,
                    flexShrink: 0,
                    backgroundColor: n.read ? 'transparent' : (notificationTypeColors[n.type] || '#64748b'),
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={n.read ? 400 : 600} noWrap>
                    {n.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {n.message}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {n.timestamp.toLocaleTimeString()}
                  </Typography>
                </Box>
              </Box>
            </MenuItem>
          ))
        )}
      </Menu>

      {/* Drawer */}
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          backgroundColor: 'background.default',
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
};

export default DashboardLayout;