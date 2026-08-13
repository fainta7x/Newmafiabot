import { useEffect, useMemo, useState } from 'react';

type ProgressTab = 'goals' | 'achievements' | 'titles';
type AchievementCategory = 'all' | 'career' | 'wins' | 'form' | 'sides' | 'roles' | 'special';
type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

type Requirement = {
  label: string;
  current: number;
  target: number;
  completed: boolean;
};

type TitleItem = {
  id: string;
  label: string;
  icon: string;
  hint: string;
  unlocked: boolean;
  requirements: Requirement[];
};

type AchievementItem = {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  category: Exclude<AchievementCategory, 'all'>;
  progress: number;
  target: number;
  completed: boolean;
};

type ChallengeItem = {
  id: string;
  title: string;
  icon: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
};

type ProgressionData = {
  version: number;
  player: {
    id: string;
    nickname: string;
    elo: number;
    game_level: string;
    avatar_url: string;
    selected_title: TitleItem | null;
  };
  summary: {
    games: number;
    wins: number;
    win_rate: number;
    streak: number;
    best_streak: number;
    red: { games: number; wins: number };
    black: { games: number; wins: number };
    strongest_role: null | { role: string; label: string; games: number; wins: number; win_rate: number };
    form: boolean[];
  };
  challenges: ChallengeItem[];
  achievements: AchievementItem[];
  titles: TitleItem[];
};

const RARITY_META: Record<Rarity, { label: string; className: string }> = {
  common: { label: 'Обычное', className: 'text-white/35' },
  rare: { label: 'Редкое', className: 'text-sky-200/65' },
  epic: { label: 'Эпическое', className: 'text-violet-200/70' },
  legendary: { label: 'Легендарное', className: 'text-amber-200/80' },
};

const CATEGORY_LABELS: Array<{ id: AchievementCategory; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'career', label: 'Карьера' },
  { id: 'wins', label: 'Победы' },
  { id: 'form', label: 'Серии' },
  { id: 'sides', label: 'Стороны' },
  { id: 'roles', label: 'Роли' },
  { id: 'special', label: 'Особые' },
];

const levelLabel = (value: string) => value === 'novice' ? 'Новичок' : value === 'rating' ? 'Рейтинговый' : value === 'tournament' ? 'Турнирный' : 'Клубный игрок';
const percent = (value: number, target: number) => Math.min(100, Math.round((value / Math.max(1, target)) * 100));

const loadImage = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});

const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось собрать PNG')), 'image/png');
});

