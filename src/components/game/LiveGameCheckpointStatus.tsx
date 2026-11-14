import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CheckpointSyncStatus } from './useLiveGameCheckpoint.ts';

/** A status button in the existing game header; gameplay is never blocked by
 * backup failure. The choice of device is explicit and still revision-checked. */
export function LiveGameCheckpointStatus({ status }: { status: CheckpointSyncStatus }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!status.error) setOpen(false); }, [status.error]);
  if (!status.error) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Серверная копия игры не обновляется" title="Серверная копия игры не обновляется" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/50 bg-amber-500/10 font-bold text-amber-200">!</button>
    {open ? createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label="Сохранение игры" data-testid="checkpoint-sync-dialog">
      <div className="my-auto w-full max-w-sm space-y-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white">
        <p className="text-base font-bold">Сохранение игры</p>
        <p className="text-sm leading-6 text-slate-200">{status.error}</p>
        {status.conflict ? <>
          <p className="text-sm leading-6 text-slate-300">«С сервера» заменит состояние на этом устройстве. «С этого устройства» сохранит текущую игру вместо серверной копии.</p>
          <button type="button" disabled={status.busy} onClick={() => void status.restore()} className="min-h-11 w-full rounded-xl bg-white px-3 py-2 font-semibold text-black">С сервера</button>
          <button type="button" disabled={status.busy} onClick={() => void status.useThisDevice()} className="min-h-11 w-full rounded-xl border border-slate-500 px-3 py-2 font-semibold">С этого устройства</button>
        </> : <button type="button" disabled={status.busy} onClick={() => void status.retry()} className="min-h-11 w-full rounded-xl bg-white px-3 py-2 font-semibold text-black">Повторить сохранение</button>}
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 w-full rounded-xl border border-slate-600 px-3 py-2 text-sm">Вернуться к игре</button>
      </div>
    </div>, document.body) : null}
  </>;
}
