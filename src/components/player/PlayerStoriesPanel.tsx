import React, { useEffect, useMemo, useState } from 'react';
import type { PlayerGameDetailData } from './PlayerGameDetail.tsx';
import EveningVotingPanel from './EveningVotingPanel.tsx';

type StoryGame = {
  game_key: string;
  source: 'club' | 'tournament';
  event_id: string;
  title: string;
  played_at: string;
  game_number: number;
  winner_team: 'red' | 'black';
  players: Array<{ player_id: string; nickname: string; seat_number: number }>;
};

type EveningRecap = {
  id: string;
  title: string;
  starts_at: string | null;
  settled_at: string | null;
  venue: string | null;
  format: string | null;
  games: number;
  players: number;
  attended: number;
  score: { red: number; black: number };
  winner_side: 'red' | 'black' | 'draw';
  timeline: Array<{
    type: 'game_result';
    game_key: string;
    local_number: number;
    played_at: string;
    winner_team: 'red' | 'black';
    score_after: { red: number; black: number };
    player_count: number;
  }>;
  player_of_evening: null | {
    player_id: string;
    nickname: string;
    games: number;
    wins: number;
    win_rate: number;
    avatar_url: string;
    basis: string;
  };
};

type StoriesData = {
  viewer_id: string;
  evenings: EveningRecap[];
  recent_games: StoryGame[];
  latest_evening: EveningRecap | null;
};

const dateText = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
};

const timeText = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
};

const winnerText = (winner: 'red' | 'black' | null) => winner === 'red' ? 'Красные' : winner === 'black' ? 'Чёрные' : '—';
const roleText = (role: PlayerGameDetailData['players'][number]['role']) => role === 'citizen' ? 'Мирный' : role === 'sheriff' ? 'Шериф' : role === 'mafia' ? 'Мафия' : role === 'don' ? 'Дон' : '—';

const Avatar = ({ src, size = 40 }: { src: string | null | undefined; size?: number }) => src ? (
  <img src={src} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover" />
) : <div style={{ width: size, height: size }} className="shrink-0 rounded-xl bg-white/[0.06]" />;