const drawCard = async (data: ProgressionData): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, '#19151d');
  gradient.addColorStop(0.5, '#0c0d11');
  gradient.addColorStop(1, '#171015');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  ctx.fillRect(60, 60, 960, 1230);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 60, 960, 1230);

  ctx.fillStyle = '#fff';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillText('2LA NOIRE', 105, 125);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillText('SPORT MAFIA · PLAYER CARD', 105, 160);

  const avatar = await loadImage(data.player.avatar_url);
  ctx.save();
  ctx.beginPath();
  ctx.arc(540, 370, 168, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    const scale = Math.max(336 / avatar.width, 336 / avatar.height);
    const width = avatar.width * scale;
    const height = avatar.height * scale;
    ctx.drawImage(avatar, 540 - width / 2, 370 - height / 2, width, height);
  } else {
    ctx.fillStyle = '#26232b';
    ctx.fillRect(372, 202, 336, 336);
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '800 68px system-ui, sans-serif';
  const nickname = data.player.nickname.length > 22 ? `${data.player.nickname.slice(0, 21)}…` : data.player.nickname;
  ctx.fillText(nickname, 540, 610);
  ctx.fillStyle = data.player.selected_title ? '#f4d6a0' : 'rgba(255,255,255,0.38)';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillText(data.player.selected_title ? `${data.player.selected_title.icon} ${data.player.selected_title.label}` : levelLabel(data.player.game_level), 540, 655);

  const boxes = [
    { x: 105, label: 'ELO', value: Math.round(data.player.elo).toString() },
    { x: 405, label: 'ИГР', value: data.summary.games.toString() },
    { x: 705, label: 'ПОБЕД', value: `${data.summary.win_rate}%` },
  ];
  ctx.textAlign = 'left';
  for (const box of boxes) {
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.fillRect(box.x, 725, 270, 150);
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(box.label, box.x + 24, 766);
    ctx.fillStyle = '#fff';
    ctx.font = '800 48px system-ui, sans-serif';
    ctx.fillText(box.value, box.x + 24, 830);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillText('ЛУЧШАЯ СЕРИЯ', 105, 945);
  ctx.fillStyle = '#fff';
  ctx.font = '800 42px system-ui, sans-serif';
  ctx.fillText(String(data.summary.best_streak || 0), 105, 1005);

  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillText('СИЛЬНЕЙШАЯ РОЛЬ', 595, 945);
  ctx.fillStyle = '#fff';
  ctx.font = '700 28px system-ui, sans-serif';
  const strongest = data.summary.strongest_role;
  ctx.fillText(strongest ? `${strongest.label} · ${strongest.win_rate}%` : 'пока не определена', 595, 1002);

  ctx.fillStyle = 'rgba(255,255,255,0.46)';
  ctx.font = '500 23px system-ui, sans-serif';
  ctx.fillText(`${data.summary.wins} побед · ${data.summary.games} игр`, 105, 1150);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillText('2LA noire · Тула', 105, 1215);
  return canvasBlob(canvas);
};

export default function PlayerProgressionPanel() {
  const [data, setData] = useState<ProgressionData | null>(null);
  const [tab, setTab] = useState<ProgressTab>('goals');
  const [category, setCategory] = useState<AchievementCategory>('all');
  const [showAllGoals, setShowAllGoals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/player/progression', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить прогресс');
      setData(body as ProgressionData);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить прогресс');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const goals = useMemo(() => {
    if (!data) return [];
    const ordered = data.challenges.slice().sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      return percent(b.progress, b.target) - percent(a.progress, a.target);
    });
    return showAllGoals ? ordered : ordered.slice(0, 6);
  }, [data, showAllGoals]);

  const achievements = useMemo(() => {
    if (!data) return [];
    const filtered = category === 'all' ? data.achievements : data.achievements.filter((item) => item.category === category);
    return filtered.slice().sort((a, b) => Number(b.completed) - Number(a.completed) || percent(b.progress, b.target) - percent(a.progress, a.target));
  }, [category, data]);

  const selectTitle = async (titleId: string | null) => {
    if (!data || savingTitle) return;
    setSavingTitle(true);
    setMessage(null);
    try {
      const response = await fetch('/api/player/progression/title', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title_id: titleId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось выбрать звание');
      await load();
      setMessage(titleId ? 'Звание установлено в профиль' : 'Звание снято');
    } catch (err: any) {
      setMessage(err?.message || 'Не удалось выбрать звание');
    } finally {
      setSavingTitle(false);
    }
  };

  const shareCard = async () => {
    if (!data || sharing) return;
    setSharing(true);
    setMessage(null);
    try {
      const blob = await drawCard(data);
      const safeName = data.player.nickname.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'player';
      const file = new File([blob], `2la-noire-${safeName}.png`, { type: 'image/png' });
      const shareNavigator = navigator as Navigator & { canShare?: (shareData: ShareData) => boolean };
      if (navigator.share && (!shareNavigator.canShare || shareNavigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `${data.player.nickname} · 2LA noire`, text: 'Моя карточка игрока 2LA noire', files: [file] });
        setMessage('Карточка готова к отправке');
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setMessage('PNG сохранён на устройство');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') setMessage(err?.message || 'Не удалось собрать карточку');
    } finally {
      setSharing(false);
    }
  };

  if (loading) return <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] px-4 py-7 text-center text-xs text-white/30">Собираем карьерный прогресс…</div>;
  if (error || !data) return <div className="rounded-3xl border border-rose-300/10 bg-rose-300/[0.04] px-4 py-4 text-xs text-rose-100/65">{error || 'Прогресс недоступен'}</div>;

  const completedAchievements = data.achievements.filter((item) => item.completed).length;
  const completedGoals = data.challenges.filter((item) => item.completed).length;
  const unlockedTitles = data.titles.filter((item) => item.unlocked).length;

  return (
    <section className="space-y-3">
      <div className="rounded-[26px] border border-white/10 bg-gradient-to-br from-white/[0.075] to-white/[0.025] p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Карьерная система</div><h2 className="mt-1 text-xl font-black">Прогресс</h2><p className="mt-1 text-[11px] leading-4 text-white/35">Долгие цели, достижения и звания, которые нужно действительно заслужить.</p></div>
          {data.player.selected_title && <div className="max-w-[42%] rounded-2xl border border-amber-200/10 bg-amber-200/[0.04] px-3 py-2 text-right"><div className="text-lg">{data.player.selected_title.icon}</div><div className="mt-0.5 text-[9px] font-semibold text-amber-100/60">{data.player.selected_title.label}</div></div>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-2xl bg-black/20 p-2.5"><div className="text-lg font-black">{completedGoals}<span className="text-white/20">/{data.challenges.length}</span></div><div className="text-[8px] text-white/25">целей</div></div>
          <div className="rounded-2xl bg-black/20 p-2.5"><div className="text-lg font-black">{completedAchievements}<span className="text-white/20">/{data.achievements.length}</span></div><div className="text-[8px] text-white/25">достижений</div></div>
          <div className="rounded-2xl bg-black/20 p-2.5"><div className="text-lg font-black">{unlockedTitles}<span className="text-white/20">/{data.titles.length}</span></div><div className="text-[8px] text-white/25">званий</div></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.05] p-1">
        {([
          ['goals', 'Цели'],
          ['achievements', 'Достижения'],
          ['titles', 'Звания'],
        ] as Array<[ProgressTab, string]>).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`min-h-10 rounded-xl px-2 text-[10px] font-semibold ${tab === id ? 'bg-white text-black' : 'text-white/45'}`}>{label}</button>
        ))}
      </div>

      {tab === 'goals' && <div className="space-y-2">
        <div className="flex items-end justify-between gap-3 px-1"><div><div className="text-xs font-semibold">Ближайшие испытания</div><div className="mt-0.5 text-[9px] text-white/25">Сложные ориентиры, а не награды за пару игр.</div></div>{data.challenges.length > 6 && <button type="button" onClick={() => setShowAllGoals((value) => !value)} className="text-[9px] font-semibold text-white/35">{showAllGoals ? 'Свернуть' : 'Все цели'}</button>}</div>
        {goals.map((item) => {
          const value = percent(item.progress, item.target);
          return <div key={item.id} className={`rounded-2xl border p-3 ${item.completed ? 'border-emerald-300/10 bg-emerald-300/[0.035]' : 'border-white/[0.05] bg-white/[0.025]'}`}>
            <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/20 text-lg">{item.icon}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><div className="text-[11px] font-semibold">{item.title}</div><div className={`shrink-0 text-[9px] ${item.completed ? 'text-emerald-300' : 'text-white/30'}`}>{item.completed ? 'выполнено' : `${item.progress}/${item.target}`}</div></div><div className="mt-1 text-[9px] leading-3.5 text-white/30">{item.description}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${item.completed ? 'bg-emerald-400' : 'bg-white/45'}`} style={{ width: `${value}%` }} /></div></div></div>
          </div>;
        })}
      </div>}

      {tab === 'achievements' && <div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{CATEGORY_LABELS.map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`shrink-0 rounded-xl px-3 py-2 text-[9px] font-semibold ${category === item.id ? 'bg-white text-black' : 'bg-white/[0.04] text-white/40'}`}>{item.label}</button>)}</div>
        <div className="mt-1 grid grid-cols-2 gap-2">{achievements.map((item) => {
          const rarity = RARITY_META[item.rarity];
          const value = percent(item.progress, item.target);
          return <div key={item.id} className={`rounded-2xl border p-3 ${item.completed ? 'border-white/10 bg-white/[0.045]' : 'border-white/[0.04] bg-white/[0.018] opacity-70'}`}>
            <div className="flex items-start justify-between gap-2"><span className={`text-xl ${item.completed ? '' : 'grayscale'}`}>{item.icon}</span><span className={`text-[8px] font-semibold ${rarity.className}`}>{rarity.label}</span></div>
            <div className="mt-2 text-[10px] font-semibold leading-4">{item.name}</div><div className="mt-1 text-[8px] leading-3 text-white/25">{item.description}</div>
            <div className="mt-2 flex items-center justify-between text-[8px]"><span className={item.completed ? 'text-emerald-300' : 'text-white/25'}>{item.completed ? '✓ получено' : `${item.progress}/${item.target}`}</span><span className="text-white/20">{value}%</span></div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${item.completed ? 'bg-emerald-400' : 'bg-white/35'}`} style={{ width: `${value}%` }} /></div>
          </div>;
        })}</div>
      </div>}

      {tab === 'titles' && <div className="space-y-2">
        <div className="rounded-2xl border border-amber-200/10 bg-amber-200/[0.025] p-3"><div className="text-[10px] font-semibold text-amber-100/55">Звание — верхушка карьерной ветки</div><div className="mt-1 text-[9px] leading-4 text-white/30">Большинство званий требуют одновременно дистанцию, победы и серию. Открытое звание можно поставить рядом с ником.</div></div>
        {data.titles.map((title) => {
          const selected = data.player.selected_title?.id === title.id;
          return <div key={title.id} className={`rounded-[22px] border p-3.5 ${selected ? 'border-amber-200/25 bg-amber-200/[0.065]' : title.unlocked ? 'border-white/10 bg-white/[0.04]' : 'border-white/[0.04] bg-white/[0.018]'}`}>
            <div className="flex items-start gap-3"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-black/20 text-xl ${title.unlocked ? '' : 'grayscale opacity-50'}`}>{title.icon}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><div className="text-xs font-black">{title.label}</div><span className={`shrink-0 text-[8px] font-semibold ${title.unlocked ? 'text-amber-200/70' : 'text-white/20'}`}>{selected ? 'выбрано' : title.unlocked ? 'открыто' : 'закрыто'}</span></div><div className="mt-0.5 text-[9px] text-white/25">{title.hint}</div></div></div>
            <div className="mt-3 space-y-1.5">{title.requirements.map((req) => <div key={req.label} className="flex items-center justify-between gap-3 rounded-xl bg-black/15 px-2.5 py-2"><div className={`min-w-0 truncate text-[9px] ${req.completed ? 'text-white/55' : 'text-white/30'}`}>{req.completed ? '✓' : '○'} {req.label}</div><div className={`shrink-0 text-[9px] font-semibold ${req.completed ? 'text-emerald-300' : 'text-white/30'}`}>{req.current}/{req.target}</div></div>)}</div>
            {title.unlocked && <button type="button" disabled={savingTitle} onClick={() => void selectTitle(selected ? null : title.id)} className={`mt-3 min-h-10 w-full rounded-xl text-[10px] font-semibold ${selected ? 'border border-white/10 bg-white/[0.04] text-white/45' : 'bg-white text-black'} disabled:opacity-40`}>{selected ? 'Снять звание' : 'Выбрать звание'}</button>}
          </div>;
        })}
        <button type="button" disabled={sharing} onClick={() => void shareCard()} className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/55 disabled:opacity-40">{sharing ? 'Собираем карточку…' : 'Поделиться карточкой игрока'}</button>
      </div>}

      {message && <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-center text-[9px] text-white/40">{message}</div>}
    </section>
  );
}
