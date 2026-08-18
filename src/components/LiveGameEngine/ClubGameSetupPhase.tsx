import React from 'react';
import type { Player } from '../../types.js';
import { loadJudgeMusicPlaylist, type JudgeMusicTrack } from '../../hooks/useJudgeGameMusic.ts';
import {
  readJudgeGameMusicSelection,
  writeJudgeGameMusicSelection,
  type JudgeGameMusicSelection,
} from '../../lib/judgeGameMusicSelection.ts';
import PhysicalRoleDeal from '../game/PhysicalRoleDeal.tsx';
import { physicalRoleToLive, roleSetupIsValid, type LiveRole } from './setupRoles.js';
import type { ActivePlayerState } from './types.js';

type Props = {
  players: Player[];
  activePlayers: ActivePlayerState[];
  handleAutoFillSetupPlayers: () => void;
  handleSelectSetupRole: (slotNum: number, role: LiveRole) => void;
  onCancel: () => void;
  validateSetupAndStart: () => void;
  onRoleDealActiveChange?: (active: boolean) => void;
};

const defaultSelection = (tracks: JudgeMusicTrack[], previous: JudgeGameMusicSelection | null): JudgeGameMusicSelection => {
  const ids = new Set(tracks.map((track) => track.id));
  const previousDeal = previous?.dealTrackId && ids.has(previous.dealTrackId) ? previous.dealTrackId : null;
  const previousNight = previous?.nightTrackId && ids.has(previous.nightTrackId) ? previous.nightTrackId : null;
  const dealTrackId = previousDeal || tracks[0]?.id || null;
  const nightTrackId = previousNight || tracks[1]?.id || tracks[0]?.id || null;
  return { configured: true, dealTrackId, nightTrackId };
};

