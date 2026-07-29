import { FormEvent, useState } from 'react';
import { ArrowRight, Truck, AlertCircle } from 'lucide-react';
import { verifyEmployeeAPI } from '../services/api';
import { Employee } from '../types';

interface LoginProps {
  onLogin: (employee: Employee) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedId = id.trim().toUpperCase();
    if (!trimmedId) {
      setError('Enter your employee ID.');
      return;
    }

    setLoading(true);
    setError('');
    const result = await verifyEmployeeAPI(trimmedId);
    if (result.valid && result.name) {
      onLogin({ id: trimmedId, name: result.name, locationName: result.locationName });
    } else {
      setError(result.error || 'Unable to verify ID.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.28),_transparent_55%)] bg-slate-950 p-4 text-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center">
        <div className="rounded-[36px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex justify-center">
            <div className="mb-7 flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-600/10 text-indigo-300 shadow-inner shadow-indigo-500/10">
              <Truck size={32} />
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Weitron Driver Portal</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Enter your ID</h1>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block text-sm text-slate-300">
              Employee ID
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="e.g. 104020"
                className="mt-3 w-full rounded-3xl border border-slate-700 bg-slate-950/90 px-4 py-4 text-base outline-none ring-0 transition focus:border-indigo-500"
              />
            </label>

            {error ? (
              <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                <div className="mb-2 flex items-center gap-2 text-rose-200">
                  <AlertCircle size={18} />
                  <span className="font-semibold">Network error</span>
                </div>
                <p>{error}</p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-3xl bg-indigo-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Continue'}
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
