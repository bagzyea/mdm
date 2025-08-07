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
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Devices,
  Security,
  Send,
  People,
  Settings,
  Logout,
  AccountCircle,
  Notifications,
  AdminPanelSettings,
} from '@mui/icons-material';
import { useAuth } from '@/contexts/AuthContext';

const drawerWidth = 240;

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ReactElement;
  path: string;
  requiredPermission?: { resource: string; action: string };
  requiredRole?: string[];
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

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission, hasRole } = useAuth();

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

  const drawer = (
    <Box>
      {/* Logo/Brand */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AdminPanelSettings color="primary" />
        <Typography variant="h6" noWrap component="div">
          MDM Admin
        </Typography>
      </Box>
      <Divider />

      {/* Navigation */}
      <List>
        {visibleNavigationItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path));

          return (
            <ListItem key={item.id} disablePadding>
              <ListItemButton
                selected={isActive}
                onClick={() => handleNavigation(item.path)}
                sx={{
                  minHeight: 48,
                  px: 2.5,
                  '&.Mui-selected': {
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': {
                      color: 'primary.contrastText',
                    },
                    '&:hover': {
                      backgroundColor: 'primary.dark',
                    },
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
              </ListItemButton>
            </ListItem>
          );
        })}
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
            <IconButton color="inherit">
              <Badge badgeContent={3} color="error">
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
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
};

export default DashboardLayout;