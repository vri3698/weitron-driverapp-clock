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
  nextAction: ActionType | null;
  isOnBreak: boolean;
  breakEndsAt: number | null;
  onEndBreak: () => void;
}

/** True when running as an installed PWA (standalone mode). */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** True when running on iOS Safari. */
function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
}

async function hasLocationPermission(fallbackPreferred = false): Promise<boolean> {
  if (!navigator.geolocation) return false;
  if (!navigator.permissions?.query) return fallbackPreferred;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
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
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
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
  nextAction,
  isOnBreak,
  breakEndsAt,
  onEndBreak,
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
  const setupComplete = locationReady && notifReady;
  const actionsLocked = !setupComplete || isOnBreak;

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

  const handleActionClick = () => {
    if (!nextAction) return;
    if (actionsLocked) {
      setSetupMsg('Please enable Location and Notifications before clock actions.');
      return;
    }
    onActionSelect(nextAction);
  };

    const breakRemaining = isOnBreak && breakEndsAt ? formatRemaining(breakEndsAt - now) : '00:00';
  const hasFinishedDay = nextAction === null && !isOnBreak;

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_55%)] bg-slate-950 px-4 py-3 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-md items-center justify-center">
        <div className="flex w-full max-h-[calc(100dvh-1.5rem)] flex-col gap-3 overflow-y-auto rounded-[28px] border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/30 backdrop-blur">
          {/* Header: employee + sign out */}
          <div className="flex items-start justify-between rounded-2xl bg-slate-800/80 p-3">
            <div>
              <p className="text-xs text-slate-400">{employee.id}</p>
              <p className="text-lg font-semibold">{employee.name}</p>
              {employee.locationName ? (
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  <MapPin size={14} />
                  {employee.locationName}
                </div>
              ) : null}
            </div>
            <button
              onClick={onLogout}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              Sign out
            </button>
          </div>

          {/* Online/offline status */}
          <div
            className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-xs ${
              isOnline ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'
            }`}
          >
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline ? 'Online and ready' : 'Offline — will sync later'}
          </div>

          {/* Status message from actions */}
          {statusMessage ? (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-900/40 px-3 py-2 text-xs text-emerald-300">
              <CheckCircle2 size={14} />
              {statusMessage}
            </div>
          ) : null}

          {/* Setup card */}
          {!setupComplete || !localStorage.getItem(setupDoneKey) ? (
            <div className="rounded-2xl border border-indigo-700/40 bg-indigo-950/40 p-3">
              <p className="mb-2 text-xs font-semibold text-indigo-300">
                Complete setup before first clock action
              </p>
              <div className="grid gap-2">
                {!locationReady ? (
                  <button
                    onClick={() => void handleEnableLocation()}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-slate-700/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    <MapPin size={13} />
                    Turn on location
                  </button>
                ) : null}

                {!notifReady && !showIOSInstallPrompt ? (
                  <button
                    onClick={() => void handleEnableNotifications()}
                    disabled={notifStatus === 'loading'}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-slate-700/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-60"
                  >
                    <Bell size={13} />
                    {notifStatus === 'loading' ? 'Setting up…' : 'Turn on notifications'}
                  </button>
                ) : null}
              </div>

              {showIOSInstallPrompt ? (
                <div className="mt-3 rounded-xl border border-indigo-800/50 bg-slate-900/40 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-300">
                    <Share size={13} />
                    Add to Home Screen for notifications
                  </div>
                  <ol className="space-y-1 text-[11px] text-slate-400">
                    <li>1. Tap Share in Safari</li>
                    <li>2. Tap Add to Home Screen</li>
                    <li>3. Open the app from home screen</li>
                    <li>4. Return here and enable notifications</li>
                  </ol>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Break vs action card */}
          {isOnBreak ? (
            <div className="rounded-2xl border border-amber-600/40 bg-amber-950/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300">
                <Timer size={14} />
                Break in progress
              </div>
              <p className="mb-2 text-2xl font-bold tracking-wider text-amber-200">
                {breakRemaining}
              </p>
              <p className="mb-3 text-[11px] text-amber-100/80">
                30-minute break timer is running.
              </p>
              <button
                onClick={onEndBreak}
                className="w-full rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
              >
                End break
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-800/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-300">
                <Clock3 size={14} />
                Driver action
              </div>
              {hasFinishedDay ? (
                <p className="rounded-xl bg-emerald-900/30 px-3 py-3 text-center text-xs text-emerald-300">
                  Day complete. You can clock in again tomorrow.
                </p>
              ) : (
                <button
                  onClick={handleActionClick}
                  disabled={actionsLocked || !nextAction}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    nextAction === 'Clock In'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {nextAction === 'Clock In' ? <LogIn size={16} /> : <LogOut size={16} />}
                  {nextAction ?? 'Unavailable'}
                </button>
              )}
            </div>
          )}

          {/* Setup message line */}
          {setupMsg ? (
            <p className="text-center text-[11px] text-slate-400">{setupMsg}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}