export default function ClubGameSetupPhase({
  players,
  activePlayers,
  handleAutoFillSetupPlayers,
  handleSelectSetupRole,
  onCancel,
  validateSetupAndStart,
  onRoleDealActiveChange,
}: Props) {
  const [tracks, setTracks] = React.useState<JudgeMusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = React.useState(true);
  const [selection, setSelection] = React.useState<JudgeGameMusicSelection>(() =>
    readJudgeGameMusicSelection() || { configured: true, dealTrackId: null, nightTrackId: null },
  );
  const [showPhysicalDeal, setShowPhysicalDeal] = React.useState(false);
  const [awaitingStart, setAwaitingStart] = React.useState(false);
  const prefillDone = React.useRef(false);

  React.useEffect(() => {
    if (prefillDone.current) return;
    prefillDone.current = true;
    if (activePlayers.every((player) => !player.user_id)) handleAutoFillSetupPlayers();
  }, [activePlayers, handleAutoFillSetupPlayers]);

  React.useEffect(() => {
    let cancelled = false;
    void loadJudgeMusicPlaylist()
      .then((payload) => {
        if (cancelled) return;
        const nextTracks = payload?.tracks || [];
        setTracks(nextTracks);
        const nextSelection = defaultSelection(nextTracks, readJudgeGameMusicSelection());
        setSelection(nextSelection);
        writeJudgeGameMusicSelection(nextSelection);
      })
      .catch(() => {
        if (cancelled) return;
        const nextSelection: JudgeGameMusicSelection = { configured: true, dealTrackId: null, nightTrackId: null };
        setTracks([]);
        setSelection(nextSelection);
        writeJudgeGameMusicSelection(nextSelection);
      })
      .finally(() => { if (!cancelled) setMusicLoading(false); });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => () => onRoleDealActiveChange?.(false), [onRoleDealActiveChange]);

  React.useEffect(() => {
    if (!awaitingStart || !roleSetupIsValid(activePlayers)) return;
    setAwaitingStart(false);
    validateSetupAndStart();
  }, [activePlayers, awaitingStart, validateSetupAndStart]);

  const updateSelection = (patch: Partial<Pick<JudgeGameMusicSelection, 'dealTrackId' | 'nightTrackId'>>) => {
    const next: JudgeGameMusicSelection = { ...selection, ...patch, configured: true };
    setSelection(next);
    writeJudgeGameMusicSelection(next);
  };

  const openRoleDeal = () => {
    onRoleDealActiveChange?.(true);
    setShowPhysicalDeal(true);
  };

  const closeRoleDeal = () => {
    setShowPhysicalDeal(false);
    onRoleDealActiveChange?.(false);
  };

  const dealSeats = activePlayers.map((player, index) => ({
    seat_number: player.slot_num,
    nickname: player.nickname || players[index]?.nickname || `Игрок ${player.slot_num}`,
  }));
  const selectedDealTrack = tracks.find((track) => track.id === selection.dealTrackId) || null;
  const selectedNightTrack = tracks.find((track) => track.id === selection.nightTrackId) || null;

  return (
    <div className="space-y-3">
      <section className="rounded-3xl border border-violet-300/15 bg-gradient-to-b from-violet-300/[0.07] to-slate-900/55 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200/55">Фаза 1 · старт игры</div>
            <h2 className="mt-2 text-xl font-black text-white">Раздача ролей</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">Состав и ведущий уже взяты из игры. Выберите музыку, раздайте 10 физических карт и отметьте фактические роли — после десятой карты движок сразу перейдёт к договорке.</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-300/[0.08] text-xl">🃏</div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/65 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-white">♫ Музыка этой игры</div>
            <div className="mt-1 text-[10px] leading-4 text-slate-500">Два фиксированных трека вместо случайного выбора из плейлиста.</div>
          </div>
          {musicLoading && <span className="text-[10px] text-slate-500">Загрузка…</span>}
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">1 · Раздача ролей</span>
            <select
              value={selection.dealTrackId || ''}
              disabled={musicLoading}
              onChange={(event) => updateSelection({ dealTrackId: event.target.value || null })}
              className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm text-white disabled:opacity-50"
            >
              <option value="">Без музыки</option>
              {tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
            </select>
            <span className="mt-1.5 block text-[10px] leading-4 text-slate-500">Включается по кнопке начала раздачи, плавно нарастает и гаснет после фиксации ролей.</span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">2 · Договорка и все ночи</span>
            <select
              value={selection.nightTrackId || ''}
              disabled={musicLoading}
              onChange={(event) => updateSelection({ nightTrackId: event.target.value || null })}
              className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm text-white disabled:opacity-50"
            >
              <option value="">Без музыки</option>
              {tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
            </select>
            <span className="mt-1.5 block text-[10px] leading-4 text-slate-500">Нулевая ночь: с договорки через вызов Шерифа и свободную посадку до пробуждения города. Обычные ночи: от начала ночи до завершения проверки Шерифа.</span>
          </label>
        </div>

        {!musicLoading && tracks.length === 0 && (
          <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/15 px-3 py-3 text-xs leading-5 text-slate-500">В личном плейлисте нет доступных треков. Игру можно запустить без музыки.</div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-white">Стол готов</div>
            <div className="mt-1 text-[10px] text-slate-500">10 мест · физические карты 6 / 1 / 2 / 1</div>
          </div>
          <div className="rounded-2xl bg-black/25 px-3 py-2 text-center"><div className="text-lg font-black text-white">10</div><div className="text-[9px] text-slate-500">мест</div></div>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {dealSeats.map((seat) => <div key={seat.seat_number} className="min-w-0 rounded-xl border border-white/[0.07] bg-black/20 px-1.5 py-2 text-center"><div className="text-[10px] font-black text-white">{seat.seat_number}</div><div className="mt-1 truncate text-[8px] text-slate-500">{seat.nickname}</div></div>)}
        </div>
      </section>

      {awaitingStart ? (
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-4 text-center text-sm font-bold text-emerald-100">Роли зафиксированы · переходим к договорке…</div>
      ) : (
        <div className="grid grid-cols-[0.7fr_1.3fr] gap-2">
          <button type="button" onClick={onCancel} className="min-h-13 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-slate-400">Назад</button>
          <button type="button" onClick={openRoleDeal} className="min-h-13 rounded-2xl bg-white px-4 text-sm font-black text-black">Начать раздачу ролей →</button>
        </div>
      )}

      {showPhysicalDeal && (
        <PhysicalRoleDeal
          seats={dealSeats}
          musicTrackId={selection.dealTrackId}
          musicTrackTitle={selectedDealTrack?.title || null}
          onCancel={closeRoleDeal}
          onComplete={(assignments) => {
            Object.entries(assignments).forEach(([seatNumber, role]) => handleSelectSetupRole(Number(seatNumber), physicalRoleToLive(role)));
            closeRoleDeal();
            setAwaitingStart(true);
          }}
        />
      )}

      {selectedNightTrack && <div className="sr-only">Ночной трек: {selectedNightTrack.title}</div>}
    </div>
  );
}
