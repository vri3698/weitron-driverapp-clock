import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { ActionFlow } from './components/ActionFlow';
import { AdminPanel } from './components/AdminPanel';
import { ActionType, ClockEntry, Employee, ShiftState } from './types';
import { STORAGE_KEYS } from './constants';
import { storageService } from './services/storage';
import { fetchShiftState, syncEntryToServer } from './services/api';
import { startLocationWatch, stopLocationWatch, ensureLocationPermission } from './services/device';
import { isSubscribed, requestAndSubscribe } from './services/notifications';

const BREAK_MS = 30 * 60 * 1000;
const DEFAULT_BREAK_REMINDER_MS = 3.5 * 60 * 60 * 1000;

function getDateKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getShiftStorageKey(employeeId: string): string {
  return `driver_shift_state_${employeeId}`;
}

function createInitialShiftState(timestamp = Date.now()): ShiftState {
  return {
    dateKey: getDateKey(timestamp),
    phase: 'needs_clock_in',
    breakReminderSent: false,
  };
}

function normalizeShiftState(raw: string | null): ShiftState {
  if (!raw) return createInitialShiftState();
  try {
    const parsed = JSON.parse(raw) as Partial<ShiftState>;
    if (!parsed || !parsed.phase) return createInitialShiftState();
    return {
      dateKey: parsed.dateKey || getDateKey(),
      phase: parsed.phase,
      firstClockInAt: parsed.firstClockInAt,
      effectiveShiftStartAt: parsed.effectiveShiftStartAt,
      breakReminderAt: parsed.breakReminderAt,
      breakReminderSent: Boolean(parsed.breakReminderSent),
      breakStartedAt: parsed.breakStartedAt,
      postBreakClockInAt: parsed.postBreakClockInAt,
      dayCompletedAt: parsed.dayCompletedAt,
      source: parsed.source || 'local',
    };
  } catch {
    return createInitialShiftState();
  }
}

function applyShiftTransition(prev: ShiftState, action: ActionType, timestamp: number): ShiftState {
  const current = prev?.dateKey ? prev : createInitialShiftState(timestamp);
  const effectiveShiftStartAt = current.effectiveShiftStartAt ?? current.firstClockInAt ?? timestamp;

  if (action === 'Clock In') {
    if (!current.firstClockInAt) {
      return {
        ...current,
        dateKey: getDateKey(timestamp),
        phase: 'needs_clock_out',
        firstClockInAt: timestamp,
        effectiveShiftStartAt: timestamp,
        breakReminderAt: timestamp + DEFAULT_BREAK_REMINDER_MS,
        breakReminderSent: false,
        breakStartedAt: undefined,
        postBreakClockInAt: undefined,
        dayCompletedAt: undefined,
        source: 'local',
      };
    }

    return {
      ...current,
      phase: 'needs_clock_out',
      effectiveShiftStartAt,
      breakReminderAt: current.breakReminderAt ?? effectiveShiftStartAt + DEFAULT_BREAK_REMINDER_MS,
      postBreakClockInAt: timestamp,
      breakStartedAt: undefined,
      source: 'local',
    };
  }

  if (action === 'Clock Out') {
    if (!current.breakStartedAt && current.firstClockInAt && !current.postBreakClockInAt) {
      return {
        ...current,
        phase: 'on_break',
        breakStartedAt: timestamp,
        source: 'local',
      };
    }

    return {
      ...current,
      phase: 'needs_clock_in',
      dayCompletedAt: timestamp,
      source: 'local',
    };
  }

  return current;
}

function mergeShiftState(localState: ShiftState, remoteState: ShiftState | null): ShiftState {
  if (!remoteState) return localState;
  return {
    ...localState,
    ...remoteState,
    dateKey: remoteState.dateKey || localState.dateKey,
    source: remoteState.source || 'server',
  };
}

