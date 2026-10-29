import React, { useEffect, useState } from 'react';
import { FlaskConical, ShieldCheck } from 'lucide-react';
import { SystemStatusCard } from './SystemStatusCard.tsx';
import { getJson, sendJson } from '../../lib/requestJson.ts';

type TestStatus = { enabled: boolean; active: boolean };

/**
 * «Тестовый режим» (owner, 2026-10-29: объединить тест-сессию и /test-login): the one entry into the sandbox. It says plainly
 * where the owner is now — the real club or the separate test environment with its own database — and leads into / out of it.
 */
export const DeveloperTestModeCRM: React.FC = () => {
  const [status, setStatus] = useState<TestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getJson<TestStatus>('/api/test-environment/status', 'Не удалось определить режим', { cache: 'no-store' })
      .then(setStatus).catch((err: any) => setError(err?.message || 'Не удалось определить режим'));
  }, []);

  const leave = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const body = await sendJson<{ redirectTo?: string }>('/api/test-environment/logout', 'POST', {}, 'Не удалось выйти из тестовой среды');
      window.location.assign(body?.redirectTo || '/test-login');
    } catch (err: any) { setError(err?.message || 'Не удалось выйти из тестовой среды'); setBusy(false); }
  };

  const inTest = Boolean(status?.active);
  return (
    <div className="space-y-4" data-testid="developer-test-mode">
      <section className={`rounded-[20px] border p-4 ${inTest ? 'border-amber-300/30 bg-amber-300/[0.10]' : 'border-white/10 bg-white/[0.035]'}`} data-testid="developer-test-state">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-amber-200/15 bg-amber-200/10 text-amber-100"><FlaskConical className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100/75">{status === null ? 'Проверяем…' : inTest ? 'Сейчас: тестовая среда' : 'Сейчас: рабочий клуб'}</div>
            <h3 className="mt-1 text-[16px] font-semibold text-white">{status === null ? 'Определяем режим…' : inTest ? 'Вы в тестовой среде' : 'Вы в рабочем режиме'}</h3>
            <p className="mt-1 text-[12px] leading-5 text-white/60">
              {status === null ? 'Это займёт секунду.' : inTest
                ? 'Сверху по центру жёлтая плашка «TEST». Здесь отдельная база с тестовыми игроками и вечерами: всё, что вы делаете, не попадёт в рабочие данные клуба.'
                : 'Тестовая среда — отдельная копия приложения с тестовыми игроками и своей базой, например, чтобы проверить раздачу ролей или игру. Рабочие данные клуба в ней недоступны и не меняются.'}
            </p>
          </div>
        </div>
        {status && !inTest && !status.enabled ? <p className="mt-3 text-[12px] text-white/50">Тестовая среда на сервере сейчас отключена.</p> : null}
        {status?.enabled && !inTest ? <>
          <button type="button" onClick={() => window.location.assign('/test-login')} className="mt-3 min-h-[46px] w-full rounded-[13px] bg-[var(--ds-accent)] px-4 text-[13px] font-semibold text-white">Открыть тестовую среду</button>
          <p className="mt-2 text-[11px] leading-4 text-white/45">Нужен пароль тестовой версии. Вход в тестовую среду заменяет ваш рабочий вход: после выхода оттуда войдите в обычный режим снова.</p>
        </> : null}
        {inTest ? <button type="button" onClick={() => void leave()} disabled={busy} className="mt-3 min-h-[46px] w-full rounded-[13px] border border-white/15 bg-black/20 px-4 text-[13px] font-semibold text-white disabled:opacity-40">{busy ? 'Выходим…' : 'Выйти из тестовой среды'}</button> : null}
        <div className="mt-3 flex items-center gap-2 rounded-[13px] border border-emerald-300/10 bg-emerald-300/[0.06] px-3 py-2 text-[11px] leading-4 text-emerald-100/70">
          <ShieldCheck className="h-4 w-4 shrink-0" /> Рабочая база клуба тестовой средой не затрагивается.
        </div>
      </section>

      {error ? <div role="alert" className="rounded-[14px] border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-[12px] text-rose-100">{error}</div> : null}

      <section>
        <div className="mb-2 px-1"><h3 className="text-[13px] font-semibold text-white">Состояние реальных сервисов</h3><p className="mt-0.5 text-[10px] text-white/35">Только чтение: WebApp, бот и каналы.</p></div>
        <SystemStatusCard />
      </section>
    </div>
  );
};

export default DeveloperTestModeCRM;