function MatchSpotlight({ gameKey, onClose }: { gameKey: string; onClose: () => void }) {
  const [detail, setDetail] = useState<PlayerGameDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/player/games/${encodeURIComponent(gameKey)}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игру');
        if (!cancelled) setDetail(body as PlayerGameDetailData);
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить игру'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gameKey]);

  const mvp = useMemo(() => detail?.players.slice().sort((a, b) => b.score.total_points - a.score.total_points || a.seat_number - b.seat_number)[0] || null, [detail]);

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-4" onClick={onClose}>
      <section onClick={(event) => event.stopPropagation()} className="max-h-[90dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#101116] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Карточка матча</div><h3 className="mt-1 text-xl font-semibold">{detail?.game.title || 'Игра 2LA Noire'}</h3></div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-lg text-white/55">×</button>
        </div>

        {loading && <div className="mt-4 rounded-2xl bg-white/[0.04] px-3 py-8 text-center text-xs text-white/35">Собираем карточку матча…</div>}
        {error && <div className="mt-4 rounded-2xl bg-rose-400/10 px-3 py-4 text-xs text-rose-200/70">{error}</div>}

        {detail && <>
          <div className={`mt-4 rounded-[24px] border p-5 text-center ${detail.game.winner_team === 'red' ? 'border-rose-300/15 bg-rose-400/[0.06]' : 'border-white/10 bg-white/[0.045]'}`}>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Игра №{detail.game.game_number}</div>
            <div className="mt-2 text-2xl font-black">{detail.game.winner_team === 'red' ? '🔴' : '⚫'} Победа: {winnerText(detail.game.winner_team)}</div>
            <div className="mt-2 text-[11px] text-white/35">{[dateText(detail.game.date), detail.game.table_name, detail.game.judge_name ? `ведущий ${detail.game.judge_name}` : null].filter(Boolean).join(' · ')}</div>
          </div>

          {mvp && <div className="mt-3 rounded-[22px] border border-amber-300/15 bg-amber-300/[0.05] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/60">⭐ MVP матча · по игровым баллам</div>
            <div className="mt-3 flex items-center gap-3">
              <Avatar src={mvp.avatar_url} size={48} />
              <div className="min-w-0 flex-1"><div className="truncate text-base font-semibold">{mvp.nickname}</div><div className="mt-0.5 text-xs text-white/35">#{mvp.seat_number} · {roleText(mvp.role)} · {mvp.won ? 'победа' : 'поражение'}</div></div>
              <div className="text-right"><div className="text-xl font-black">{mvp.score.total_points > 0 ? '+' : ''}{mvp.score.total_points.toLocaleString('ru-RU')}</div><div className="text-[9px] text-white/30">баллов</div></div>
            </div>
          </div>}

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {detail.players.map((player) => <div key={player.participant_id} className={`rounded-2xl border p-2.5 ${player.won ? 'border-emerald-300/10 bg-emerald-300/[0.035]' : 'border-white/[0.04] bg-white/[0.025]'}`}>
              <div className="flex items-center gap-2"><Avatar src={player.avatar_url} size={32} /><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{player.seat_number}. {player.nickname}</div><div className="text-[9px] text-white/30">{roleText(player.role)}</div></div></div>
              <div className="mt-2 flex items-center justify-between text-[9px]"><span className={player.won ? 'text-emerald-300' : 'text-white/30'}>{player.won ? 'Победа' : 'Поражение'}</span><span className="font-semibold text-white/60">{player.score.total_points > 0 ? '+' : ''}{player.score.total_points.toLocaleString('ru-RU')}</span></div>
            </div>)}
          </div>

          {(detail.protocol.first_killed || detail.players.some((player) => player.best_move) || detail.protocol.ppk_culprit) && <div className="mt-3 rounded-[20px] bg-white/[0.035] p-3 text-[11px] text-white/45">
            {detail.protocol.first_killed && <div>🎯 ПУ: <strong className="text-white/75">{detail.protocol.first_killed.nickname}</strong></div>}
            {detail.players.filter((player) => player.best_move).map((player) => <div key={`bm:${player.participant_id}`} className="mt-1">🧠 ЛХ: <strong className="text-white/75">{player.nickname}</strong>{player.best_move_seats.length ? ` · оставил ${player.best_move_seats.join(', ')}` : ''}</div>)}
            {detail.protocol.ppk_culprit && <div className="mt-1">⚠️ ППК: <strong className="text-white/75">{detail.protocol.ppk_culprit.nickname}</strong></div>}
          </div>}
        </>}
      </section>
    </div>
  );
}

