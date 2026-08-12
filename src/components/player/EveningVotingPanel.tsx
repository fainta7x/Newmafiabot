import React, { useEffect, useMemo, useState } from 'react';

type Category = 'sympathy' | 'best_red' | 'best_black' | 'best_sheriff';

type VotingData = {
  evening: { id: string; title: string };
  voting_open: boolean;
  deadline: string | null;
  categories: Category[];
  nominees: Array<{
    player_id: string;
    nickname: string;
    avatar_url: string;
    categories: Category[];
  }>;
  my_votes: Partial<Record<Category, string>>;
  results: Array<{ category: Category; nominee_player_id: string; votes: number }>;
};

const CATEGORY_META: Record<Category, { label: string; icon: string; hint: string }> = {
  sympathy: { label: 'Симпатия', icon: '❤️', hint: 'Кому хочется отдать личную симпатию вечера' },
  best_red: { label: 'Красный', icon: '🔴', hint: 'Лучший игрок за красную команду' },
  best_black: { label: 'Чёрный', icon: '⚫', hint: 'Лучший игрок за чёрную команду' },
  best_sheriff: { label: 'Шериф', icon: '⭐', hint: 'Лучшее выступление за Шерифа' },
};

const deadlineText = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

export default function EveningVotingPanel({ eveningId }: { eveningId: string }) {
  const [data, setData] = useState<VotingData | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>('sympathy');
  const [savingPlayerId, setSavingPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);

  const load = async () => {
    try {
      const response = await fetch(`/api/player/stories/${encodeURIComponent(eveningId)}/voting`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (response.status === 403 || response.status === 409) {
        setAvailable(false);
        return;
      }
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить голосование');
      setAvailable(true);
      setData(body as VotingData);
    } catch {
      setAvailable(false);
    }
  };

  useEffect(() => {
    setData(null);
    setAvailable(true);
    setMessage(null);
    void load();
  }, [eveningId]);

  const nominees = useMemo(() => data?.nominees.filter((nominee) => nominee.categories.includes(activeCategory)) || [], [data, activeCategory]);
  const resultByNominee = useMemo(() => new Map((data?.results || []).filter((item) => item.category === activeCategory).map((item) => [item.nominee_player_id, item.votes])), [data, activeCategory]);
  const myVote = data?.my_votes?.[activeCategory] || null;
  const maxVotes = Math.max(1, ...resultByNominee.values());

  const vote = async (nomineePlayerId: string) => {
    if (!data?.voting_open || savingPlayerId) return;
    setSavingPlayerId(nomineePlayerId);
    setMessage(null);
    try {
      const response = await fetch(`/api/player/stories/${encodeURIComponent(eveningId)}/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: activeCategory, nominee_player_id: nomineePlayerId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить голос');
      setMessage('Голос сохранён');
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось сохранить голос');
    } finally {
      setSavingPlayerId(null);
    }
  };

  if (!available || !data) return null;

  return (
    <div className="mt-4 rounded-[22px] border border-fuchsia-300/10 bg-fuchsia-300/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-100/50">🗳️ Голосование игроков</div><div className="mt-1 text-xs font-semibold">Выбери героев этого вечера</div></div>
        <div className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${data.voting_open ? 'bg-emerald-300/10 text-emerald-200/70' : 'bg-white/[0.06] text-white/35'}`}>{data.voting_open ? 'открыто' : 'закрыто'}</div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-black/20 p-1">
        {(Object.keys(CATEGORY_META) as Category[]).map((category) => <button key={category} type="button" onClick={() => { setActiveCategory(category); setMessage(null); }} className={`min-h-10 rounded-lg px-1 text-[9px] font-semibold ${activeCategory === category ? 'bg-white text-black' : 'text-white/40'}`}><span className="block text-sm">{CATEGORY_META[category].icon}</span>{CATEGORY_META[category].label}</button>)}
      </div>

      <p className="mt-3 text-[10px] leading-4 text-white/30">{CATEGORY_META[activeCategory].hint}{data.voting_open && data.deadline ? ` · до ${deadlineText(data.deadline)}` : ''}</p>

      {nominees.length ? <div className="mt-2 grid grid-cols-2 gap-1.5">{nominees.map((nominee) => {
        const selected = myVote === nominee.player_id;
        const votes = resultByNominee.get(nominee.player_id) || 0;
        const showResult = Boolean(myVote) || !data.voting_open;
        return <button key={nominee.player_id} type="button" disabled={!data.voting_open || Boolean(savingPlayerId)} onClick={() => void vote(nominee.player_id)} className={`relative overflow-hidden rounded-2xl border p-2.5 text-left transition ${selected ? 'border-fuchsia-200/35 bg-fuchsia-200/[0.10]' : 'border-white/[0.05] bg-black/20'} disabled:cursor-default`}>
          {showResult && <span className="absolute bottom-0 left-0 h-0.5 bg-fuchsia-300/45" style={{ width: `${Math.round((votes / maxVotes) * 100)}%` }} />}
          <div className="flex items-center gap-2"><img src={nominee.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="h-9 w-9 shrink-0 rounded-xl object-cover" /><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{nominee.nickname}</div><div className="mt-0.5 text-[9px] text-white/30">{selected ? 'Ваш выбор' : showResult ? `${votes} голос.` : 'Выбрать'}</div></div>{selected && <span className="text-sm">✓</span>}</div>
        </button>;
      })}</div> : <div className="mt-3 rounded-xl bg-black/20 px-3 py-4 text-center text-[10px] text-white/30">В этой номинации пока нет подходящих кандидатов.</div>}

      {message && <div className="mt-2 text-center text-[10px] text-white/40">{message}</div>}
      <p className="mt-3 text-[9px] leading-4 text-white/20">Голос можно менять до закрытия голосования. Результаты появляются после вашего выбора, чтобы не подталкивать к лидеру заранее.</p>
    </div>
  );
}
