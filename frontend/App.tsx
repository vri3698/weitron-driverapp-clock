import { useCallback, useEffect, useRef, useState } from 'react';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { ActionFlow } from './components/ActionFlow';
import { AdminPanel } from './components/AdminPanel';
import { ActionType, ClockEntry, Employee } from './types';
import { STORAGE_KEYS } from './constants';
import { storageService } from './services/storage';
import { syncEntryToServer } from './services/api';
import { startLocationWatch, stopLocationWatch } from './services/device';
import { showLocalNotification } from './services/notifications';

type ShiftPhase = 'needs_clock_in' | 'needs_clock_out' | 'on_break' | 'day_complete';

interface ShiftState {
  dateKey: string;
  phase: ShiftPhase;
  firstClockInAt?: number;
  breakReminderAt?: number;
  breakReminderSent?: boolean;
  breakStartedAt?: number;
  postBreakClockInAt?: number;
  dayCompletedAt?: number;
}

const BREAK_MS = 30 * 60 * 1000;
const BREAK_REMINDER_MS = 10 * 60 * 1000;//changed to 10 mins for testing - should be 3.5*60*60*1000

function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getShiftStorageKey(employeeId: string): string {
  return `driver_shift_state_${employeeId}`;
}

function createInitialShiftState(): ShiftState {
  return { dateKey: getTodayKey(), phase: 'needs_clock_in', breakReminderSent: false };
}

function normalizeShiftState(raw: string | null): ShiftState {
  if (!raw) return createInitialShiftState();
  try {
    const parsed = JSON.parse(raw) as ShiftState;
    if (!parsed?.dateKey || parsed.dateKey !== getTodayKey()) return createInitialShiftState();
    if (!parsed.phase) return createInitialShiftState();
    return parsed;
  } catch {
    return createInitialShiftState();
  }
}

function applyShiftTransition(prev: ShiftState, action: ActionType, timestamp: number): ShiftState {
  if (action === 'Clock In') {
    if (!prev.firstClockInAt) {
      return {
        ...prev,
        phase: 'needs_clock_out',
        firstClockInAt: timestamp,
        breakReminderAt: timestamp + BREAK_REMINDER_MS,
        breakReminderSent: false,
      };
    }

    if (prev.phase === 'needs_clock_in') {
      return {
        ...prev,
        phase: 'needs_clock_out',
        postBreakClockInAt: timestamp,
      };
    }

    return prev;
  }

  if (prev.phase !== 'needs_clock_out') return prev;

  // First clock-out after first clock-in starts break mode
  if (!prev.breakStartedAt && prev.firstClockInAt && !prev.postBreakClockInAt) {
    return {
      ...prev,
      phase: 'on_break',
      breakStartedAt: timestamp,
    };
  }

  // Next clock out
  if (prev.postBreakClockInAt) {
    return {
      ...prev,
      phase: 'needs_clock_in',
      dayCompletedAt: undefined
    };
  }

  return { ...prev, phase: 'needs_clock_in' };
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

  useEffect(() => {
    const init = async () => {
      await storageService.init();
      const storedId = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID);
      const storedName = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_NAME);
      const storedLocation = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_LOCATION);
      if (storedId && storedName) {
        setEmployee({ id: storedId, name: storedName, locationName: storedLocation || undefined });
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
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    localStorage.setItem(getShiftStorageKey(employee.id), JSON.stringify(shiftState));
  }, [employee, shiftState]);

  const syncPendingEntries = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;
    isSyncingRef.current = true;
    try {
      const pending = await storageService.getPendingEntries();
      for (const entry of pending) {
        if (await syncEntryToServer(entry, { offlineSync: true })) {
          await storageService.markAsSynced(entry.id);
        }
      }
    } catch (err) {
      console.error('[Sync] Failed:', err);
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

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

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    };
  }, []);

  const showStatusMessage = (message: string) => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    setStatusMessage(message);
    statusTimerRef.current = window.setTimeout(() => setStatusMessage(null), 3000);
  };

  const fireBreakReminder = useCallback(async () => {
    if (!employee) return;
    const notified = await showLocalNotification(
      'Break Reminder',
      'Please take a break now!',
      '/'
    );
    if (notified) {
      showStatusMessage('Break reminder sent.');
    }
    setShiftState((prev) => ({ ...prev, breakReminderSent: true }));
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    if (shiftState.phase !== 'needs_clock_out') return;
    if (shiftState.breakReminderSent) return;
    if (!shiftState.breakReminderAt) return;
    if (shiftState.breakStartedAt || shiftState.postBreakClockInAt) return;

    const delay = shiftState.breakReminderAt - Date.now();
    if (delay <= 0) {
      void fireBreakReminder();
      return;
    }

    const timer = window.setTimeout(() => void fireBreakReminder(), Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [employee, fireBreakReminder, shiftState]);

  const handleLogin = (emp: Employee) => {
    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_ID, emp.id);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_NAME, emp.name);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_LOCATION, emp.locationName ?? '');
    setEmployee(emp);
    setShiftState(normalizeShiftState(localStorage.getItem(getShiftStorageKey(emp.id))));
    showStatusMessage('Signed in successfully');
    void syncPendingEntries();
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.EMPLOYEE_ID);
    localStorage.removeItem(STORAGE_KEYS.EMPLOYEE_NAME);
    localStorage.removeItem(STORAGE_KEYS.EMPLOYEE_LOCATION);
    setEmployee(null);
    setAction(null);
  };

  const handleActionComplete = async (entry: ClockEntry): Promise<boolean> => {
    await storageService.saveEntry(entry);
    setShiftState((prev) => applyShiftTransition(prev, entry.action, entry.timestamp));

    let synced = false;
    if (isOnline) {
      synced = await syncEntryToServer(entry, { offlineSync: false });
      if (synced) await storageService.markAsSynced(entry.id);
    }
    return synced;
  };

  const handleActionDone = (synced: boolean, completedAction: ActionType) => {
    setAction(null);
    showStatusMessage(
      synced
        ? `${completedAction} saved successfully.`
        : `${completedAction} saved locally — will sync when online.`
    );
  };

  const handleEndBreak = () => {
    setShiftState((prev) => ({ ...prev, phase: 'needs_clock_in' }));
    showStatusMessage('Break ended. Please clock in to resume work.');
  };

  const nextAction: ActionType | null =
    shiftState.phase === 'needs_clock_in'
      ? 'Clock In'
      : shiftState.phase === 'needs_clock_out'
        ? 'Clock Out'
        : null;

  const breakEndsAt = shiftState.phase === 'on_break' && shiftState.breakStartedAt
    ? shiftState.breakStartedAt + BREAK_MS
    : null;

  const isAdmin = new URLSearchParams(window.location.search).get('admin') === '1';
  if (isAdmin) return <AdminPanel />;

  if (!initialized) {
    return <div className="min-h-dvh flex items-center justify-center bg-slate-900 text-white">Loading…</div>;
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
      onActionSelect={setAction}
      onLogout={handleLogout}
      statusMessage={statusMessage}
      nextAction={nextAction}
      isOnBreak={shiftState.phase === 'on_break'}
      breakEndsAt={breakEndsAt}
      onEndBreak={handleEndBreak}
    />
  );
}
