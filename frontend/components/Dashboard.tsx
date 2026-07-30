import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  MapPin,
  Share,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ActionType, Employee } from '../types';
import { getNotificationStatus, isSubscribed, requestAndSubscribe } from '../services/notifications';

interface DashboardProps {
  employee: Employee;
  isOnline: boolean;
  onActionSelect: (action: ActionType) => void;
  onLogout: () => void;
  statusMessage: string | null;
  nextAction?: ActionType | null;
  isOnBreak: boolean;
  breakEndsAt: number | null;
  onEndBreak?: () => void;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
}

async function hasLocationPermission(fallbackPreferred = false): Promise<boolean> {
  if (!navigator.geolocation) return false;
  if (!navigator.permissions?.query) return fallbackPreferred;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'granted';
  } catch {
    return fallbackPreferred;
  }
}

function requestLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function Dashboard({
  employee,
  isOnline,
  onActionSelect,
  onLogout,
  statusMessage,
  isOnBreak,
  breakEndsAt,
}: DashboardProps) {
  const [locationReady, setLocationReady] = useState(false);
  const [notifReady, setNotifReady] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'granted' | 'denied' | 'default' | 'unsupported' | 'loading'>('loading');
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const showIOSInstallPrompt = notifStatus === 'unsupported' && isIOS() && !isStandalone();
  const setupDoneKey = useMemo(() => `driver_setup_done_${employee.id}`, [employee.id]);
  const locationPrefKey = useMemo(() => `driver_pref_location_${employee.id}`, [employee.id]);
  const notifPrefKey = useMemo(() => `driver_pref_notif_${employee.id}`, [employee.id]);

  useEffect(() => {
    const refresh = async () => {
      const locationPreferred = localStorage.getItem(locationPrefKey) === '1';
      const locationGranted = await hasLocationPermission(locationPreferred);
      setLocationReady(locationGranted);

      const status = getNotificationStatus();
      setNotifStatus(status);
      const subscribed = await isSubscribed();
      const notificationsGranted = status === 'granted' && subscribed;
      setNotifReady(notificationsGranted);

      if (locationGranted && notificationsGranted) {
        localStorage.setItem(setupDoneKey, '1');
      }
    };

    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [locationPrefKey, notifPrefKey, setupDoneKey]);

  useEffect(() => {
    if (!isOnBreak || !breakEndsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOnBreak, breakEndsAt]);

  const handleEnableLocation = async () => {
    const ok = await requestLocationPermission();
    setLocationReady(ok);
    if (!ok) {
      setSetupMsg('Location permission is required before clock actions.');
      return;
    }
    localStorage.setItem(locationPrefKey, '1');
    setSetupMsg('Location enabled.');
  };

  const handleEnableNotifications = async () => {
    setNotifStatus('loading');
    const { ok, error } = await requestAndSubscribe();
    const status = getNotificationStatus();
    setNotifStatus(status);
    const subscribed = await isSubscribed();
    const ready = ok && status === 'granted' && subscribed;
    setNotifReady(ready);
    if (ready) localStorage.setItem(notifPrefKey, '1');
    setSetupMsg(ready ? 'Notifications enabled.' : (error ?? 'Could not enable notifications.'));
  };

  const handleActionClick = (targetAction: ActionType) => {
    if (!employee?.id?.trim()) {
      setSetupMsg('Employee ID is required before clock actions.');
      return;
    }
    if (!locationReady) {
      setSetupMsg('Please turn on location before proceeding.');
      void handleEnableLocation();
      return;
    }
    onActionSelect(targetAction);
  };

  const breakRemaining = isOnBreak && breakEndsAt ? formatRemaining(breakEndsAt - now) : '00:00';

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_55%)] bg-slate-950 px-4 text-white">
      <div
        className="mx-auto flex min-h-dvh max-w-md flex-col"
        style={{
          paddingTop: 'max(0.9rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.6rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="-mt-1 mb-2">
                  <img src="/weitron-logo.jpg" alt="Weitron" className="h-12 w-auto object-contain" />
                </div>
                <p className="text-sm text-slate-400">{employee.id}</p>
                <p className="text-[2rem] font-semibold leading-tight text-white">{employee.name}</p>
                {employee.locationName ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                    <MapPin size={16} />
                    <span className="truncate">{employee.locationName}</span>
                  </div>
                ) : null}
              </div>
              <button
                onClick={onLogout}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-slate-700 bg-slate-900/40 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>

          {statusMessage ? (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-900/35 px-4 py-3 text-sm text-emerald-300">
              <CheckCircle2 size={16} />
              <span>{statusMessage}</span>
            </div>
          ) : null}

          {(!localStorage.getItem(setupDoneKey) || !notifReady || !locationReady) ? (
            <div className="rounded-[28px] border border-indigo-700/40 bg-indigo-950/32 p-4">
              <p className="mb-3 text-sm font-semibold text-indigo-200">Recommended setup</p>
              <div className="grid gap-3">
                {!locationReady ? (
                  <button
                    onClick={() => void handleEnableLocation()}
                    className="flex items-center justify-center gap-2 whitespace-nowrap rounded-[24px] bg-slate-700/80 px-4 py-4 text-base font-medium text-slate-100 transition hover:bg-slate-700"
                  >
                    <MapPin size={18} />
                    Turn on location
                  </button>
                ) : null}

                {!notifReady && !showIOSInstallPrompt ? (
                  <button
                    onClick={() => void handleEnableNotifications()}
                    disabled={notifStatus === 'loading'}
                    className="flex items-center justify-center gap-2 whitespace-nowrap rounded-[24px] bg-slate-700/80 px-4 py-4 text-base font-medium text-slate-100 transition hover:bg-slate-700 disabled:opacity-60"
                  >
                    <Bell size={18} />
                    {notifStatus === 'loading' ? 'Setting up…' : 'Turn on notifications'}
                  </button>
                ) : null}

                {showIOSInstallPrompt ? (
                  <div className="mt-3 rounded-2xl border border-indigo-800/50 bg-slate-900/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-300">
                      <Share size={15} />
                      Add to Home Screen for notifications
                    </div>
                    <ol className="space-y-1 text-xs leading-5 text-slate-400">
                      <li>1. Tap Share in Safari</li>
                      <li>2. Tap Add to Home Screen</li>
                      <li>3. Open the app from home screen</li>
                      <li>4. Return here and enable notifications</li>
                    </ol>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="rounded-[28px] border border-slate-800 bg-slate-800/70 p-4">
            {isOnBreak ? (
              <>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-300">
                  <Timer size={16} />
                  Break in progress
                </div>
                <p className="mb-2 text-3xl font-bold tracking-wider text-amber-200">{breakRemaining}</p>
                <p className="mb-3 text-xs leading-5 text-amber-100/80">30-minute break timer is running.</p>
              </>
            ) : (
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
                <Clock3 size={16} />
                Driver action
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleActionClick('Clock In')}
                disabled={!employee?.id?.trim()}
                className="flex items-center justify-center gap-2 whitespace-nowrap rounded-[24px] bg-emerald-700/80 px-4 py-4 text-base font-semibold text-white transition hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogIn size={20} />
                Clock In
              </button>
              <button
                onClick={() => handleActionClick('Clock Out')}
                disabled={!employee?.id?.trim()}
                className="flex items-center justify-center gap-2 whitespace-nowrap rounded-[24px] bg-rose-600 px-4 py-4 text-base font-semibold text-white transition hover:bg-rose-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut size={20} />
                Clock Out
              </button>
            </div>
          </div>

          {setupMsg ? <p className="px-1 text-center text-xs leading-5 text-slate-400">{setupMsg}</p> : null}

          <div className="mt-auto flex items-end justify-center pt-1 text-sm">
            <div className={`flex items-center gap-2 ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span>{isOnline ? 'Online and ready' : 'Offline — will sync later'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
