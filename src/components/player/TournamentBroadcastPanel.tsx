import { useEffect, useState } from 'react';
import { Copy, ExternalLink, X } from 'lucide-react';
import { clubGamesApi, type LiveBroadcastConfig } from '../../lib/clubGamesApi.ts';
import BroadcastLayoutControls from '../crm/BroadcastLayoutControls.tsx';
import ObsRemoteCRM from '../crm/ObsRemoteCRM.tsx';

/**
 * «OBS и трансляция» for a tournament game (owner, 2026-10-03): the same panel as in the club evening engine —
 * the overlay link, the scene links and the graphics size sliders. The tournament engine had no way to open it.
 */
export default function TournamentBroadcastPanel({
  tournamentId,
  gameId,
  obsRemote,
  onClose,
}: {
  tournamentId: string;
  gameId: string;
  obsRemote: boolean;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<LiveBroadcastConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    clubGamesApi.getTournamentBroadcastConfig(tournamentId, gameId)
      .then((result) => { if (!cancelled) setConfig(result); })
      .catch((loadError: any) => { if (!cancelled) setError(loadError?.message || 'Не удалось получить ссылку для OBS'); });
    return () => { cancelled = true; };
  }, [tournamentId, gameId]);

  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError('Не удалось скопировать ссылку. Её можно выделить вручную.');
    }
  };

  const base = config?.overlay_url.replace(/\/$/, '') || '';

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/88 px-4 backdrop-blur-sm" data-testid="tournament-broadcast-panel">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-[#111319] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">Турнирная игра</div>
            <div className="mt-1 text-xl font-semibold text-white">OBS и трансляция</div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55" aria-label="Закрыть настройки OBS">
            <X className="h-4 w-4" />
          </button>
        </div>

        {obsRemote ? (
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">1. OBS Studio: сцены, звук, эфир</div>
            <ObsRemoteCRM />
          </div>
        ) : null}

        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{obsRemote ? '2. ' : ''}Игровая графика</div>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Ссылка та же, что в клубных играх: её нужно один раз добавить в OBS как «Источник браузера» 1920 × 1080 с прозрачным фоном.
          </p>

          {!config && !error ? <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/45">Готовим защищённую ссылку…</div> : null}

          {config ? (
            <>
              <div className="mt-4 break-all rounded-2xl border border-white/10 bg-black/30 px-3 py-3 font-mono text-[11px] text-white/70">{config.overlay_url}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void copy('main', config.overlay_url)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-semibold text-black">
                  <Copy className="h-4 w-4" />{copied === 'main' ? 'Скопировано' : 'Скопировать'}
                </button>
                <a href={config.overlay_url} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-white/75">
                  <ExternalLink className="h-4 w-4" />Предпросмотр
                </a>
              </div>
              <div className="mt-4 space-y-2">
                {([['lobby', 'Заставка: готовимся к игре + рассадка'], ['standings', 'Итоги: таблица турнира']] as const).map(([view, label]) => (
                  <div key={view} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <span className="min-w-0 flex-1 text-xs leading-4 text-white/60">{label}<span className="block truncate font-mono text-[10px] text-white/35">{`${base}/${view}`}</span></span>
                    <button type="button" onClick={() => void copy(view, `${base}/${view}`)} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white/80">
                      <Copy className="h-3.5 w-3.5" />{copied === view ? 'Готово' : 'Копировать'}
                    </button>
                  </div>
                ))}
              </div>
              <BroadcastLayoutControls />
            </>
          ) : null}

          {error ? <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm leading-5 text-rose-100/80">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
