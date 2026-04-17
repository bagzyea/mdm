import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { websocketService } from '../services/websocket';

export interface Notification {
  id: string;
  type: 'commandFailed' | 'deviceOffline' | 'securityViolation' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const MAX_NOTIFICATIONS = 20;

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((n: Omit<Notification, 'id' | 'read'>) => {
    setNotifications(prev => {
      const next: Notification = { ...n, id: `${Date.now()}_${Math.random()}`, read: false };
      return [next, ...prev].slice(0, MAX_NOTIFICATIONS);
    });
  }, []);

  useEffect(() => {
    const handleCommandUpdate = (data: any) => {
      if (data?.status === 'FAILED') {
        addNotification({
          type: 'commandFailed',
          title: 'Command Failed',
          message: `Command ${data.commandId ?? ''} on device ${data.deviceId ?? 'unknown'} failed.`,
          timestamp: new Date(),
        });
      }
    };

    const handleDeviceOffline = (data: any) => {
      const count = data?.count ?? 1;
      addNotification({
        type: 'deviceOffline',
        title: 'Device(s) Offline',
        message: count > 1
          ? `${count} devices went offline.`
          : 'A device went offline.',
        timestamp: new Date(),
      });
    };

    const handleSecurityViolation = (data: any) => {
      addNotification({
        type: 'securityViolation',
        title: 'Security Violation',
        message: data?.message ?? 'A security violation was detected.',
        timestamp: new Date(),
      });
    };

    websocketService.on('commandUpdate', handleCommandUpdate);
    websocketService.on('deviceOffline', handleDeviceOffline);
    websocketService.on('systemAlert', handleSecurityViolation);

    return () => {
      websocketService.off('commandUpdate', handleCommandUpdate);
      websocketService.off('deviceOffline', handleDeviceOffline);
      websocketService.off('systemAlert', handleSecurityViolation);
    };
  }, [addNotification]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};
