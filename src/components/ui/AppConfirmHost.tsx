import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { registerAppConfirmHost, type AppConfirmRequest } from '../../lib/appConfirm.ts';

/** Mount once on a screen that asks questions through `appConfirm`. Centered, width-bounded, safe-area aware. */
export const AppConfirmHost: React.FC = () => {
  const [request, setRequest] = useState<AppConfirmRequest | null>(null);
  useEffect(() => registerAppConfirmHost((next) => setRequest(next)), []);
  if (!request) return null;
  const answer = (value: boolean) => { request.resolve(value); setRequest(null); };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" role="presentation" onClick={() => answer(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" data-testid="app-confirm"
        className="w-full max-w-sm space-y-4 rounded-3xl border border-border-soft bg-surface-1 p-5 text-text-primary shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${request.danger ? 'text-danger' : 'text-warning'}`} />
          <div className="min-w-0">
            <h3 id="app-confirm-title" className="text-sm font-black">{request.title || 'Подтвердите действие'}</h3>
            <p className="mt-1 break-words text-[13px] leading-5 text-text-secondary">{request.message}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => answer(false)} className="min-h-11 rounded-xl border border-border-soft bg-surface-2 px-3 text-[13px] font-bold text-text-primary">Отмена</button>
          <button type="button" data-testid="app-confirm-ok" onClick={() => answer(true)}
            className={`min-h-11 rounded-xl px-3 text-[13px] font-bold text-white ${request.danger ? 'bg-danger' : 'bg-accent'}`}>{request.confirmLabel || 'Да'}</button>
        </div>
      </div>
    </div>
  );
};
