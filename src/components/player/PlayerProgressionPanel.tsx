import React, { useEffect, useMemo, useState } from 'react';

type TitleItem = {
  id: string;
  label: string;
  icon: string;
  hint: string;
  unlocked: boolean;
};

type ProgressionData = {
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
    red: { games: number; wins: number };
    black: { games: number; wins: number };
    strongest_role: null | { role: string; label: string; games: number; wins: number; win_rate: number };
    form: boolean[];
  };
  challenges: Array<{
    id: string;
    title: string;
    icon: string;
    progress: number;
    target: number;
    completed: boolean;
    reward: string;
  }>;
  titles: TitleItem[];
};

const levelLabel = (value: string) => value === 'novice' ? 'Новичок' : value === 'rating' ? 'Рейтинговый' : value === 'tournament' ? 'Турнирный' : 'Клубный игрок';

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

  ctx.fillStyle = '#ffffff';
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
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(540, 370, 170, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
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
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 48px system-ui, sans-serif';
    ctx.fillText(box.value, box.x + 24, 830);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillText('ТЕКУЩАЯ ФОРМА', 105, 945);
  data.summary.form.forEach((won, index) => {
    ctx.fillStyle = won ? '#54d39b' : '#ed6b7e';
    ctx.beginPath();
    ctx.arc(125 + index * 58, 995, 17, 0, Math.PI * 2);
    ctx.fill();
  });
  if (!data.summary.form.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '500 22px system-ui, sans-serif';
    ctx.fillText('нет завершённых игр', 105, 1002);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillText('СИЛЬНЕЙШАЯ РОЛЬ', 595, 945);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 28px system-ui, sans-serif';
  const strongest = data.summary.strongest_role;
  ctx.fillText(strongest ? `${strongest.label} · ${strongest.win_rate}%` : 'пока не определена', 595, 1002);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(105, 1090);
  ctx.lineTo(975, 1090);
  ctx.stroke();

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAllChallenges, setShowAllChallenges] = useState(false);
  const [showTitles, setShowTitles] = useState(false);

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

  const activeChallenges = useMemo(() => {
    if (!data) return [];
    const ordered = data.challenges.slice().sort((a, b) => Number(a.completed) - Number(b.completed) || (b.progress / b.target) - (a.progress / a.target));
    return showAllChallenges ? ordered : ordered.slice(0, 3);
  }, [data, showAllChallenges]);

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
      if (!response.ok) throw new Error(body?.error || 'Не удалось выбрать титул');
      await load();
      setMessage(titleId ? 'Титул выбран' : 'Титул снят');
    } catch (err: any) {
      setMessage(err?.message || 'Не удалось выбрать титул');
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
      const shareNavigator = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
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

  if (loading) return <div className="mt-4 rounded-2xl bg-white/[0.035] px-3 py-5 text-center text-[10px] text-white/30">Собираем карьерный прогресс…</div>;
  if (error || !data) return <div className="mt-4 rounded-2xl bg-rose-400/[0.07] px-3 py-3 text-[10px] text-rose-200/60">{error || 'Прогресс недоступен'}</div>;

  const completedCount = data.challenges.filter((item) => item.completed).length;
  const unlockedTitles = data.titles.filter((item) => item.unlocked);

  return <div className="mt-5 space-y-3">
    <div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">🎯 Челленджи и стиль</div><div className="mt-1 text-xs text-white/35">{completedCount}/{data.challenges.length} целей · {unlockedTitles.length} титулов открыто</div></div><button type="button" onClick={() => setShowAllChallenges((value) => !value)} className="text-[10px] font-semibold text-white/35">{showAllChallenges ? 'Свернуть' : 'Все цели'}</button></div>

    <div className="space-y-1.5">{activeChallenges.map((item) => {
      const percent = Math.min(100, Math.round((item.progress / Math.max(1, item.target)) * 100));
      return <div key={item.id} className={`rounded-2xl border p-3 ${item.completed ? 'border-emerald-300/10 bg-emerald-300/[0.035]' : 'border-white/[0.05] bg-white/[0.025]'}`}><div className="flex items-center gap-2.5"><span className="text-lg">{item.icon}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold">{item.title}</span><span className={`shrink-0 text-[9px] ${item.completed ? 'text-emerald-300' : 'text-white/30'}`}>{item.completed ? 'готово' : `${item.progress}/${item.target}`}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${item.completed ? 'bg-emerald-400' : 'bg-white/45'}`} style={{ width: `${percent}%` }} /></div><div className="mt-1 text-[9px] text-white/25">{item.reward}</div></div></div></div>;
    })}</div>

    <button type="button" onClick={() => setShowTitles((value) => !value)} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-amber-200/10 bg-amber-200/[0.035] px-3 text-left"><span><span className="block text-[10px] uppercase tracking-[0.12em] text-amber-100/40">Титул профиля</span><span className="mt-0.5 block text-xs font-semibold">{data.player.selected_title ? `${data.player.selected_title.icon} ${data.player.selected_title.label}` : 'Без титула'}</span></span><span className="text-white/25">{showTitles ? '⌃' : '⌄'}</span></button>

    {showTitles && <div className="grid grid-cols-2 gap-1.5">{data.titles.map((title) => {
      const selected = data.player.selected_title?.id === title.id;
      return <button key={title.id} type="button" disabled={!title.unlocked || savingTitle} onClick={() => void selectTitle(selected ? null : title.id)} className={`rounded-2xl border p-3 text-left ${selected ? 'border-amber-200/25 bg-amber-200/[0.08]' : title.unlocked ? 'border-white/[0.06] bg-white/[0.03]' : 'border-white/[0.03] bg-black/10 opacity-45'}`}><div className="flex items-center justify-between"><span className="text-lg">{title.icon}</span>{selected && <span className="text-[9px] text-amber-200/60">выбран</span>}</div><div className="mt-2 text-[11px] font-semibold">{title.label}</div><div className="mt-1 text-[9px] leading-3 text-white/30">{title.unlocked ? title.hint : `🔒 ${title.hint}`}</div></button>;
    })}</div>}

    <div className="rounded-[22px] border border-white/10 bg-gradient-to-br from-white/[0.075] to-white/[0.025] p-4">
      <div className="flex items-start gap-3"><img src={data.player.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="h-16 w-16 shrink-0 rounded-2xl object-cover" /><div className="min-w-0 flex-1"><div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25">Player card</div><div className="mt-1 truncate text-lg font-black">{data.player.nickname}</div><div className="mt-0.5 truncate text-[10px] text-amber-100/45">{data.player.selected_title ? `${data.player.selected_title.icon} ${data.player.selected_title.label}` : levelLabel(data.player.game_level)}</div></div><div className="text-right"><div className="text-[9px] text-white/25">ELO</div><div className="text-xl font-black">{Math.round(data.player.elo)}</div></div></div>
      <div className="mt-4 grid grid-cols-3 gap-1.5 text-center"><div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.summary.games}</div><div className="text-[8px] text-white/25">игр</div></div><div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.summary.win_rate}%</div><div className="text-[8px] text-white/25">побед</div></div><div className="rounded-xl bg-black/20 p-2"><div className="truncate text-xs font-bold">{data.summary.strongest_role?.label || '—'}</div><div className="text-[8px] text-white/25">роль</div></div></div>
      <div className="mt-3 flex items-center justify-between gap-3"><div className="flex gap-1">{data.summary.form.map((won, index) => <span key={index} className={`h-2.5 w-2.5 rounded-full ${won ? 'bg-emerald-400' : 'bg-rose-400'}`} />)}</div><button type="button" disabled={sharing} onClick={() => void shareCard()} className="min-h-10 rounded-xl bg-white px-3 text-[10px] font-bold text-black disabled:opacity-50">{sharing ? 'Собираем PNG…' : 'Поделиться PNG'}</button></div>
    </div>

    {message && <div className="text-center text-[9px] text-white/30">{message}</div>}
  </div>;
}
