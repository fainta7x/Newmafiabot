import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson } from '../lib/requestJson.ts';

/** A failed read is unknown, never a confirmed zero. Keep the last confirmed amount on refresh. */
export function usePlayerDebtSummary(refreshKey: string) {
  const [amount, setAmount] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const requestSeq = useRef(0);
  const reload = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setStatus('loading');
    try {
      const body = await getJson<{ summary?: { historical_debt?: unknown } }>('/api/player/payments', 'Не удалось обновить сумму долга');
      const value = body?.summary?.historical_debt;
      if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' || !Number.isFinite(Number(value))) {
        throw new Error('Invalid payment summary');
      }
      if (requestId !== requestSeq.current) return;
      setAmount(Math.max(0, Number(value)));
      setStatus('ready');
    } catch {
      if (requestId === requestSeq.current) setStatus('error');
    }
  }, []);
  useEffect(() => {
    void reload();
    return () => { requestSeq.current += 1; };
  }, [refreshKey, reload]);
  return { amount, status, reload };
}
