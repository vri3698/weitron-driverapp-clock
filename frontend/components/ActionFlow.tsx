import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { ActionType, ClockEntry, Employee, LocationData } from '../types';
import { getCurrentLocation, getLocationHelpText } from '../services/device';
import { Camera } from './Camera';

interface ActionFlowProps {
  action: ActionType;
  employee: Employee;
  onComplete: (entry: ClockEntry) => Promise<boolean>;
  onDone: (synced: boolean, action: ActionType) => void;
  onCancel: () => void;
}

type Step = 'location' | 'camera' | 'saving' | 'success' | 'error';

const makePhotoName = (action: ActionType, employeeId: string, date: Date): string => {
  const ts = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `${action === 'Clock In' ? 'clockin' : 'clockout'}_${employeeId}_${ts}.jpg`;
};

export function ActionFlow({ action, employee, onComplete, onDone, onCancel }: ActionFlowProps) {
  const [step, setStep] = useState<Step>('location');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState('');
  const [synced, setSynced] = useState(false);

  const fetchLocation = useCallback(async () => {
    setStep('location');
    setError('');
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
      setStep('camera');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to get location.');
      setStep('error');
    }
  }, []);

  useEffect(() => {
    void fetchLocation();
  }, [fetchLocation]);

  const handleCapture = async (base64: string) => {
    setStep('saving');
    const now = new Date();
    const entry: ClockEntry = {
      id: crypto.randomUUID(),
      employeeId: employee.id,
      employeeName: employee.name,
      locationName: employee.locationName,
      action,
      timestamp: now.getTime(),
      location,
      photoBase64: base64,
      photoName: makePhotoName(action, employee.id, now),
      synced: false,
    };
    try {
      const wasSynced = await onComplete(entry);
      setSynced(wasSynced);
      setStep('success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save entry.');
      setStep('error');
    }
  };

  if (step === 'camera') {
    return <Camera onCapture={handleCapture} onCancel={onCancel} />;
  }

  const accentCircleClass =
    action === 'Clock In'
      ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300'
      : 'border-rose-400/60 bg-rose-500/15 text-rose-300';
  const accentButtonClass =
    action === 'Clock In'
      ? 'bg-emerald-600 hover:bg-emerald-500'
      : 'bg-rose-600 hover:bg-rose-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 text-white">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-slate-900/90 p-6 text-center shadow-2xl shadow-black/40 backdrop-blur">
        {step === 'location' && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-300">
              <MapPin size={28} />
            </div>
            <p className="mb-1 text-lg font-semibold">Getting location…</p>
            <p className="text-sm text-slate-400">Please wait while we check your position.</p>
          </>
        )}

        {step === 'saving' && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-300">
              <Loader2 className="animate-spin" size={28} />
            </div>
            <p className="text-lg font-semibold">Saving entry…</p>
          </>
        )}

        {step === 'success' && (
          <>
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 ${accentCircleClass}`}>
              <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5">
                  <animate attributeName="stroke-dasharray" from="0,50" to="50,0" dur="0.45s" fill="freeze" />
                </path>
              </svg>
            </div>
            <p className="mb-1 text-xl font-bold">{action} successful</p>
            <p className="mb-4 text-sm text-slate-300">
              {synced ? 'Saved and synced.' : 'Saved offline. It will sync automatically.'}
            </p>
            <button
              onClick={() => onDone(synced, action)}
              className={`w-full rounded-2xl px-4 py-2.5 font-semibold transition ${accentButtonClass}`}
            >
              Done
            </button>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300">
              <AlertTriangle size={28} />
            </div>
            <p className="mb-2 text-lg font-semibold">{location ? 'Action failed' : 'Location required'}</p>
            <p className="mb-3 text-sm text-slate-400">{error}</p>
            {!location ? <p className="mb-4 text-sm text-slate-300">{getLocationHelpText()}</p> : null}
            <div className="flex justify-center gap-2">
              {!location ? (
                <button onClick={() => void fetchLocation()} className="rounded-2xl bg-indigo-600 px-4 py-2 font-semibold hover:bg-indigo-500">
                  Try again
                </button>
              ) : null}
              <button onClick={onCancel} className="rounded-2xl bg-slate-700 px-4 py-2 font-semibold hover:bg-slate-600">
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
