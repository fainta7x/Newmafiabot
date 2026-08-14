import { useEffect, useState } from 'react';

type PersonRelationship = {
  player_id: string;
  nickname: string;
  games: number;
  wins: number;
  win_rate: number;
  avatar_url: string;
};

type ClubDuo = {
  a_id: string;
  a_name: string;
  b_id: string;
  b_name: string;
  team: 'red' | 'black';
  games: number;
  wins: number;
  win_rate: number;
  a_avatar_url: string;
  b_avatar_url: string;
};

type RelationshipData = {
  rivals: PersonRelationship[];
  teammates: PersonRelationship[];
  club_duos: { red: ClubDuo[]; black: ClubDuo[] };
};

function Avatar({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  return src ? (
    <img src={src} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover" />
  ) : (
    <div style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-xl bg-white/[0.06] text-xs font-semibold text-white/45">{name.slice(0, 1).toUpperCase()}</div>
  );
}

function PersonRow({ item, kind }: { item: PersonRelationship; kind: 'rival' | 'mate' }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/15 p-2.5">
      <Avatar src={item.avatar_url} name={item.nickname} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold">{item.nickname}</div>
        <div className="mt-0.5 text-[10px] text-white/30">{kind === 'rival' ? 'встречались' : 'вместе'} {item.games} игр · {item.wins} побед</div>
      </div>
      <div className="shrink-0 text-sm font-black text-white/75">{item.win_rate}%</div>
    </div>
  );
}

function DuoRow({ duo }: { duo: ClubDuo }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-black/15 p-2.5">
      <div className="flex -space-x-2">
        <Avatar src={duo.a_avatar_url} name={duo.a_name} size={32} />
        <Avatar src={duo.b_avatar_url} name={duo.b_name} size={32} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold">{duo.a_name} + {duo.b_name}</div>
        <div className="mt-0.5 text-[10px] text-white/30">{duo.wins}/{duo.games} побед · {duo.win_rate}%</div>
      </div>
    </div>
  );
}

export default function PlayerClubConnections() {
  const [data, setData] = useState<RelationshipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/relationships', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить связи игроков');
        if (!cancelled) setData(body as RelationshipData);
      })
      .catch((loadError: any) => { if (!cancelled) setError(loadError?.message || 'Не удалось загрузить связи игроков'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="rounded-[26px] border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-xs text-white/35">Считаем противостояния и связки…</div>;
  if (error) return <div className="rounded-2xl bg-rose-400/10 px-3 py-4 text-xs text-rose-200/70">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <section className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Противостояния</div>
        <h2 className="mt-1 text-lg font-semibold">С кем чаще пересекаешься</h2>
        <div className="mt-3 space-y-1.5">
          {data.rivals.slice(0, 6).map((item) => <PersonRow key={item.player_id} item={item} kind="rival" />)}
          {!data.rivals.length && <p className="rounded-2xl bg-black/15 px-3 py-4 text-xs text-white/30">После новых игр здесь появятся частые соперники.</p>}
        </div>
      </section>

      <section className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Напарники</div>
        <h2 className="mt-1 text-lg font-semibold">С кем хорошо играется вместе</h2>
        <div className="mt-3 space-y-1.5">
          {data.teammates.slice(0, 6).map((item) => <PersonRow key={item.player_id} item={item} kind="mate" />)}
          {!data.teammates.length && <p className="rounded-2xl bg-black/15 px-3 py-4 text-xs text-white/30">Совместные игры появятся здесь.</p>}
        </div>
      </section>

      <section className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Лучшие связки клуба</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold text-rose-300/70">🔴 За красных</div>
            <div className="space-y-1.5">{data.club_duos.red.slice(0, 3).map((duo) => <DuoRow key={`red:${duo.a_id}:${duo.b_id}`} duo={duo} />)}{!data.club_duos.red.length && <div className="text-[10px] text-white/25">Нужно больше совместных игр.</div>}</div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold text-white/55">⚫ За чёрных</div>
            <div className="space-y-1.5">{data.club_duos.black.slice(0, 3).map((duo) => <DuoRow key={`black:${duo.a_id}:${duo.b_id}`} duo={duo} />)}{!data.club_duos.black.length && <div className="text-[10px] text-white/25">Нужно больше совместных игр.</div>}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
