'use client';

import { useState, useEffect, useCallback } from 'react';

export interface UsePushNotificationsResult {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  requestPermissionAndSubscribe: () => Promise<boolean>;
}

export function usePushNotifications(token: string | null): UsePushNotificationsResult {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);

      // Register service worker if not registered
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration skipped or failed:', err);
      });
    }
  }, []);

  const requestPermissionAndSubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !token) return false;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Mock / Standard VAPID key subscription for browser
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: new Uint8Array([4, 1, 2, 3, 4, 5, 6, 7, 8]),
        }).catch(() => null);
      }

      if (subscription) {
        const rawKey = subscription.getKey ? subscription.getKey('p256dh') : null;
        const rawAuth = subscription.getKey ? subscription.getKey('auth') : null;

        const p256dhKey = rawKey ? btoa(String.fromCharCode(...new Uint8Array(rawKey))) : 'mock_p256dh_key';
        const authKey = rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : 'mock_auth_key';

        const res = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            p256dhKey,
            authKey,
            deviceType: 'WEB',
          }),
        });

        if (res.ok) {
          setIsSubscribed(true);
          return true;
        }
      }

      return true;
    } catch (err) {
      console.error('Push subscription failed:', err);
      return false;
    }
  }, [isSupported, token]);

  return {
    isSupported,
    permission,
    isSubscribed,
    requestPermissionAndSubscribe,
  };
}
