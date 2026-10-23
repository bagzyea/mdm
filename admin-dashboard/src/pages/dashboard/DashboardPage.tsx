import React, { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Alert,
  Button,
  Divider,
} from '@mui/material';
import {
  CloudOff,
  SdStorage,
  BatteryAlert,
  CheckCircleOutline,
  Refresh,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { websocketService } from '../../services/websocket';
import { DashboardStats, DeviceHealthSummary } from '../../types';
import { useAuthContext } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { StackedStatusBar, AttentionMeter, Segment } from '../../components/common/FleetCharts';
import logger from '../../utils/logger';

/** A panel. Deliberately plain — emphasis is spent on the numbers, not the chrome. */
const Panel: React.FC<{ title: string; caption?: string; children: React.ReactNode }> = ({
  title,
  caption,
  children,
}) => (
  <Paper
    variant="outlined"
    sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2 }}
  >
    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
      {title}
    </Typography>
    {caption && (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
        {caption}
      </Typography>
    )}
    {!caption && <Box sx={{ mb: 2.5 }} />}
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {children}
    </Box>
  </Paper>
);

/** A context figure. Quiet on purpose: these are reference, not alarms. */
const ContextFigure: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <Box>
    <Typography
      variant="h5"
      sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}
    >
      {typeof value === 'number' ? value.toLocaleString() : value}
    </Typography>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
  </Box>
);

