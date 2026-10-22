import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import { getJson } from '../../lib/requestJson.ts';

type ClubHighlight = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  type: string;
  text: string;
};

type PowerEntry = {
  place: number;
  player_id: string;
  nickname: string;
  avatar_url: string;
  games: number;
  wins: number;
  win_rate: number;
  streak: number;
  score: number;
  movement: number | null;
};

type ClubFormData = {
  viewer_id: string;
  highlights: ClubHighlight[];
  power_ranking: PowerEntry[];
  players_with_form: number;
  meta?: { formula?: string };
};

const movementLabel = (value: number | null) => {
  if (value == null) return 'новый';
  if (value > 0) return '▲' + value;
  if (value < 0) return '▼' + Math.abs(value);
  return '—';
};

const movementColor = (value: number | null) => (
  value != null && value > 0 ? 'text-emerald-300'
    : value != null && value < 0 ? 'text-rose-300' : 'text-white/50'
);

function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return <span style={{ width: size, height: size }} className="relative grid shrink-0 place-items-center overflow-hidden rounded-[14px] bg-gradient-to-br from-white/[0.14] to-white/[0.035] text-[13px] font-semibold text-white/70 ring-1 ring-white/10" aria-hidden="true">
    {name.trim().slice(0, 1).toUpperCase() || '?'}
    {src && !failed && <img src={src} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />}
  </span>;
}

function FormPlayerCard({ row, isSelf, ownContext = false }: { row: PowerEntry; isSelf: boolean; ownContext?: boolean }) {
  return (
    <button
      type="button"
      data-testid={ownContext ? 'player-form-own-position' : 'player-form-row-' + row.player_id}
      onClick={() => openCanonicalPlayerProfile(row.player_id)}
      aria-label={'Открыть профиль ' + row.nickname + ', место ' + row.place}
      className={'ds-focus-ring flex min-h-[80px] w-full items-center gap-2 rounded-[20px] border px-2.5 py-3 text-left transition-colors active:bg-white/[0.12] ' +
        (isSelf ? 'border-white/20 bg-white/[0.09]' : row.place <= 3 ? 'border-amber-200/[0.10] bg-amber-200/[0.035]' : 'border-white/[0.06] bg-black/20')}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-[13px] font-semibold tabular-nums text-white/75">{row.place}</span>
      <Avatar src={row.avatar_url} name={row.nickname} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 break-words text-[13px] font-semibold leading-4 text-white/90">{row.nickname}{isSelf ? ' · я' : ''}</span>
        <span className="mt-1 block text-[11px] leading-4 text-white/50">
          Побед: {row.wins} из {row.games} игр · {row.win_rate}%
          {row.streak >= 2 ? ' · серия ' + row.streak : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[17px] font-semibold tabular-nums text-white/90">{row.score}</span>
        <span className="block text-[10px] leading-3 text-white/50">баллы формы</span>
        <span className={'mt-1 block text-[11px] font-semibold tabular-nums ' + movementColor(row.movement)}>{movementLabel(row.movement)}</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-white/35" />
    </button>
  );
}

/** «Активность → Форма»: current form, not the match results feed. */
export default function PlayerClubActivity() {
  const [data, setData] = useState<ClubFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const requestSeq = useRef(0);

  const loadForm = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const body = await getJson('/api/player/pulse', 'Не удалось загрузить активность клуба');
      if (!Array.isArray(body?.power_ranking) || !Array.isArray(body?.highlights)) throw new Error('Не удалось загрузить активность клуба');
      if (requestId === requestSeq.current) setData(body as ClubFormData);
    } catch (loadError: any) {
      if (requestId === requestSeq.current) setError(loadError?.message || 'Не удалось загрузить активность клуба');
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadForm();
    return () => { requestSeq.current += 1; };
  }, [loadForm]);

  const ranking = data ? (showAll ? data.power_ranking : data.power_ranking.slice(0, 5)) : [];
  const ownRow = data?.power_ranking.find((row) => row.player_id === data.viewer_id) || null;
  const ownOutsidePreview = !showAll && ownRow && !data?.power_ranking.slice(0, 5).some((row) => row.player_id === data.viewer_id);

  return (
    <div className="space-y-4" data-testid="player-club-form">
      <section className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <header className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Сейчас в клубе</div>
            <h2 className="mt-1 text-lg font-semibold text-white">Форма игроков</h2>
          </div>
          {data && <div className="shrink-0 text-[11px] text-white/50">{data.players_with_form} в форме</div>}
        </header>

        {loading && <div className="mt-4 rounded-2xl bg-black/20 px-3 py-6 text-center text-[13px] text-white/50">Считаем активность…</div>}
        {error && <div role="alert" data-testid="player-form-error" className="mt-4 space-y-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] p-4">
          <p className="text-[13px] leading-5 text-rose-100/80">{error}</p>
          <button type="button" onClick={() => void loadForm()} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-semibold text-white">Повторить</button>
        </div>}

        {data && (
          <>
            {data.highlights.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-white/50">Сейчас выделяются</h3>
                {data.highlights.slice(0, 2).map((item) => (
                  <button
                    key={item.player_id + ':' + item.type}
                    type="button"
                    aria-label={'Открыть профиль ' + item.nickname}
                    onClick={() => openCanonicalPlayerProfile(item.player_id)}
                    className="ds-focus-ring flex min-h-[72px] w-full items-center gap-3 rounded-[20px] border border-amber-200/10 bg-amber-200/[0.035] p-3 text-left active:bg-amber-200/[0.09]"
                  >
                    <Avatar src={item.avatar_url} name={item.nickname} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[13px] font-semibold text-white/90">{item.nickname}</span>
                      <span className="mt-0.5 block text-[12px] leading-4 text-amber-50/60">{item.text}</span>
                    </span>
                    <span aria-hidden="true" className="text-base">{item.type === 'win_streak' ? '🔥' : '⚡'}</span>
                  </button>
                ))}
              </div>
            )}

            {ownOutsidePreview && ownRow ? (
              <div className="mt-4 space-y-2" data-testid="player-form-own-preview">
                <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-white/50">Моё место</h3>
                <FormPlayerCard row={ownRow} isSelf ownContext />
              </div>
            ) : null}

            {ranking.length > 0 ? (
              <div className="mt-4 space-y-2">
                <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-white/50">Рейтинг формы</h3>
                {ranking.map((row) => <FormPlayerCard key={row.player_id} row={row} isSelf={row.player_id === data.viewer_id} />)}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-black/20 px-3 py-6 text-[13px] leading-5 text-white/50">Пока недостаточно завершённых игр для формы клуба.</p>
            )}

            {data.power_ranking.length > 5 && (
              <button type="button" onClick={() => setShowAll((current) => !current)} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[13px] font-semibold text-white/75">
                {showAll ? 'Свернуть список' : 'Показать всех · ' + data.power_ranking.length}
              </button>
            )}

            {data.meta?.formula && (
              <details open className="mt-3 rounded-xl border border-amber-200/10 bg-amber-200/[0.035] px-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-[12px] font-medium text-white/60">Как считается форма</summary>
                <p className="pb-3 text-[11px] leading-5 text-white/55">{data.meta.formula}</p>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}
