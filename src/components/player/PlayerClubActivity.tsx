import { useEffect, useState } from 'react';
import PlayerStoriesPanel from './PlayerStoriesPanel.tsx';

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
  if (value == null) return 'NEW';
  if (value > 0) return `▲${value}`;
  if (value < 0) return `▼${Math.abs(value)}`;
  return '—';
};

function Avatar({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  return src ? (
    <img
      src={src}
      alt=""
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-xl object-cover"
    />
  ) : (
    <div style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-xl bg-white/[0.06] text-xs font-semibold text-white/45">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function PlayerClubActivity() {
  const [data, setData] = useState<ClubFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/pulse', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить активность клуба');
        if (!cancelled) setData(body as ClubFormData);
      })
      .catch((loadError: any) => { if (!cancelled) setError(loadError?.message || 'Не удалось загрузить активность клуба'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Сейчас в клубе</div>
            <h2 className="mt-1 text-lg font-semibold">Форма и серии игроков</h2>
          </div>
          {data && <div className="shrink-0 text-[10px] text-white/25">{data.players_with_form} в форме</div>}
        </div>

        {loading && <div className="mt-4 rounded-2xl bg-black/20 px-3 py-6 text-center text-xs text-white/35">Считаем активность…</div>}
        {error && <div className="mt-4 rounded-2xl bg-rose-400/10 px-3 py-3 text-xs text-rose-200/70">{error}</div>}

        {data && (
          <>
            {data.highlights.length > 0 && (
              <div className="mt-4 space-y-2">
                {data.highlights.slice(0, 4).map((item) => (
                  <div key={`${item.player_id}:${item.type}`} className="flex items-center gap-3 rounded-2xl border border-amber-200/10 bg-amber-200/[0.035] p-2.5">
                    <Avatar src={item.avatar_url} name={item.nickname} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{item.nickname}</div>
                      <div className="mt-0.5 text-[10px] text-amber-50/45">{item.text}</div>
                    </div>
                    <span className="text-base">{item.type === 'win_streak' ? '🔥' : '⚡'}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-1.5">
              {data.power_ranking.slice(0, 10).map((item) => (
                <div key={item.player_id} className={`flex items-center gap-2.5 rounded-2xl border px-2.5 py-2.5 ${item.player_id === data.viewer_id ? 'border-white/20 bg-white/[0.08]' : 'border-white/[0.04] bg-black/15'}`}>
                  <div className="w-5 shrink-0 text-center text-xs font-black text-white/35">{item.place}</div>
                  <Avatar src={item.avatar_url} name={item.nickname} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{item.nickname}{item.player_id === data.viewer_id ? ' · вы' : ''}</div>
                    <div className="mt-0.5 text-[10px] text-white/30">{item.wins}/{item.games} побед · {item.win_rate}%{item.streak >= 2 ? ` · серия ${item.streak}` : ''}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-black">{item.score}</div>
                    <div className={`text-[9px] font-semibold ${item.movement != null && item.movement > 0 ? 'text-emerald-300' : item.movement != null && item.movement < 0 ? 'text-rose-300' : 'text-white/25'}`}>{movementLabel(item.movement)}</div>
                  </div>
                </div>
              ))}
            </div>

            {!data.power_ranking.length && <p className="mt-4 text-xs text-white/35">Пока недостаточно завершённых игр для формы клуба.</p>}
            {data.meta?.formula && <p className="mt-3 text-[9px] leading-4 text-white/20">{data.meta.formula}</p>}
          </>
        )}
      </section>

      <section>
        <div className="mb-2 px-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Жизнь клуба</div>
          <div className="mt-1 text-sm font-semibold text-white/75">Последние вечера и матчи</div>
        </div>
        <PlayerStoriesPanel />
      </section>
    </div>
  );
}