export default function App() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [action, setAction] = useState<ActionType | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [shiftState, setShiftState] = useState<ShiftState>(createInitialShiftState());

  const statusTimerRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);

  const showStatusMessage = useCallback((message: string) => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    setStatusMessage(message);
    statusTimerRef.current = window.setTimeout(() => setStatusMessage(null), 3500);
  }, []);

  const persistShiftState = useCallback((empId: string, state: ShiftState) => {
    localStorage.setItem(getShiftStorageKey(empId), JSON.stringify(state));
  }, []);

  const refreshShiftStateFromServer = useCallback(async (emp: Employee) => {
    try {
      const remote = await fetchShiftState(emp.id);
      if (!remote) return;
      setShiftState((prev) => {
        const merged = mergeShiftState(prev, remote);
        persistShiftState(emp.id, merged);
        return merged;
      });
    } catch (error) {
      console.warn('[Shift] Failed to refresh shift state:', error);
    }
  }, [persistShiftState]);

  useEffect(() => {
    const init = async () => {
      await storageService.init();
      const storedId = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID);
      const storedName = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_NAME);
      const storedLocation = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_LOCATION);

      if (storedId && storedName) {
        const emp: Employee = {
          id: storedId,
          name: storedName,
          locationName: storedLocation || undefined,
        };
        setEmployee(emp);
        setShiftState(normalizeShiftState(localStorage.getItem(getShiftStorageKey(storedId))));
      }

      setInitialized(true);
    };

    void init();
  }, []);

  useEffect(() => {
    if (!employee) {
      stopLocationWatch();
      setShiftState(createInitialShiftState());
      return;
    }

    startLocationWatch();
    setShiftState(normalizeShiftState(localStorage.getItem(getShiftStorageKey(employee.id))));
    void refreshShiftStateFromServer(employee);
  }, [employee, refreshShiftStateFromServer]);

  useEffect(() => {
    if (!employee) return;
    persistShiftState(employee.id, shiftState);
  }, [employee, shiftState, persistShiftState]);

  const syncPendingEntries = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;
    isSyncingRef.current = true;

    try {
      const pending = await storageService.getPendingEntries();
      for (const entry of pending) {
        const synced = await syncEntryToServer(entry, { offlineSync: true });
        if (synced) {
          await storageService.markAsSynced(entry.id);
        }
      }

      if (employee) {
        await refreshShiftStateFromServer(employee);
      }
    } catch (err) {
      console.error('[Sync] Failed:', err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [employee, refreshShiftStateFromServer]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void syncPendingEntries();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void syncPendingEntries();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncPendingEntries]);

  useEffect(() => () => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
  }, []);

  const ensureNotificationsReady = useCallback(async () => {
    try {
      const subscribed = await isSubscribed();
      if (!subscribed) {
        await requestAndSubscribe();
      }
    } catch (error) {
      console.warn('[Push] Subscription refresh failed:', error);
    }
  }, []);

  const handleLogin = async (emp: Employee) => {
    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_ID, emp.id);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_NAME, emp.name);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_LOCATION, emp.locationName ?? '');

    setEmployee(emp);
    setShiftState(normalizeShiftState(localStorage.getItem(getShiftStorageKey(emp.id))));
    showStatusMessage('Signed in successfully.');

    void ensureNotificationsReady();
    void syncPendingEntries();
    void refreshShiftStateFromServer(emp);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.EMPLOYEE_ID);
    localStorage.removeItem(STORAGE_KEYS.EMPLOYEE_NAME);
    localStorage.removeItem(STORAGE_KEYS.EMPLOYEE_LOCATION);
    setEmployee(null);
    setAction(null);
    setShiftState(createInitialShiftState());
  };

  const handleActionRequest = async (targetAction: ActionType) => {
    const ok = await ensureLocationPermission();
    if (!ok) {
      showStatusMessage('Please turn on location and allow access before proceeding.');
      return;
    }
    setAction(targetAction);
  };

  const handleActionComplete = async (entry: ClockEntry): Promise<boolean> => {
    const normalizedEntry: ClockEntry = {
      ...entry,
      location: entry.location
        ? {
          ...entry.location,
          address: entry.location.address?.trim() ? entry.location.address : 'Not found',
        }
        : null,
      synced: false,
    };

    await storageService.saveEntry(normalizedEntry);
    setShiftState((prev) => applyShiftTransition(prev, normalizedEntry.action, normalizedEntry.timestamp));

    void (async () => {
      try {
        if (!navigator.onLine) return;
        const synced = await syncEntryToServer(normalizedEntry, { offlineSync: false });
        if (synced) {
          await storageService.markAsSynced(normalizedEntry.id);
          if (employee) await refreshShiftStateFromServer(employee);
        }
      } catch (error) {
        console.warn('[Action] Background upload failed:', error);
      }
    })();

    return true;
  };

  const handleActionDone = (_synced: boolean, completedAction: ActionType) => {
    setAction(null);
    showStatusMessage(`${completedAction} saved. Upload continues in background.`);
  };

  const handleEndBreak = () => {
    setShiftState((prev) => ({ ...prev, phase: 'needs_clock_in' }));
    showStatusMessage('Break ended. Please clock in to resume work.');
  };

  const nextAction: ActionType | null = useMemo(() => {
    if (shiftState.phase === 'needs_clock_in') return 'Clock In';
    if (shiftState.phase === 'needs_clock_out') return 'Clock Out';
    return null;
  }, [shiftState.phase]);

  const breakEndsAt = shiftState.phase === 'on_break' && shiftState.breakStartedAt
    ? shiftState.breakStartedAt + BREAK_MS
    : null;

  const isAdmin = new URLSearchParams(window.location.search).get('admin') === '1';
  if (isAdmin) return <AdminPanel />;

  if (!initialized) {
    return <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-white">Loading…</div>;
  }

  if (!employee) return <Login onLogin={handleLogin} />;

  if (action) {
    return (
      <ActionFlow
        action={action}
        employee={employee}
        onComplete={handleActionComplete}
        onDone={handleActionDone}
        onCancel={() => setAction(null)}
      />
    );
  }

  return (
    <Dashboard
      employee={employee}
      isOnline={isOnline}
      onActionSelect={handleActionRequest}
      onLogout={handleLogout}
      statusMessage={statusMessage}
      nextAction={nextAction}
      isOnBreak={shiftState.phase === 'on_break'}
      breakEndsAt={breakEndsAt}
      onEndBreak={handleEndBreak}
    />
  );
}
