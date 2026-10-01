import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { clubGamesApi } from '../../lib/clubGamesApi';
import {
  DEFAULT_LIVE_BROADCAST_LAYOUT,
  LIVE_BROADCAST_LAYOUT_LIMITS,
  type LiveBroadcastLayout,
} from '../../lib/liveBroadcast';

const BLOCKS = [
  { size: 'top', visible: 'showTop', label: 'Верхняя панель' },
  { size: 'timeline', visible: 'showTimeline', label: '«Ход игры»' },
  { size: 'players', visible: 'showPlayers', label: 'Плашки игроков' },
] as const;

/**
 * Live size and visibility of the OBS overlay blocks (owner, 2026-10-01): the overlay picks
 * a change up within a second, so the judge tunes the picture during the stream without a build.
 */
const BroadcastLayoutControls: React.FC = () => {
  const [layout, setLayout] = useState<LiveBroadcastLayout | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    clubGamesApi.getBroadcastLayout()
      .then((result) => { if (!cancelled) setLayout(result.layout); })
      .catch(() => { if (!cancelled) setLayout({ ...DEFAULT_LIVE_BROADCAST_LAYOUT }); });
    return () => {
      cancelled = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const update = (next: LiveBroadcastLayout) => {
    setLayout(next);
    setState('saving');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      clubGamesApi.saveBroadcastLayout(next)
        .then(() => setState('saved'))
        .catch(() => setState('error'));
    }, 250);
  };

  if (!layout) return <div className="mt-3 text-xs text-white/40">Загружаем размеры графики…</div>;

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3" data-testid="broadcast-layout-controls">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-white">Размер графики</div>
        <div className="text-[11px] text-white/40">
          {state === 'saving' ? 'Сохраняем…' : state === 'saved' ? 'В эфире' : state === 'error' ? 'Не сохранилось' : 'Меняется сразу в OBS'}
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {BLOCKS.map((block) => {
          const visible = layout[block.visible];
          return (
            <div key={block.size} className={visible ? '' : 'opacity-50'}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => update({ ...layout, [block.visible]: !visible })}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70"
                  aria-label={`${block.label}: ${visible ? 'скрыть' : 'показать'}`}
                >
                  {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <span className="min-w-0 flex-1 text-[13px] text-white/75">{block.label}</span>
                <span className="w-12 text-right font-mono text-[13px] text-white">{layout[block.size]}%</span>
              </div>
              <input
                type="range"
                min={LIVE_BROADCAST_LAYOUT_LIMITS.min}
                max={LIVE_BROADCAST_LAYOUT_LIMITS.max}
                step={5}
                value={layout[block.size]}
                disabled={!visible}
                onChange={(event) => update({ ...layout, [block.size]: Number(event.target.value) })}
                className="mt-1 h-8 w-full accent-emerald-300"
                aria-label={`${block.label}: размер`}
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => update({ ...DEFAULT_LIVE_BROADCAST_LAYOUT })}
        className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/70"
      >
        <RotateCcw className="h-3.5 w-3.5" />Сбросить как было
      </button>
    </div>
  );
};

export default BroadcastLayoutControls;
