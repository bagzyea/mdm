import React from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
} from '@mui/material';
import { Add } from '@mui/icons-material';

const DevicesPage: React.FC = () => {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Device Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => console.log('Add device')}
        >
          Enroll Device
        </Button>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Device Management Interface
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This will show a comprehensive list of all enrolled devices with their status,
            last seen time, assigned policies, and management actions. Features will include:
          </Typography>
          <Box component="ul" sx={{ mt: 2, pl: 2 }}>
            <li>Device enrollment and registration</li>
            <li>Real-time device status monitoring</li>
            <li>Device location tracking</li>
            <li>Policy assignment and compliance</li>
            <li>Remote command execution</li>
            <li>Device grouping and bulk operations</li>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default DevicesPage;