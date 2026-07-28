import { ClockEntry } from '../types';
import { GAS_WEB_APP_URL, STORAGE_KEYS } from '../constants';

const DEMO_EMPLOYEES: Record<string, string> = {
  DEMO1: 'Alex Morgan',
  DEMO2: 'Priya Singh',
  DEMO3: 'Jordan Lee',
};

export async function verifyEmployeeAPI(
  employeeId: string
): Promise<{ valid: boolean; name?: string; locationName?: string; error?: string }> {
  // Demo mode when no GAS URL is configured
  if (!GAS_WEB_APP_URL) {
    const id = employeeId.trim().toUpperCase();
    const name = DEMO_EMPLOYEES[id];
    return name
      ? { valid: true, name }
      : { valid: false, error: 'Employee ID not found. Try DEMO1, DEMO2, or DEMO3.' };
  }

  try {
    // Calls /api/verify — handled server-side (Vite proxy in dev, Netlify function in prod).
    // No browser CORS restrictions apply.
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', employeeId }),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return (await res.json()) as { valid: boolean; name?: string; locationName?: string; error?: string };
  } catch {
    return { valid: false, error: 'Network error. Please check your connection.' };
  }
}

interface SyncEntryOptions {
  offlineSync?: boolean;
}

interface LegacyClockEntryShape {
  lat?: number;
  lng?: number;
  address?: string;
}

export async function syncEntryToServer(entry: ClockEntry, options?: SyncEntryOptions): Promise<boolean> {
  // Demo mode — treat as synced
  if (!GAS_WEB_APP_URL) return true;

  try {
    const legacy = entry as ClockEntry & LegacyClockEntryShape;
    const lat = entry.location?.lat ?? legacy.lat ?? '';
    const lng = entry.location?.lng ?? legacy.lng ?? '';
    const address = entry.location?.address ?? legacy.address ?? '';
    const locationName = entry.locationName ?? localStorage.getItem(STORAGE_KEYS.EMPLOYEE_LOCATION) ?? '';

    // Calls /api/clock — handled server-side (Vite proxy in dev, Netlify function in prod).
    const res = await fetch('/api/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'clock',
        entry: {
          id: entry.id,
          employeeId: entry.employeeId,
          employeeName: entry.employeeName,
          locationName,
          type: entry.action,
          timestamp: new Date(entry.timestamp).toISOString(),
          lat,
          lng,
          address,
          streetAddress: address,
          note: options?.offlineSync ? 'Synced from offline' : '',
          photoBase64: entry.photoBase64,
          photoName: entry.photoName,
        },
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