const DashboardPage: React.FC = () => {
  const { isAuthenticated } = useAuthContext();
  const queryClient = useQueryClient();
  const [realTimeStats, setRealTimeStats] = useState<Partial<DashboardStats>>({});

  const retry = (failureCount: number, error: unknown) => {
    if ((error as { response?: { status?: number } })?.response?.status === 401) {
      queryClient.clear();
      return false;
    }
    return failureCount < 3;
  };

  const {
    data: stats,
    isLoading,
    error,
    refetch: refetchStats,
    dataUpdatedAt,
  } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats'],
    queryFn: () => apiService.getDashboardStats(),
    refetchInterval: 30000,
    enabled: isAuthenticated,
    retry,
  });

  const {
    data: healthSummary,
    isLoading: healthLoading,
    error: healthError,
    refetch: refetchHealth,
  } = useQuery<DeviceHealthSummary>({
    queryKey: ['deviceHealthSummary'],
    queryFn: () => apiService.getDeviceHealthSummary(),
    refetchInterval: 60000,
    enabled: isAuthenticated,
    retry,
  });

  const handleManualRefresh = async () => {
    await Promise.all([refetchStats(), refetchHealth()]);
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const handleDashboardUpdate = (data: Partial<DashboardStats>) => {
      setRealTimeStats((prev) => ({ ...prev, ...data }));
      refetchStats();
    };

    websocketService.subscribeToDashboardUpdates(handleDashboardUpdate);
    return () => {
      websocketService.off('dashboardUpdate', handleDashboardUpdate);
    };
  }, [refetchStats, isAuthenticated]);

  if (isLoading || healthLoading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  if (error || healthError) {
    logger.error('Dashboard data failed to load', { error, healthError });
    return (
      <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={handleManualRefresh}>
              Retry
            </Button>
          }
        >
          Could not reach the MDM server. Device figures below would be out of date, so
          they are hidden rather than shown stale.
        </Alert>
      </Box>
    );
  }

  const merged = { ...stats, ...realTimeStats };

  // ---- Fleet reachability -------------------------------------------------
  const totalDevices = merged.totalDevices ?? 0;
  const activeDevices = merged.activeDevices ?? 0;
  const reachablePct = totalDevices > 0 ? (activeDevices / totalDevices) * 100 : 0;

  // Counted by the server over the whole fleet (GET /devices/health/summary). These used
  // to be counted in the browser from the first page of the device list.
  const fleetSegments: Segment[] = [
    { label: 'Active', value: activeDevices, tone: 'good' },
    { label: 'Awaiting first report', value: merged.enrolledDevices ?? 0, tone: 'info' },
    { label: 'Inactive', value: merged.inactiveDevices ?? 0, tone: 'warning' },
    { label: 'Suspended', value: merged.suspendedDevices ?? 0, tone: 'critical' },
    { label: 'Revoked', value: merged.revokedDevices ?? 0, tone: 'neutral' },
  ];

  // ---- Needs attention, ranked by severity --------------------------------
  const healthTotal = healthSummary?.totalDevices ?? totalDevices;
  const alarms = healthSummary
    ? [
        {
          key: 'offline',
          icon: <CloudOff />,
          label: 'Not seen in 24 hours',
          value: healthSummary.offlineDevices,
          tone: 'critical' as const,
          hint: 'Devices whose last heartbeat is more than 24 hours old. Expected for enumerators out of network coverage — investigate if it persists past a field cycle.',
        },
        {
          key: 'storage',
          icon: <SdStorage />,
          label: 'Storage above 90%',
          value: healthSummary.lowStorageDevices,
          tone: 'warning' as const,
          hint: 'Devices with less than 10% storage free. Census forms and captured data may fail to save.',
        },
        {
          key: 'battery',
          icon: <BatteryAlert />,
          label: 'Battery below 20%',
          value: healthSummary.lowBatteryDevices,
          tone: 'warning' as const,
          hint: 'Devices last reporting under 20% charge.',
        },
      ]
    : [];

  const alarmsRaised = alarms.filter((a) => a.value > 0).length;

  // ---- Command outcomes ---------------------------------------------------
  const executed = merged.executedCommands ?? 0;
  const failed = merged.failedCommands ?? 0;
  const pending = merged.pendingCommands ?? 0;
  const settled = executed + failed;
  const successPct = settled > 0 ? (executed / settled) * 100 : 0;

  const commandSegments: Segment[] = [
    { label: 'Executed', value: executed, tone: 'good' },
    { label: 'Pending', value: pending, tone: 'warning' },
    { label: 'Failed', value: failed, tone: 'critical' },
  ];

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, sm: 3, md: 4 } }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3.5,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Fleet overview
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {totalDevices.toLocaleString()} census {totalDevices === 1 ? 'device' : 'devices'}{' '}
            enrolled
            {dataUpdatedAt
              ? ` · updated ${new Date(dataUpdatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : ''}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<Refresh />} onClick={handleManualRefresh}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Fleet reachability — the number the page leads with */}
        <Grid item xs={12} md={7}>
          <Panel
            title="Reporting devices"
            caption="Share of enrolled devices currently checking in"
          >
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 3 }}>
              <Typography
                sx={{
                  fontSize: 56,
                  fontWeight: 700,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {reachablePct.toFixed(0)}
                <Box component="span" sx={{ fontSize: 28, ml: 0.5 }}>
                  %
                </Box>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {activeDevices.toLocaleString()} of {totalDevices.toLocaleString()}
              </Typography>
            </Box>
            <StackedStatusBar segments={fleetSegments} total={totalDevices} />
          </Panel>
        </Grid>

        {/* Needs attention */}
        <Grid item xs={12} md={5}>
          <Panel
            title="Needs attention"
            caption={
              alarmsRaised === 0
                ? 'Nothing raised'
                : `${alarmsRaised} of ${alarms.length} checks raised`
            }
          >
            {alarmsRaised === 0 ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}>
                <CheckCircleOutline sx={{ color: 'text.disabled' }} />
                <Typography variant="body2" color="text.secondary">
                  No device is offline, low on storage, or low on battery.
                </Typography>
              </Box>
            ) : (
              <Box>
                {alarms.map((a, i) => (
                  <React.Fragment key={a.key}>
                    {i > 0 && <Divider />}
                    <AttentionMeter
                      icon={a.icon}
                      label={a.label}
                      value={a.value}
                      total={healthTotal}
                      tone={a.tone}
                      hint={a.hint}
                    />
                  </React.Fragment>
                ))}
              </Box>
            )}
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Command outcomes */}
        <Grid item xs={12} md={7}>
          <Panel
            title="Command outcomes"
            caption="All commands on record, by current state"
          >
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 3 }}>
              <Typography
                sx={{
                  fontSize: 40,
                  fontWeight: 700,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {settled > 0 ? `${successPct.toFixed(0)}%` : '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {settled > 0
                  ? `succeeded (${executed.toLocaleString()} of ${settled.toLocaleString()} settled)`
                  : 'no commands have settled yet'}
              </Typography>
            </Box>
            <StackedStatusBar
              segments={commandSegments}
              total={executed + failed + pending}
              emptyMessage="No commands issued yet"
            />
          </Panel>
        </Grid>

        {/* Context — quiet by design */}
        <Grid item xs={12} md={5}>
          <Panel title="Configuration" caption="Current system setup">
            <Grid container spacing={3}>
              <Grid item xs={6}>
                <ContextFigure label="Active policies" value={merged.activePolicies ?? 0} />
              </Grid>
              <Grid item xs={6}>
                <ContextFigure label="Policies total" value={merged.totalPolicies ?? 0} />
              </Grid>
              <Grid item xs={6}>
                <ContextFigure label="Admin users" value={merged.totalUsers ?? 0} />
              </Grid>
              <Grid item xs={6}>
                <ContextFigure label="Commands total" value={executed + failed + pending} />
              </Grid>
            </Grid>
          </Panel>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
