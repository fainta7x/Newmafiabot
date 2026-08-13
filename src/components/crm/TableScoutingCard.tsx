import { useEffect, useState } from 'react';

type ScoutingData = {
  selected: number;
  summary: {
    average_elo: number;
    elo_spread: number;
    average_games: number;
    experienced_players: number;
    newcomers: number;
    hot_players: number;
    strength_label: string;
    experience_label: string;
  };
  players: Array<{
    participant_id: string;
    player_id: string;
    nickname: string;
    elo: number;
    games: number;
    wins: number;
    win_rate: number;
    recent_form: boolean[];
    avatar_url: string;
  }>;
  notes: string[];
  meta?: { safety?: string };
};

export default function TableScoutingCard({ participantIds }: { participantIds: string[] }) {
  const [data, setData] = useState<ScoutingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const signature = participantIds.filter(Boolean).slice().sort().join('|');

  useEffect(() => {
    if (participantIds.length !== 10) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void fetch('/api/crm/table-scouting', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_ids: participantIds }),
      }).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось собрать разведку стола');
        if (!cancelled) setData(body as ScoutingData);
      }).catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Не удалось собрать разведку стола');
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [signature]);

  if (participantIds.length !== 10) return null;
  if (loading && !data) return <div className="rounded-2xl border border-border-soft bg-surface-2 px-3 py-3 text-[10px] text-text-muted">🔎 Собираем разведку выбранной десятки…</div>;
  if (error && !data) return <div className="rounded-2xl border border-danger/20 bg-danger-soft px-3 py-3 text-[10px] text-danger">{error}</div>;
  if (!data) return null;

  return <div className="rounded-2xl border border-accent/15 bg-accent-soft/30 p-3 text-text-primary">
    <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-3 text-left">
      <span><span className="block text-[9px] font-black uppercase tracking-[0.13em] text-text-muted">🔎 Разведка стола</span><span className="mt-1 block text-[12px] font-black">{data.summary.strength_label}</span><span className="mt-0.5 block text-[9px] text-text-muted">{data.summary.experience_label}</span></span>
      <span className="text-[10px] text-text-muted">{expanded ? '⌃' : '⌄'}</span>
    </button>

    <div className="mt-3 grid grid-cols-4 gap-1.5 text-center"><div className="rounded-xl bg-surface-1 p-2"><div className="text-[13px] font-black">{data.summary.average_elo}</div><div className="text-[7px] text-text-muted">ср. Elo</div></div><div className="rounded-xl bg-surface-1 p-2"><div className="text-[13px] font-black">{data.summary.average_games}</div><div className="text-[7px] text-text-muted">ср. игр</div></div><div className="rounded-xl bg-surface-1 p-2"><div className="text-[13px] font-black">{data.summary.newcomers}</div><div className="text-[7px] text-text-muted">до 5 игр</div></div><div className="rounded-xl bg-surface-1 p-2"><div className="text-[13px] font-black">{data.summary.hot_players}</div><div className="text-[7px] text-text-muted">в форме</div></div></div>

    {expanded && <>
      <div className="mt-3 space-y-1.5">{data.players.map((player) => <div key={player.participant_id} className="flex items-center gap-2 rounded-xl bg-surface-1 px-2.5 py-2"><img src={player.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="h-8 w-8 shrink-0 rounded-lg object-cover" /><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-bold">{player.nickname}</div><div className="mt-0.5 flex gap-1">{player.recent_form.map((won, index) => <span key={index} className={`h-1.5 w-1.5 rounded-full ${won ? 'bg-success' : 'bg-danger'}`} />)}<span className="ml-1 text-[8px] text-text-muted">{player.games} игр · {player.win_rate}%</span></div></div><div className="text-[10px] font-black">{Math.round(player.elo)}</div></div>)}</div>
      <div className="mt-3 space-y-1">{data.notes.map((note, index) => <div key={index} className="text-[9px] leading-4 text-text-secondary">• {note}</div>)}</div>
      <p className="mt-2 text-[8px] leading-3 text-text-muted">{data.meta?.safety}</p>
    </>}
  </div>;
}
