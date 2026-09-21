import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

type TestStatus = { enabled: boolean; active?: boolean; label?: string | null };
type Role = 'player' | 'organizer';

export default function TestEnvironmentGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TestStatus | null>(null);
  const [password, setPassword] = useState('');
  const [busyRole, setBusyRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLoginPage = window.location.pathname === '/test-login';

  useEffect(() => {
    fetch('/api/test-environment/status', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => response.ok ? response.json() : { enabled: false })
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }));
  }, []);

  const login = async (event: FormEvent, role: Role) => {
    event.preventDefault();
    if (busyRole) return;
    setBusyRole(role);
    setError(null);
    try {
      const response = await fetch('/api/test-environment/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, role }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось войти');
      window.location.assign(body.redirectTo || (role === 'organizer' ? '/admin' : '/player'));
    } catch (loginError: any) {
      setError(loginError?.message || 'Не удалось войти');
      setBusyRole(null);
    }
  };

  const leaveTestMode = async () => {
    await fetch('/api/test-environment/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    window.location.assign('/test-login');
  };

  if (isLoginPage && status?.enabled) {
    return (
      <main className="min-h-screen bg-[#0a0a0c] px-4 py-8 text-white">
        <div className="mx-auto max-w-md rounded-[24px] border border-amber-300/25 bg-white/[0.04] p-5 shadow-2xl">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Тестовая версия 2LA Noire</div>
          <h1 className="mt-2 text-2xl font-semibold">Вход в тестовое приложение</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Здесь используется отдельная база Amvera. Все экраны и действия работают как в основном приложении.
          </p>
          <form className="mt-6 space-y-3">
            <label className="block text-xs font-semibold text-white/60" htmlFor="test-password">Пароль тестовой версии</label>
            <input
              id="test-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-base outline-none focus:border-amber-300/60"
            />
            {error ? <div className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{error}</div> : null}
            <button type="submit" onClick={(event) => void login(event, 'player')} disabled={!password || Boolean(busyRole)} className="min-h-12 w-full rounded-xl bg-white px-4 font-semibold text-black disabled:opacity-40">
              {busyRole === 'player' ? 'Входим…' : 'Войти как тестовый игрок'}
            </button>
            <button type="submit" onClick={(event) => void login(event, 'organizer')} disabled={!password || Boolean(busyRole)} className="min-h-12 w-full rounded-xl bg-amber-400 px-4 font-semibold text-black disabled:opacity-40">
              {busyRole === 'organizer' ? 'Входим…' : 'Войти как организатор'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <>
      {status?.active ? (
        <div className="fixed inset-x-0 top-0 z-[10000] flex min-h-6 items-center justify-center gap-3 bg-amber-400 px-3 py-1 text-center text-[10px] font-black uppercase tracking-[0.14em] text-black">
          <span>Тестовая версия · отдельная база</span>
          <button type="button" onClick={() => void leaveTestMode()} className="rounded bg-black/15 px-2 py-0.5 normal-case tracking-normal">Выйти</button>
        </div>
      ) : null}
      <div className={status?.active ? 'pt-6' : undefined}>{children}</div>
    </>
  );
}