export default function PlayerStoriesPanel() {
  const [data, setData] = useState<StoriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEveningId, setSelectedEveningId] = useState<string | null>(null);
  const [selectedGameKey, setSelectedGameKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch('/api/player/stories', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить ленту клуба');
        if (!cancelled) {
          setData(body as StoriesData);
          setSelectedEveningId(body?.latest_evening?.id || null);
        }
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить ленту клуба'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedEvening = data?.evenings.find((evening) => evening.id === selectedEveningId) || data?.latest_evening || null;

  if (loading) return <div className="rounded-2xl bg-white/[0.04] px-3 py-8 text-center text-xs text-white/35">Собираем историю клуба…</div>;
  if (error) return <div className="rounded-2xl bg-rose-400/10 px-3 py-4 text-xs text-rose-200/70">{error}</div>;
  if (!data || !data.recent_games.length) return <div className="rounded-2xl bg-white/[0.04] px-4 py-8 text-center"><div className="text-2xl">📖</div><div className="mt-2 text-sm font-semibold">История только начинается</div><p className="mt-1 text-xs text-white/35">После завершённых игр здесь появятся матчи и итоги вечеров.</p></div>;

  return <>
    {selectedEvening && <div className="rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Итоги вечера · {dateText(selectedEvening.starts_at)}</div><div className="mt-1 truncate text-base font-semibold">{selectedEvening.title}</div><div className="mt-1 text-[10px] text-white/30">{[selectedEvening.venue, `${selectedEvening.games} игр`, `${selectedEvening.attended || selectedEvening.players} игроков`].filter(Boolean).join(' · ')}</div></div>
        {data.evenings.length > 1 && <select value={selectedEvening.id} onChange={(event) => setSelectedEveningId(event.target.value)} className="max-w-[110px] rounded-xl border border-white/10 bg-[#18191f] px-2 py-2 text-[10px] text-white/60 outline-none">{data.evenings.map((evening) => <option key={evening.id} value={evening.id}>{dateText(evening.starts_at)}</option>)}</select>}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><div><div className="text-[9px] uppercase tracking-[0.12em] text-rose-300/60">Красные</div><div className="mt-1 text-3xl font-black text-rose-300">{selectedEvening.score.red}</div></div><span className="text-white/20">:</span><div><div className="text-[9px] uppercase tracking-[0.12em] text-white/40">Чёрные</div><div className="mt-1 text-3xl font-black">{selectedEvening.score.black}</div></div></div>

      {selectedEvening.player_of_evening && <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200/10 bg-amber-200/[0.04] p-3"><Avatar src={selectedEvening.player_of_evening.avatar_url} size={42} /><div className="min-w-0 flex-1"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-100/45">👑 Игрок вечера · по результатам</div><div className="mt-0.5 truncate text-sm font-semibold">{selectedEvening.player_of_evening.nickname}</div><div className="mt-0.5 text-[10px] text-white/30">{selectedEvening.player_of_evening.wins}/{selectedEvening.player_of_evening.games} побед · {selectedEvening.player_of_evening.win_rate}%</div></div></div>}

      <EveningVotingPanel eveningId={selectedEvening.id} />

      <div className="mt-4"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Как шёл вечер</div><div className="mt-2 space-y-1.5">{selectedEvening.timeline.map((item) => <button key={item.game_key} type="button" onClick={() => setSelectedGameKey(item.game_key)} className="flex w-full items-center gap-3 rounded-xl bg-black/20 px-3 py-2 text-left"><div className={`h-2 w-2 shrink-0 rounded-full ${item.winner_team === 'red' ? 'bg-rose-400' : 'bg-white/70'}`} /><div className="min-w-0 flex-1"><div className="text-[11px] font-medium">Игра {item.local_number} · победа {winnerText(item.winner_team).toLocaleLowerCase('ru-RU')}</div><div className="text-[9px] text-white/25">{timeText(item.played_at)}</div></div><div className="shrink-0 text-xs font-black tabular-nums"><span className="text-rose-300">{item.score_after.red}</span><span className="mx-1 text-white/20">:</span><span>{item.score_after.black}</span></div></button>)}</div></div>
    </div>}

    <div className="mt-4"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Последние матчи</div><div className="mt-2 space-y-1.5">{data.recent_games.slice(0, 8).map((game) => <button key={game.game_key} type="button" onClick={() => setSelectedGameKey(game.game_key)} className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.03] p-3 text-left"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${game.winner_team === 'red' ? 'bg-rose-400/10' : 'bg-white/[0.06]'}`}>{game.winner_team === 'red' ? '🔴' : '⚫'}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{game.title}</div><div className="mt-0.5 text-[10px] text-white/30">{dateText(game.played_at)} · {winnerText(game.winner_team)} · {game.players.length} игроков</div></div><span className="text-sm text-white/25">›</span></button>)}</div></div>

    {selectedGameKey && <MatchSpotlight gameKey={selectedGameKey} onClose={() => setSelectedGameKey(null)} />}
  </>;
}
