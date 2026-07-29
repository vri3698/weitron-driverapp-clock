import { STORAGE_KEYS } from '../constants';

// Push notification service — permission, subscription, status

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type NotifStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationStatus(): NotifStatus {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotifStatus;
}

export async function requestAndSubscribe(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, error: 'Push notifications not supported in this browser.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, error: 'Notification permission denied.' };
    }

    const reg = await navigator.serviceWorker.ready;

    // Fetch VAPID public key from backend
    const keyRes = await fetch('/api/vapid-public-key');
    if (!keyRes.ok) throw new Error('Could not fetch push key');
    const { publicKey } = await keyRes.json() as { publicKey: string };

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const employeeId = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID) ?? '';
    const subRes = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, employeeId }),
    });
    if (!subRes.ok) throw new Error('Failed to register subscription');

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Push subscription error:', msg);
    return { ok: false, error: msg };
  }
}

export async function unsubscribeFromNotifications(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}

export async function isSubscribed(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

export async function showLocalNotification(
  title: string,
  body: string,
  url = '/'
): Promise<boolean> {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        data: { url },
        tag: 'driver-shift-reminder',
        renotify: true,
      });
      return true;
    }

    new Notification(title, { body });
    return true;
  } catch (err) {
    console.error('Local notification error:', err);
    return false;
  }
}
