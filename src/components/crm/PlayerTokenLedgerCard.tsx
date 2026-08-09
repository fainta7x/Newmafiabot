import React, { useEffect, useState } from 'react';
import { Coins, Plus, RefreshCw } from 'lucide-react';

type TokenEntry = {
  id: string;
  amount: number;
  balance_after: number;
  description: string;
  reason_type: string;
  created_at: string;
};

type TokenPage = {
  player_id: string;
  balance: number;
  ledger: { items: TokenEntry[]; total: number; limit: number; offset: number };
};

interface PlayerTokenLedgerCardProps {
  playerId: string;
  initialBalance?: number;
}

const fmtDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
};

const readJson = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Не удалось выполнить операцию с жетонами');
  return data;
};

export const PlayerTokenLedgerCard: React.FC<PlayerTokenLedgerCardProps> = ({ playerId, initialBalance = 0 }) => {
  const [data, setData] = useState<TokenPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(playerId)}/tokens?limit=5&offset=0`);
      setData(await readJson(response));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить жетоны');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [playerId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(delta);
    if (!Number.isInteger(amount) || amount === 0) {
      setError('Укажи ненулевое целое изменение, например 100 или -100');
      return;
    }
    if (!reason.trim()) {
      setError('Укажи причину корректировки');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `manual-token:${playerId}:${crypto.randomUUID()}`
        : `manual-token:${playerId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const response = await fetch(`/api/players/${encodeURIComponent(playerId)}/tokens/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: amount, reason: reason.trim(), idempotency_key: idempotencyKey }),
      });
      await readJson(response);
      setDelta('');
      setReason('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Не удалось изменить баланс');
    } finally {
      setSaving(false);
    }
  };

  const balance = data?.balance ?? initialBalance;
  const items = data?.ledger.items || [];

  return (
    <section className="min-w-0 space-y-3 rounded-[18px] border border-warning/20 bg-surface-1 p-3.5" data-testid="player-token-ledger">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-text-primary">
            <Coins className="h-4 w-4 shrink-0 text-warning" /> Жетоны клуба
          </h3>
          <p className="mt-1 text-[11px] text-text-muted">Канонический баланс и последние операции</p>
        </div>
        <div className="shrink-0 text-right">
          <strong className="block text-[22px] tabular-nums text-warning">{balance}</strong>
          <span className="text-[10px] font-bold text-text-muted">жетонов</span>
        </div>
      </div>

      {items.length ? (
        <div className="min-w-0 space-y-1.5">
          {items.map((entry) => (
            <div key={entry.id} className="min-w-0 rounded-[12px] border border-border-soft bg-surface-2 px-3 py-2.5">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-[11px] font-bold text-text-primary">{entry.description}</div>
                  <div className="mt-0.5 text-[10px] text-text-muted">{fmtDate(entry.created_at)} · баланс {entry.balance_after}</div>
                </div>
                <strong className={`shrink-0 text-[12px] tabular-nums ${entry.amount > 0 ? 'text-success' : 'text-danger'}`}>
                  {entry.amount > 0 ? '+' : ''}{entry.amount}
                </strong>
              </div>
            </div>
          ))}
        </div>
      ) : !loading ? (
        <div className="rounded-[12px] bg-surface-2 px-3 py-4 text-center text-[11px] text-text-muted">
          История пока пуста
        </div>
      ) : null}

      <form onSubmit={submit} className="min-w-0 space-y-2 rounded-[13px] border border-border-soft bg-surface-2 p-3">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
          <label className="min-w-0">
            <span className="mobile-label">Изменение</span>
            <input
              inputMode="numeric"
              value={delta}
              onChange={(event) => setDelta(event.target.value)}
              placeholder="+100 / -100"
              className="mobile-field min-w-0"
            />
          </label>
          <label className="min-w-0">
            <span className="mobile-label">Причина</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              placeholder="Почему меняется баланс"
              className="mobile-field min-w-0"
            />
          </label>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={saving || !delta.trim() || !reason.trim()}
            className="min-h-[44px] min-w-0 flex-1 rounded-[11px] bg-accent px-3 text-[11px] font-black text-white disabled:opacity-50"
          >
            <span className="inline-flex items-center justify-center gap-1.5"><Plus className="h-4 w-4" /> {saving ? 'Сохранение…' : 'Применить корректировку'}</span>
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="min-h-[44px] rounded-[11px] border border-border-soft px-3 text-[11px] font-bold text-text-secondary disabled:opacity-50"
            aria-label="Обновить историю жетонов"
          >
            <RefreshCw className={`mx-auto h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </form>

      {error ? <div className="break-words rounded-[12px] border border-danger/25 bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}
    </section>
  );
};

export default PlayerTokenLedgerCard;
