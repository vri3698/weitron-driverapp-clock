import { FormEvent, useState } from 'react';
import { Bell, Send, Lock, Truck } from 'lucide-react';

const ADMIN_PUSH_URL = '/api/push';

export function AdminPanel() {
  const [adminKey, setAdminKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; sent?: number; failed?: number; error?: string } | null>(null);

  const handleAuth = (e: FormEvent) => {
    e.preventDefault();
    if (adminKey.trim()) setAuthed(true);
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(ADMIN_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey, title: title.trim(), body: body.trim(), url: '/' }),
      });
      const data = await res.json() as { ok: boolean; sent?: number; failed?: number; error?: string };
      setResult(data);
      if (data.ok) { setTitle(''); setBody(''); }
    } catch (err) {
      setResult({ ok: false, error: 'Network error — is the backend running?' });
    }
    setSending(false);
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.25),_transparent_55%)] bg-slate-950 p-4 text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4 pt-8">

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-300">
            <Truck size={24} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Weitron</p>
            <h1 className="text-xl font-semibold">Push Notifications</h1>
          </div>
        </div>

        {!authed ? (
          <form onSubmit={handleAuth} className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
            <div className="mb-5 flex items-center gap-2 text-slate-300">
              <Lock size={18} />
              <span className="font-medium">Admin access required</span>
            </div>
            <label className="block text-sm text-slate-400">
              Admin key
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Enter admin key"
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>
            <button
              type="submit"
              className="mt-4 w-full rounded-2xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500"
            >
              Unlock
            </button>
          </form>
        ) : (
          <form onSubmit={handleSend} className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2 text-slate-300">
              <Bell size={18} />
              <span className="font-medium">Send push to all drivers</span>
            </div>

            <label className="block text-sm text-slate-400">
              Title <span className="text-rose-400">*</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Clock in reminder"
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>

            <label className="block text-sm text-slate-400">
              Message
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Optional message body…"
                rows={3}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 resize-none"
              />
            </label>

            {result && (
              <div className={`rounded-2xl px-4 py-3 text-sm ${result.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-rose-900/40 text-rose-300'}`}>
                {result.ok
                  ? `✓ Sent to ${result.sent ?? 0} device${result.sent !== 1 ? 's' : ''}${result.failed ? ` (${result.failed} failed)` : ''}`
                  : `✗ ${result.error ?? 'Unknown error'}`}
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !title.trim()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
            >
              <Send size={16} />
              {sending ? 'Sending…' : 'Send Notification'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-slate-600">
          <a href="/" className="underline hover:text-slate-400">← Back to driver app</a>
        </p>
      </div>
    </div>
  );
}
