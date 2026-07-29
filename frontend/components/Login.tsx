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
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_52%)] bg-slate-950 px-5 text-white">
      <div
        className="mx-auto flex min-h-dvh max-w-md flex-col justify-center py-6"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="rounded-[34px] border border-white/10 bg-slate-900/84 px-6 py-8 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mb-5 flex justify-center">
            <img
              src="/weitron-logo.jpg"
              alt="Weitron"
              className="h-16 w-auto object-contain"
            />
          </div>

          <div className="text-center">
            <p className="text-[0.95rem] uppercase tracking-[0.34em] text-slate-400">Driver Portal</p>
            <h1 className="mt-4 text-[3rem] font-semibold leading-none text-white">Enter your ID</h1>
            <p className="mt-4 text-[1.55rem] leading-8 text-slate-400">
              Sign in to start your shift.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            <label className="block text-[1.25rem] font-medium text-slate-200">
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
                className="mt-4 w-full rounded-[28px] border border-slate-700 bg-slate-950/92 px-5 py-5 text-[1.7rem] outline-none ring-0 transition placeholder:text-slate-500 focus:border-indigo-500"
              />
            </label>

            {error ? (
              <div className="rounded-[26px] border border-rose-500/30 bg-rose-500/10 p-4 text-base text-rose-100">
                <div className="mb-2 flex items-center gap-2 text-rose-200">
                  <AlertCircle size={18} />
                  <span className="font-semibold">Sign-in error</span>
                </div>
                <p>{error}</p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || !id.trim()}
              className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-[28px] bg-indigo-600 px-5 py-5 text-[1.65rem] font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Continue'}
              <ArrowRight size={24} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}