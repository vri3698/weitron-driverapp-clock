import { FormEvent, useState } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
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

    const trimmedId = id.trim();

    if (!trimmedId) {
      setError('Enter your employee ID.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await verifyEmployeeAPI(trimmedId);

      if (!trimmedId) {
        setError('Employee ID is required.');
        return;
      }

      if (result.valid && result.name) {
        onLogin({
          id: trimmedId,
          name: result.name,
          locationName: result.locationName,
        });
      } else {
        setError(result.error || 'Unable to verify ID.');
      }
    } catch {
      setError('Unable to verify ID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_52%)] bg-slate-950 px-4 text-white">
      <div
        className="mx-auto flex min-h-dvh max-w-md flex-col justify-center py-4"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="rounded-[26px] border border-white/10 bg-slate-900/84 px-5 py-6 shadow-2xl shadow-black/30 backdrop-blur">
          {/* Logo smaller */}
          <div className="mb-4 flex justify-center">
            <img
              src="/weitron-logo.jpg"
              alt="Weitron"
              className="h-12 w-auto object-contain"
            />
          </div>

          {/* Text: single, calm scale */}
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
              Driver Portal
            </p>
            <h1 className="mt-3 text-xl font-semibold text-white">
              Enter your ID
            </h1>
            <p className="mt-2 text-sm leading-5 text-slate-400">
              Sign in to start your shift.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-200">
              Employee ID
              <input
                value={id}
                onChange={(e) => {
                  const numericValue = e.target.value.replace(/\D/g, '');
                  setId(numericValue);
                  if (error) setError('');
                }}
                placeholder="e.g. 104020"
                autoComplete="username"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                aria-required="true"
                className="mt-2 w-full rounded-[20px] border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>

            {error ? (
              <div className="rounded-[18px] border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100">
                <div className="mb-1 flex items-center gap-2 text-rose-200">
                  <AlertCircle size={14} />
                  <span className="font-semibold">Sign-in error</span>
                </div>
                <p>{error}</p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || !id.trim()}
              className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-[20px] bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Checking…' : 'Continue'}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}