import { buildReplayChapters } from '../../lib/replayChapters.ts';
import { circleTitle } from '../crm/gameProtocol/protocolReview';
import type { LiveBroadcastReplayFrame } from '../../lib/liveBroadcast.ts';
import type { LiveGameEvent } from '../../shared/liveGameEvents.ts';
import LiveBroadcastOverlay from '../public/LiveBroadcastOverlay.tsx';
import { buildReplayBroadcastState } from '../../lib/replayBroadcastState.ts';
import { GameRoleIcon } from '../ui/GameRole.tsx';
import { useEffect, useMemo, useState } from 'react';
import AsyncState from '../ui/AsyncState.tsx';
import { getPlayerGameRoleLabel } from '../../lib/playerGameRoleLabels.ts';

type ReplayEvent = {
  id: string;
  type: string;
  round?: number;
  title: string;
  text: string;
  players?: string[];
  player?: string | null;
  votes?: Array<{ candidate: string; candidate_name: string | null; votes: number }>;
};

type ReplayData = {
  game_key: string;
  replay_available: boolean;
  game?: { id: string; number: number; title: string; created_at: string | null; winner_team: 'red' | 'black' | null };
  players?: Array<{ participant_id: string; player_id: string | null; nickname: string; seat_number: number; role: string | null }>;
  events: ReplayEvent[];
  engine_events?: LiveGameEvent[];
  replay_frames?: LiveBroadcastReplayFrame[];
  analysis: string[];
  meta?: { source?: string };
};

type SpeechClip = {
  id: string;
  game_id: number;
  seat_number: number;
  speaker_nickname: string;
  round_number: number;
  speech_type: string;
  started_at: string;
  duration_seconds: number;
  mime_type: string;
  byte_size: number;
  audio_url: string;
};

type SpeechView = 'chronological' | 'rounds';

const roleLabel = (role: string | null) => getPlayerGameRoleLabel(role) ?? '—';
const eventIcon = (type: string) => type === 'round' ? '☀️' : type === 'nominations' ? '✋' : type === 'votes' ? '🗳️' : type === 'night' || type === 'first_killed' ? '🌙' : type === 'eliminated' ? '🚪' : type === 'ppk' ? '⚠️' : type === 'best_move' ? '🧠' : type === 'reveal' ? '🎭' : type === 'finish' ? '🏁' : '•';
const durationLabel = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return minutes ? `${minutes}:${String(rest).padStart(2, '0')}` : `${rest}с`;
};

