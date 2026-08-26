import React, { useEffect, useState } from 'react';
import { AlertTriangle, FlaskConical, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { SystemStatusCard } from './SystemStatusCard.tsx';

type Scenario = { id: string; label: string; phase: string; detail: string };
type TestSession = {
  id: string;
  label: string;
  scenario: string;
  phase: string;
  created_at: string;
  expires_at: string;
  storage: 'memory-only';
  production_writes: false;
};
type TestModeState = {
  active: TestSession | null;
  scenarios: Scenario[];
  safety: {
    storage: string;
    production_writes: boolean;
    database_mutations: boolean;
    real_evening_mutations: boolean;
    ttl_minutes: number;
  };
};

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`/api/crm/test-mode${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

export const DeveloperTestModeCRM: React.FC = () => {
  const [state, setState] = useState<TestModeState | null>(null);
  const [scenario, setScenario] = useState('empty');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const next = await request('/session');
      setState(next);
      if (!next.active && next.scenarios?.length && !next.scenarios.some((item: Scenario) => item.id === scenario)) {
        setScenario(next.scenarios[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить тестовый режим');
    }
  };

  useEffect(() => { void load(); }, []);

  const start = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      setState(await request('/session', { method: 'POST', body: JSON.stringify({ scenario }) }));
    } catch (err: any) {
      setError(err?.message || 'Не удалось создать тестовую сессию');
    } finally { setBusy(false); }
  };

  const reset = async () => {
    if (busy || !state?.active) return;
    if (!window.confirm('Сбросить только текущую [TEST]-сессию? Реальные данные затронуты не будут.')) return;
    setBusy(true); setError(null);
    try {
      await request('/session', { method: 'DELETE', body: JSON.stringify({ session_id: state.active.id }) });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сбросить тестовую сессию');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="developer-test-mode">
      <section className="rounded-[20px] border border-amber-300/20 bg-amber-300/[0.07] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-amber-200/15 bg-amber-200/10 text-amber-100"><FlaskConical className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100/75">[TEST] Организатор</div>
            <h3 className="mt-1 text-[16px] font-semibold text-white">Защищённый тестовый режим</h3>
            <p className="mt-1 text-[11px] leading-5 text-white/55">Сессия живёт только в памяти процесса. Она не создаёт игроков или вечера, не пишет статистику и не меняет production-базу.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-[13px] border border-emerald-300/10 bg-emerald-300/[0.06] px-3 py-2 text-[10px] leading-4 text-emerald-100/70">
          <ShieldCheck className="h-4 w-4 shrink-0" /> Реальные игровые данные остаются read-only для этого режима.
        </div>
      </section>

      {error ? <div className="rounded-[14px] border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-[11px] text-rose-100">{error}</div> : null}

      <section className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="text-[14px] font-semibold text-white">Тестовая сессия</h3><p className="mt-1 text-[10px] text-white/35">Контракт сценария без подмены реальных данных.</p></div>
          <button type="button" onClick={() => void load()} disabled={busy} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/20 text-white/45 disabled:opacity-40" aria-label="Обновить"><RefreshCw className="h-4 w-4" /></button>
        </div>

        {state?.active ? <div className="mt-4 rounded-[16px] border border-amber-300/15 bg-black/20 p-3" data-testid="developer-test-active-session">
          <div className="text-[11px] font-semibold text-amber-100">{state.active.label}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-white/45">
            <div>Сценарий<br/><strong className="text-white/75">{state.active.scenario}</strong></div>
            <div>Фаза<br/><strong className="text-white/75">{state.active.phase}</strong></div>
          </div>
          <div className="mt-2 break-all font-mono text-[9px] text-white/25">session: {state.active.id}</div>
          <button type="button" onClick={() => void reset()} disabled={busy} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-rose-300/15 bg-rose-300/[0.06] px-3 text-[11px] font-semibold text-rose-100 disabled:opacity-40"><Trash2 className="h-4 w-4" /> Сбросить эту [TEST]-сессию</button>
        </div> : <div className="mt-4 space-y-3">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35" htmlFor="developer-scenario">Сценарий</label>
          <select id="developer-scenario" value={scenario} onChange={(event) => setScenario(event.target.value)} className="min-h-[46px] w-full rounded-[13px] border border-white/10 bg-black/30 px-3 text-[12px] text-white outline-none">
            {(state?.scenarios || []).map((item) => <option key={item.id} value={item.id}>{item.label} · {item.phase}</option>)}
          </select>
          <button type="button" onClick={() => void start()} disabled={busy || !state?.scenarios?.length} className="min-h-[46px] w-full rounded-[13px] bg-[var(--ds-accent)] px-4 text-[12px] font-semibold text-white disabled:opacity-40">{busy ? 'Создаём…' : 'Создать изолированную [TEST]-сессию'}</button>
        </div>}
      </section>

      <section className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
        <h3 className="text-[14px] font-semibold text-white">Сценарный контракт</h3>
        <p className="mt-1 text-[10px] leading-4 text-white/35">Это безопасная основа. Сценарии обозначают целевую фазу, но пока не генерируют игроков, фолы, номинации, смерти или результаты.</p>
        <div className="mt-3 space-y-2">
          {(state?.scenarios || []).map((item) => <div key={item.id} className="rounded-[13px] border border-white/[0.07] bg-black/20 px-3 py-2"><div className="text-[11px] font-semibold text-white/75">{item.label} · {item.phase}</div><div className="mt-0.5 text-[10px] leading-4 text-white/35">{item.detail}</div></div>)}
        </div>
        <div className="mt-3 flex gap-2 rounded-[13px] border border-white/[0.07] bg-black/20 px-3 py-2 text-[10px] leading-4 text-white/40"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-100/60" /> Для проверки реального интерфейса открывай нужный экран CRM отдельно; тестовая сессия не переключает production-состояние игры.</div>
      </section>

      <section>
        <div className="mb-2 px-1"><h3 className="text-[13px] font-semibold text-white">Состояние реальных сервисов</h3><p className="mt-0.5 text-[10px] text-white/35">Только чтение: WebApp, база, Telegram и VK.</p></div>
        <SystemStatusCard />
      </section>
    </div>
  );
};

export default DeveloperTestModeCRM;
