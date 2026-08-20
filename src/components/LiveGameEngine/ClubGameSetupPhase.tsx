import React from 'react';
import { ChevronDown, Layers3, Music2 } from 'lucide-react';
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
  speechRecordingControl?: React.ReactNode;
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
  speechRecordingControl,
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
  const selectedTrackCount = Number(Boolean(selectedDealTrack)) + Number(Boolean(selectedNightTrack));
  const musicSummary = musicLoading
    ? 'Загрузка…'
    : selectedTrackCount === 0
      ? 'Без музыки'
      : selectedTrackCount === 1
        ? '1 трек'
        : '2 трека';

  return (
    <div className="space-y-2.5 pb-2">
      <section data-testid="club-game-setup-hero" className="rounded-[24px] border border-white/[0.09] bg-white/[0.045] p-3.5 shadow-[0_14px_42px_rgba(0,0,0,0.16)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Подготовка игры</div>
            <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-white">Раздача ролей</h2>
            <p className="mt-1 text-[11px] leading-4 text-white/42">Раздайте физические карты и зафиксируйте фактические роли игроков.</p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-white/[0.07] bg-black/20 text-white/45">
            <Layers3 className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[9px] font-semibold text-white/34">
          <span className="rounded-lg bg-black/20 px-2 py-1.5">10 игроков</span>
          <span className="rounded-lg bg-black/20 px-2 py-1.5">6 · 1 · 2 · 1</span>
        </div>
      </section>

      {awaitingStart ? (
        <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-3.5 text-center text-[12px] font-semibold text-emerald-100">Роли зафиксированы · открываю договорку…</div>
      ) : (
        <div data-testid="club-game-setup-primary-actions" className="grid grid-cols-[0.65fr_1.35fr] gap-2">
          <button type="button" onClick={onCancel} className="min-h-[52px] rounded-[16px] border border-white/[0.08] bg-white/[0.035] px-3 text-[11px] font-semibold text-white/42 active:bg-white/[0.06]">Назад</button>
          <button data-testid="club-game-start-role-deal" type="button" onClick={openRoleDeal} className="min-h-[52px] rounded-[16px] bg-white px-4 text-[12px] font-semibold text-[#090a0d] active:bg-white/90">Начать раздачу ролей →</button>
        </div>
      )}

      <section data-testid="club-game-table-preview" className="rounded-[22px] border border-white/[0.07] bg-white/[0.028] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-white/68">Состав стола</div>
            <div className="mt-0.5 text-[9px] text-white/28">Проверьте рассадку перед первой картой</div>
          </div>
          <div className="rounded-xl bg-black/20 px-2.5 py-1.5 text-[10px] font-semibold text-white/42">10/10</div>
        </div>
        <div className="mt-2.5 grid grid-cols-5 gap-1.5">
          {dealSeats.map((seat) => (
            <div key={seat.seat_number} className="min-w-0 rounded-[10px] border border-white/[0.055] bg-black/15 px-1 py-1.5 text-center">
              <div className="text-[10px] font-semibold text-white/78">{seat.seat_number}</div>
              <div className="mt-0.5 truncate text-[7.5px] text-white/28">{seat.nickname}</div>
            </div>
          ))}
        </div>
      </section>

      <details data-testid="club-game-music-settings" className="group overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.025]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-left [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-black/20 text-white/38">
              <Music2 className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-white/68">Музыка игры</div>
              <div className="mt-0.5 text-[9px] leading-4 text-white/28">Раздача и ночной протокол</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 text-[8px] font-semibold text-white/32">{musicSummary}</span>
            <ChevronDown className="h-3.5 w-3.5 text-white/24 transition-transform group-open:rotate-180" aria-hidden="true" />
          </div>
        </summary>

        <div className="space-y-2 border-t border-white/[0.06] p-2.5">
          <label className="block rounded-[14px] bg-black/15 p-2.5">
            <span className="mb-1.5 block text-[9px] font-semibold text-white/36">Раздача ролей</span>
            <select
              value={selection.dealTrackId || ''}
              disabled={musicLoading}
              onChange={(event) => updateSelection({ dealTrackId: event.target.value || null })}
              className="min-h-11 w-full rounded-[12px] border border-white/[0.08] bg-[#090a0d] px-3 text-[12px] text-white/78 outline-none disabled:opacity-50"
            >
              <option value="">Без музыки</option>
              {tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
            </select>
          </label>

          <label className="block rounded-[14px] bg-black/15 p-2.5">
            <span className="mb-1.5 block text-[9px] font-semibold text-white/36">Договорка и ночи</span>
            <select
              value={selection.nightTrackId || ''}
              disabled={musicLoading}
              onChange={(event) => updateSelection({ nightTrackId: event.target.value || null })}
              className="min-h-11 w-full rounded-[12px] border border-white/[0.08] bg-[#090a0d] px-3 text-[12px] text-white/78 outline-none disabled:opacity-50"
            >
              <option value="">Без музыки</option>
              {tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
            </select>
          </label>

          {!musicLoading && tracks.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-white/[0.08] bg-black/15 px-3 py-2.5 text-[10px] leading-4 text-white/30">Доступных треков нет. Игра запустится без музыки.</div>
          )}
        </div>
      </details>

      {speechRecordingControl}

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