export default function PlayerReplayScreen({ gameKey, onBack }: { gameKey: string; onBack?: () => void }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clips, setClips] = useState<SpeechClip[]>([]);
  const [clipsLoading, setClipsLoading] = useState(false);
  const [clipsError, setClipsError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [clipsRetry, setClipsRetry] = useState(0);
  const [speechView, setSpeechView] = useState<SpeechView>('chronological');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlaying(false);
    setClipsLoading(false);
    setError(null);
    setData(null);
    setClips([]);
    setClipsError(null);
    setSpeechView('chronological');
    void fetch(`/api/player/games/${encodeURIComponent(gameKey)}/replay`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить Replay');
        if (!cancelled) {
          setData(body as ReplayData);
          setStep(0);
        }
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить Replay'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gameKey, retry]);

  useEffect(() => {
    const gameId = data?.replay_available ? data.game?.id : null;
    if (!gameId) return;

    let cancelled = false;
    setClipsLoading(true);
    setClipsError(null);
    void fetch(`/api/player/speech-recordings/club-games/${encodeURIComponent(gameId)}/clips`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить записи речей');
        if (!cancelled) setClips(Array.isArray(body?.clips) ? body.clips : []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setClips([]);
          setClipsError(err?.message || 'Не удалось загрузить записи речей');
        }
      })
      .finally(() => { if (!cancelled) setClipsLoading(false); });

    return () => { cancelled = true; };
  }, [data?.replay_available, data?.game?.id, clipsRetry]);

  const replayLength = data?.replay_frames?.length || data?.engine_events?.length || data?.events.length || 0;
  useEffect(() => {
    if (!playing || !replayLength) return;
    if (step >= replayLength - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStep((value) => Math.min(replayLength - 1, value + 1)), 1800);
    return () => window.clearTimeout(timer);
  }, [playing, step, replayLength]);

  const chapters = useMemo(() => data ? buildReplayChapters(data) : [], [data]);
  const activeChapter = chapters.filter(chapter => chapter.step <= step).at(-1);
  const visibleEvents = useMemo(() => data?.events.slice(0, step + 1) || [], [data, step]);
  const recordedReplay = Boolean(data?.replay_frames?.length || data?.engine_events?.length);
  const broadcastState = useMemo(() => data?.replay_frames?.length
    ? data.replay_frames[Math.min(step, data.replay_frames.length - 1)].state
    : data?.engine_events?.length && data.players?.length
      ? buildReplayBroadcastState(data.players, data.engine_events, step, data.game?.number || 0)
      : null, [data, step]);
  const current = data?.events[step] || null;
  const orderedClips = useMemo(() => [...clips].sort((left, right) => {
    const leftTime = Date.parse(left.started_at);
    const rightTime = Date.parse(right.started_at);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
    return left.id.localeCompare(right.id);
  }), [clips]);
  const clipsByRound = useMemo(() => {
    const groups = new Map<number, SpeechClip[]>();
    orderedClips.forEach((clip) => {
      const round = Math.max(1, Math.trunc(Number(clip.round_number) || 1));
      const group = groups.get(round) || [];
      group.push(clip);
      groups.set(round, group);
    });
    return Array.from(groups.entries()).sort(([left], [right]) => left - right);
  }, [orderedClips]);
  const roundName = (round: number) => circleTitle(Math.max(0, Math.trunc(Number(round) || 1) - 1), { events: data?.engine_events || [] });
  const goBack = onBack || (() => window.history.back());
  const renderSpeechClip = (clip: SpeechClip) => <div key={clip.id} className="rounded-2xl border border-white/[0.06] bg-black/15 p-3">
    <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-[11px] font-bold">#{clip.seat_number} · {clip.speaker_nickname}</div><div className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-white/25">{roundName(clip.round_number)} · {clip.speech_type} · {durationLabel(clip.duration_seconds)}</div></div></div>
    <audio className="mt-2 h-9 w-full" controls preload="none" src={clip.audio_url}>Браузер не поддерживает воспроизведение аудио.</audio>
  </div>;

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#090a0d] px-5 text-white"><div className="w-full max-w-md"><AsyncState kind="loading" icon="🎬" title="Восстанавливаем партию…" description="Собираем сохранённую хронологию игры." /></div></main>;
  if (error || !data) return <main className="grid min-h-screen place-items-center bg-[#090a0d] px-5 text-white"><div className="w-full max-w-md"><AsyncState kind="error" icon="⚠️" title="Replay недоступен" description={error || 'Не удалось загрузить сохранённую игру.'} actionLabel="Повторить" onAction={() => setRetry(value => value + 1)} /><button type="button" onClick={goBack} className="ds-focus-ring mt-3 min-h-11 w-full rounded-xl border border-white/15 px-3 text-sm font-semibold">Назад к протоколу</button></div></main>;

  if (!data.replay_available) return <main className="grid min-h-screen place-items-center bg-[#090a0d] px-5 text-white"><div className="w-full max-w-md"><AsyncState kind="empty" icon="📼" title="Подробного Replay нет" description={data.analysis.join(' ') || 'Для этой игры нет полной пошаговой хронологии.'} actionLabel="Назад" onAction={goBack} /></div></main>;

  return <main className="min-h-screen bg-[#090a0d] px-3 pb-12 pt-3 text-white">
    <div className="mx-auto w-full max-w-[520px]">
      <div className="flex items-center justify-between gap-3"><button type="button" onClick={goBack} aria-label="Назад к протоколу" className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.045] text-white/55">←</button><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/25">Replay · завершённая игра</div><div className="h-11 w-11" /></div>

      <section className="mt-3 rounded-[26px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.025] p-4 text-center"><div className="text-[11px] uppercase tracking-[0.15em] text-white/25">{data.game?.title}</div><h1 className="mt-1 text-2xl font-black">Игра №{data.game?.number || '—'}</h1><div className={`mt-3 text-lg font-black ${data.game?.winner_team === 'red' ? 'text-rose-300' : 'text-white'}`}>{data.game?.winner_team === 'red' ? '🔴 Победа красных' : data.game?.winner_team === 'black' ? '⚫ Победа чёрных' : 'Игра завершена'}</div></section>

      {data.players?.length ? <details className="mt-3 rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-3"><summary className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/25">Раскрытый состав ▾</summary><div className="mt-2 grid grid-cols-2 gap-1.5">{data.players.map((player) => <div key={`${player.seat_number}:${player.nickname}`} className="flex items-center gap-2 rounded-xl bg-black/15 px-2.5 py-2"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-[11px] font-black">{player.seat_number}</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{player.nickname}</div><div className="flex items-center gap-1 text-[11px] text-white/65"><GameRoleIcon role={player.role} className="h-3.5 w-3.5" /> {roleLabel(player.role)}</div></div></div>)}</div></details> : null}

      {chapters.length > 1 && <label className="mt-3 block text-xs text-white/65">Перейти к моменту<select aria-label="Момент повтора" value={activeChapter?.step ?? 0} onChange={event => { setPlaying(false); setStep(Number(event.target.value)); }} className="mobile-field mt-1 w-full">{chapters.map(chapter => <option key={chapter.step} value={chapter.step}>{chapter.label} · шаг {chapter.step + 1}</option>)}</select></label>}
      {recordedReplay && broadcastState ? (
        <section data-testid="replay-obs-presentation" className="mt-3 overflow-hidden rounded-[20px] border border-white/10">
          <div className="bg-black/40 px-3 py-2 text-[11px] text-white/65">Повтор игры · оригинальная графика OBS. {data.replay_frames?.length ? 'Записанные кадры трансляции.' : 'Восстановление по событиям: таймеры и промежуточные состояния могли не сохраниться.'}</div>
          <div className="max-h-[75vh] overflow-auto"><LiveBroadcastOverlay token="" replayState={broadcastState} /></div>
          <div className="flex items-center justify-between gap-3 bg-[#15151a] p-3">
            <span className="text-xs text-white/70">Событие {step + 1} из {replayLength}</span>
            <button type="button" onClick={() => { if (step >= replayLength - 1) setStep(0); setPlaying(value => !value); }} className="min-h-11 rounded-xl bg-white px-4 text-xs font-semibold text-black">{playing ? 'Пауза' : 'Воспроизвести ▶'}</button>
          </div>
          <input aria-label="Шаг повтора игры" type="range" min={0} max={Math.max(0,replayLength - 1)} value={step} onChange={event => { setPlaying(false); setStep(Number(event.target.value)); }} className="mx-3 mb-3 w-[calc(100%-1.5rem)] accent-white" />
        </section>
      ) : (
        <section className="mt-3 rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-4">
          <div className="mb-2 text-xs text-white/45">В старом протоколе нет событий движка: доступна только сохранённая хронология, без реконструкции действий.</div>
          <div className="text-xs font-semibold text-white/70">Хронология · шаг {Math.min(step + 1,data.events.length)} из {data.events.length}</div>
          {current && <div className="mt-2 rounded-xl bg-black/20 p-3 text-sm"><strong>{current.title}</strong><p className="mt-1 text-white/60">{current.text}</p></div>}
          <input aria-label="Шаг старой хронологии" type="range" min={0} max={Math.max(0,data.events.length - 1)} value={step} onChange={event => setStep(Number(event.target.value))} className="mt-3 w-full" />
          <div className="mt-3 space-y-1">{visibleEvents.map((event,index) => <button type="button" key={event.id} onClick={() => setStep(index)} className="block min-h-10 w-full rounded-lg bg-white/5 px-2 py-2 text-left text-xs">{eventIcon(event.type)} {event.title}</button>)}</div>
        </section>
      )}

      <section className="mt-3 rounded-[24px] border border-violet-200/10 bg-violet-200/[0.035] p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100/45">🎙️ Записи речей</div><div className="mt-1 text-[11px] leading-4 text-white/25">Выбери запись речи или нужный круг.</div></div>{clips.length ? <div className="rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-white/30">{clips.length}</div> : null}</div>
        {clipsLoading ? <div className="mt-3 rounded-xl bg-black/15 px-3 py-3 text-[11px] text-white/30">Загружаем записи…</div> : clipsError ? <div role="alert" className="mt-3 space-y-3 rounded-xl bg-rose-300/[0.06] px-3 py-3 text-xs leading-5 text-rose-100/80"><p>{clipsError}</p><button type="button" onClick={() => setClipsRetry(value => value + 1)} className="ds-focus-ring min-h-11 w-full rounded-xl border border-white/15 bg-white/[.06] px-3 font-semibold">Повторить загрузку речей</button></div> : clips.length ? <>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-black/20 p-1">
            <button type="button" onClick={() => setSpeechView('chronological')} className={`min-h-9 rounded-xl px-2 text-[11px] font-bold transition ${speechView === 'chronological' ? 'bg-white text-black' : 'text-white/35'}`}>По порядку</button>
            <button type="button" onClick={() => setSpeechView('rounds')} className={`min-h-9 rounded-xl px-2 text-[11px] font-bold transition ${speechView === 'rounds' ? 'bg-white text-black' : 'text-white/35'}`}>По кругам</button>
          </div>
          {speechView === 'chronological' ? <div className="mt-3 space-y-2">{orderedClips.map(renderSpeechClip)}</div> : <div className="mt-3 space-y-4">{clipsByRound.map(([round, roundClips]) => <div key={round}><div className="mb-2 flex items-center gap-2"><div className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-100/40">{roundName(round)}</div><div className="h-px flex-1 bg-white/[0.06]" /><div className="text-[11px] text-white/20">{roundClips.length} {roundClips.length === 1 ? 'речь' : roundClips.length < 5 ? 'речи' : 'речей'}</div></div><div className="space-y-2">{roundClips.map(renderSpeechClip)}</div></div>)}</div>}
        </> : <div className="mt-3 rounded-xl bg-black/15 px-3 py-3 text-[11px] leading-4 text-white/25">Для этой игры сохранённых речей нет.</div>}
      </section>

      <section className="mt-3 rounded-[24px] border border-sky-200/10 bg-sky-200/[0.035] p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100/40">🧠 Авторазбор партии</div><div className="mt-3 space-y-2">{data.analysis.map((item, index) => <div key={index} className="rounded-xl bg-black/15 px-3 py-2 text-[11px] leading-4 text-white/40">{item}</div>)}</div><p className="mt-3 text-[11px] leading-3 text-white/18">Разбор показывает только то, что записано в протоколе, без догадок о мотивах.</p></section>

      <p className="mt-4 text-center text-[11px] leading-3 text-white/15">{data.meta?.source}</p>
    </div>
  </main>;
}
