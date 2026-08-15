import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import LiveGameEngine from '../LiveGameEngine';
import { PlayerAvatar } from '../ui/PlayerAvatar';
import type { GameSlot, Player as LegacyPlayer } from '../../types';
import type { PlayerResultData, TournamentGameProtocolData } from '../../lib/api';
import { clubGamesApi, getPendingClubGameProtocolSave, type ClubGameRecord } from '../../lib/clubGamesApi';
import { applyStoredDeathProtocolsToResults, clearStoredDeathProtocols } from '../../lib/liveDeathProtocol';
import { ClubLiveSessionRecorder } from '../../lib/liveClubSession';

interface EveningLiveGameModalProps {
  game: ClubGameRecord;
  onClose: () => void;
  onUpdated: (game: ClubGameRecord) => void;
}

type LiveVisualDiscipline = {
  fouls: number;
  minorTech: number;
  majorTech: number;
};

const roleToProtocol = (role: string | null | undefined): string | null => {
  if (role === 'Мирный' || role === 'citizen') return 'citizen';
  if (role === 'Шериф' || role === 'sheriff') return 'sheriff';
  if (role === 'Мафия' || role === 'mafia') return 'mafia';
  if (role === 'Дон' || role === 'don') return 'don';
  return null;
};

/**
 * LiveGameEngine still declares its legacy identity as a number, but the club
 * branch only compares/serializes that value. Keep the unsafe cast at this
 * single compatibility boundary so the runtime identity is the real CRM UUID.
 */
const asLegacyIdentity = (value: string): number => value as unknown as number;

const getClubJudgeIdentity = (game: ClubGameRecord): number =>
  asLegacyIdentity(game.judge_player_id || `legacy-judge:${game.id}`);

const buildLegacyPlayers = (game: ClubGameRecord): LegacyPlayer[] => {
  const results = (game.club_protocol?.player_results || []).slice().sort((a, b) => a.seat_number - b.seat_number);
  const seated: LegacyPlayer[] = results.map((player) => {
    const identity = player.player_id || `legacy-participant:${player.participant_id}`;
    return {
      id: asLegacyIdentity(identity),
      user_id: asLegacyIdentity(identity),
      nickname: player.display_name,
      full_name: player.display_name,
      username: '',
      games_played: 0,
      games_won: 0,
      elo: 0,
      debt: 0,
      total_paid: 0,
      tokens: 0,
      achievements: [],
      last_visit: null,
    };
  });

  const judgeIdentity = getClubJudgeIdentity(game);
  seated.push({
    id: judgeIdentity,
    user_id: judgeIdentity,
    nickname: game.judge_name || 'Ведущий',
    full_name: game.judge_name || 'Ведущий',
    username: '',
    games_played: 0,
    games_won: 0,
    elo: 0,
    debt: 0,
    total_paid: 0,
    tokens: 0,
    achievements: [],
    last_visit: null,
    notes: '__club_evening_engine_judge__',
  });

  return seated;
};

export const mapEngineResultToProtocol = (
  game: ClubGameRecord,
  gameData: any,
): { protocol: TournamentGameProtocolData; player_results: PlayerResultData[] } => {
  if (!game.club_protocol) throw new Error('У игры отсутствует клубный протокол');

  const previousProtocol = game.club_protocol.protocol;
  const previousResults = game.club_protocol.player_results;
  const bySeat = new Map(previousResults.map((player) => [player.seat_number, player]));
  const slots: GameSlot[] = Array.isArray(gameData.slots) ? gameData.slots : [];
  const markers = gameData.protocol_markers || {};

  const firstKilled = markers.firstKilledSlot ? bySeat.get(Number(markers.firstKilledSlot)) : null;
  const zeroRoundVoted = markers.zeroRoundVotedSlot ? bySeat.get(Number(markers.zeroRoundVotedSlot)) : null;
  const ppkSlot = Number((slots as any[]).find((slot) => Boolean(slot?.ppk))?.slot_num || 0);
  const ppkPlayer = ppkSlot ? bySeat.get(ppkSlot) : null;

  const bestMoves: NonNullable<TournamentGameProtocolData['best_moves']> = [];
  const confirmedSource = markers.bestMoveSource as 'first_killed' | 'zero_round_voted' | null | undefined;
  const confirmedSourceSlot = Number(markers.bestMoveSourceSlot || 0);
  const confirmedSeats = Array.isArray(markers.bestMoveSeats) ? markers.bestMoveSeats.slice(0, 3) : [];
  const confirmedPlayer = confirmedSourceSlot ? bySeat.get(confirmedSourceSlot) : null;
  if (confirmedSource && confirmedPlayer && confirmedSeats.length > 0) {
    bestMoves.push({
      participant_id: confirmedPlayer.participant_id,
      source: confirmedSource,
      seat_numbers: confirmedSeats,
    });
  }

  const playerResults = applyStoredDeathProtocolsToResults(previousResults.map((previous) => {
    const slot = (
      slots.find((candidate) => String((candidate as any).user_id || '') === previous.player_id)
      || slots.find((candidate) => candidate.slot_num === previous.seat_number)
    ) as any;
    if (!slot) return previous;
    const minorTechnical = Number(slot.minor_tech_fouls || 0);
    const majorTechnical = Number(slot.major_tech_fouls || 0);
    return {
      ...previous,
      role: roleToProtocol(slot.role),
      exit_type: slot.exit_reason || (slot.alive ? 'alive' : previous.exit_type),
      regular_fouls: Number(slot.fouls || 0),
      minor_technical_fouls: minorTechnical,
      major_technical_fouls: majorTechnical,
      technical_fouls: minorTechnical + majorTechnical,
      removal_reason: slot.removal_reason || (slot.kick && Number(slot.fouls || 0) >= 4 ? '4th_foul' : previous.removal_reason),
      ppk: Boolean(slot.ppk),
      notes: slot.status_reason && !slot.alive ? slot.status_reason : previous.notes,
    } as PlayerResultData;
  }));

  const winnerTeam = gameData.winning_team === 'Красные' ? 'red' : 'black';
  const protocol: TournamentGameProtocolData = {
    ...previousProtocol,
    status: 'completed',
    winner_team: winnerTeam,
    end_reason: (gameData.end_reason || 'normal') as any,
    ppk_culprit_participant_id: ppkPlayer?.participant_id || previousProtocol.ppk_culprit_participant_id || null,
    first_killed_participant_id: firstKilled?.participant_id || null,
    zero_round_voted_participant_id: zeroRoundVoted?.participant_id || null,
    best_moves: bestMoves.length ? bestMoves : (previousProtocol.best_moves || []),
    best_move_participant_id: bestMoves[0]?.participant_id || previousProtocol.best_move_participant_id || null,
    best_move_source: bestMoves[0]?.source || previousProtocol.best_move_source || null,
    best_move_seats: bestMoves[0]?.seat_numbers || previousProtocol.best_move_seats || [],
    votes: Array.isArray(gameData.votes) ? gameData.votes : (previousProtocol.votes || []),
    shots: Array.isArray(gameData.shots) ? gameData.shots : (previousProtocol.shots || []),
    judge_notes: [previousProtocol.judge_notes, gameData.protocol_text].filter(Boolean).join('\n') || null,
  };

  return { protocol, player_results: playerResults };
};

const seatPlacement: Record<number, React.CSSProperties> = {
  9: { gridColumn: 1, gridRow: 1 },
  10: { gridColumn: 2, gridRow: 1 },
  1: { gridColumn: 3, gridRow: 1 },
  2: { gridColumn: 4, gridRow: 1 },
  8: { gridColumn: 1, gridRow: 2 },
  3: { gridColumn: 4, gridRow: 2 },
  7: { gridColumn: 1, gridRow: 3 },
  6: { gridColumn: 2, gridRow: 3 },
  5: { gridColumn: 3, gridRow: 3 },
  4: { gridColumn: 4, gridRow: 3 },
};

const MobileLiveGameStyles = () => (
  <style>{`
    @media (max-width: 767px) {
      .evening-live-engine-shell {
        position: relative;
        height: calc(100dvh - 34px);
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

      .evening-live-engine-shell > div {
        max-width: none !important;
        padding: 2px !important;
        padding-bottom: 16px !important;
      }

      .evening-live-engine-shell > div > div.space-y-4,
      .evening-live-engine-shell > div > div.space-y-6 {
        gap: 3px !important;
      }

      .evening-live-engine-shell > div > div.space-y-4 > div:first-child {
        display: none !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] {
        display: grid !important;
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        grid-template-rows: repeat(3, minmax(0, 1fr)) !important;
        height: clamp(500px, calc(100dvh - 44px), 610px) !important;
        min-height: 500px !important;
        max-height: 610px !important;
        gap: 4px !important;
        padding: 0 !important;
        align-items: stretch !important;
        width: 100% !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(9)  { grid-column: 1; grid-row: 1; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(10) { grid-column: 2; grid-row: 1; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(1)  { grid-column: 3; grid-row: 1; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(2)  { grid-column: 4; grid-row: 1; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(8)  { grid-column: 1; grid-row: 2; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) { grid-column: 2 / span 2; grid-row: 2; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(3)  { grid-column: 4; grid-row: 2; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(7)  { grid-column: 1; grid-row: 3; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(6)  { grid-column: 2; grid-row: 3; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(5)  { grid-column: 3; grid-row: 3; }
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(4)  { grid-column: 4; grid-row: 3; }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) {
        width: 100% !important;
        min-width: 0 !important;
        height: 100% !important;
        min-height: 0 !important;
        max-height: none !important;
        padding: 4px 2px 0 !important;
        border-radius: 11px !important;
        transform: none !important;
        overflow: hidden !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) > div[class*="top-1.5"][class*="inset-x-1.5"],
      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) > div.flex-1 {
        display: none !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) div[class*="min-h-[36px]"] {
        min-height: 42px !important;
        height: 42px !important;
        padding: 4px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) div[class*="min-h-[36px]"] > div:first-child > div[class*="flex-col"] {
        display: none !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(-n+10) button[title*="заметку"] {
        display: none !important;
      }
      .evening-live-roles-hidden .evening-live-engine-shell [title="Красный"],
      .evening-live-roles-hidden .evening-live-engine-shell [title="Дон"],
      .evening-live-roles-hidden .evening-live-engine-shell [title="Мафия"],
      .evening-live-roles-hidden .evening-live-engine-shell [title="Шериф"] {
        opacity: 0 !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) {
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        max-height: none !important;
        position: relative !important;
        top: auto !important;
        z-index: 20 !important;
        padding: 4px !important;
        border-radius: 11px !important;
        overflow: hidden !important;
        display: grid !important;
        grid-template-rows: 20px minmax(0, 1fr) 42px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div:first-child {
        min-height: 0 !important;
        height: 20px !important;
        padding: 0 2px 1px !important;
        overflow: hidden !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) button:has(svg[class*="lucide-log-out"]) {
        display: none !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div.flex-1 {
        min-height: 0 !important;
        height: 100% !important;
        padding: 0 !important;
        overflow: hidden !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div.flex-1 > div {
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 2px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div.flex-1 > div:has(span[class*="tracking-widest"]) {
        height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        justify-content: center !important;
        gap: 2px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div.flex-1 > div:has(span[class*="tracking-widest"]) > * {
        margin: 0 !important;
        flex-shrink: 0 !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) span[class*="tracking-widest"] {
        font-size: 8px !important;
        line-height: 9px !important;
        min-height: 9px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) div[class*="text-xs"][class*="font-black"] {
        font-size: 9px !important;
        line-height: 10px !important;
        min-height: 10px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) div[class*="font-mono"][class*="font-black"] {
        font-size: 23px !important;
        line-height: 26px !important;
        height: 28px !important;
        min-height: 28px !important;
        padding: 0 !important;
        border-radius: 8px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) div[class*="h-1.5"] {
        height: 2px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) div[class*="flex"][class*="gap-1.5"]:has(button[class*="h-9"]) {
        display: grid !important;
        grid-template-columns: 38px minmax(54px, 1fr) 38px 38px !important;
        gap: 4px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) button[class*="h-9"] {
        width: auto !important;
        height: 34px !important;
        min-height: 34px !important;
        border-radius: 9px !important;
        padding: 0 !important;
        font-size: 0 !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) button[class*="h-9"]:first-child {
        font-size: 11px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) button[class*="h-9"] svg {
        width: 17px !important;
        height: 17px !important;
        margin: 0 !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div.flex-1 button:not([class*="h-9"]) {
        min-height: 28px !important;
        padding-top: 3px !important;
        padding-bottom: 3px !important;
        line-height: 11px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div:last-child {
        min-height: 0 !important;
        height: 42px !important;
        padding-top: 3px !important;
        overflow: hidden !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div:last-child > div[class*="grid-cols-12"] {
        min-height: 36px !important;
        height: 36px !important;
        gap: 4px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) > div:last-child button {
        min-height: 36px !important;
        height: 36px !important;
        padding: 2px 5px !important;
        font-size: 9px !important;
        line-height: 11px !important;
      }

      .evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"] > :nth-child(11) * {
        scrollbar-width: none !important;
      }

      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        gap: 8px !important;
      }

      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button {
        min-height: 58px !important;
        height: 58px !important;
        padding: 0 !important;
        border-radius: 14px !important;
        font-size: 0 !important;
        line-height: 1 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        position: relative !important;
        user-select: none !important;
        touch-action: manipulation !important;
      }

      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button::before {
        font-size: 27px !important;
        line-height: 1 !important;
        font-weight: 900 !important;
      }

      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(5) { order: 1; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(1) { order: 2; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(2) { order: 3; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(3) { order: 4; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(4) { order: 5; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(6) { order: 6; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(7) { order: 7; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(8) { order: 8; }

      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(5)::before { content: "👍"; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(1)::before { content: "✓+"; color: rgb(251, 191, 36); }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(2)::before { content: "✓−"; color: rgb(203, 213, 225); }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(3)::before { content: "!"; color: rgb(250, 204, 21); font-size: 34px !important; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(4)::before { content: "!"; color: rgb(248, 113, 113); font-size: 34px !important; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(6)::before { content: "🚪"; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(7)::before { content: "🏳️"; }
      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] > div > div[class*="grid-cols-2"] > button:nth-child(8)::before { content: "🗒️"; }

      .evening-live-engine-shell div[class*="fixed"][class*="z-[112]"] div[class*="text-[10px]"][class*="text-slate-400"][class*="mt-0.5"] {
        display: inline-flex !important;
        margin-top: 5px !important;
        padding: 4px 7px !important;
        border-radius: 8px !important;
        border: 1px solid rgb(51 65 85) !important;
        background: rgb(2 6 23 / 0.75) !important;
        color: rgb(226 232 240) !important;
        font-size: 11px !important;
        line-height: 13px !important;
        font-weight: 800 !important;
      }

      .evening-live-identity-layer {
        position: absolute;
        z-index: 16;
        top: 2px;
        left: 2px;
        right: 2px;
        height: clamp(500px, calc(100dvh - 44px), 610px);
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        grid-template-rows: repeat(3, minmax(0, 1fr));
        gap: 4px;
        pointer-events: none;
      }

      .evening-live-identity {
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 18px 4px 43px;
        overflow: hidden;
      }

      .evening-live-player-avatar {
        width: clamp(42px, 12vw, 56px) !important;
        height: clamp(42px, 12vw, 56px) !important;
        border-width: 2px !important;
        border-color: rgba(100, 116, 139, 0.75) !important;
        background: rgba(15, 23, 42, 0.96) !important;
        color: rgb(226, 232, 240) !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3) !important;
      }

      .evening-live-identity-name {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        border-radius: 6px;
        background: rgba(2, 6, 23, 0.82);
        border: 1px solid rgba(51, 65, 85, 0.7);
        padding: 2px 5px;
        color: rgb(241, 245, 249);
        font-size: 9px;
        line-height: 11px;
        font-weight: 900;
        text-align: center;
      }

      .evening-live-discipline {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
        max-width: 100%;
      }

      .evening-live-discipline > span {
        min-width: 22px;
        height: 17px;
        padding: 0 3px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(2, 6, 23, 0.9);
        border: 1px solid rgba(71, 85, 105, 0.9);
        font-size: 8px;
        line-height: 1;
        font-weight: 900;
      }

      .evening-live-discipline-foul { color: rgb(251, 191, 36); }
      .evening-live-discipline-minor { color: rgb(250, 204, 21); }
      .evening-live-discipline-major { color: rgb(248, 113, 113); }

      .evening-live-engine-shell > div > div.space-y-4 > :last-child {
        margin-top: 8px !important;
      }

      .evening-live-mobile-title-secondary { display: none !important; }
    }

    @media (min-width: 768px) {
      .evening-live-identity-layer { display: none !important; }
    }
  `}</style>
);

export const EveningLiveGameModal: React.FC<EveningLiveGameModalProps> = ({ game, onClose, onUpdated }) => {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(() =>
    getPendingClubGameProtocolSave(game.id)
      ? 'Предыдущая попытка сохранить завершённую игру не дошла до сервера.'
      : null,
  );
  const [livePhase, setLivePhase] = useState('setup');
  const [rolesHidden, setRolesHidden] = useState(false);
  const [liveDiscipline, setLiveDiscipline] = useState<Record<number, LiveVisualDiscipline>>({});
  const legacyPlayers = useMemo(() => buildLegacyPlayers(game), [game]);
  const livePlayers = useMemo(
    () => (game.club_protocol?.player_results || []).slice().sort((a, b) => a.seat_number - b.seat_number),
    [game],
  );
  const liveRecorder = useMemo(() => new ClubLiveSessionRecorder(game.id), [game.id]);

  useLayoutEffect(() => {
    liveRecorder.mount();
    return () => liveRecorder.unmount();
  }, [liveRecorder]);

  useEffect(() => {
    const originalConfirm = window.confirm;
    window.confirm = (message?: string) => {
      const text = String(message || '');
      const isDisciplineAction =
        text.includes('Удалить игрока') ||
        text.includes('ППК') ||
        text.includes('4-й фол') ||
        text.includes('второй технический фол');
      if (isDisciplineAction) return true;
      return originalConfirm.call(window, text);
    };

    return () => {
      window.confirm = originalConfirm;
    };
  }, []);

  useEffect(() => {
    if (livePhase === 'setup') {
      setLiveDiscipline({});
      return;
    }

    let lastSignature = '';
    const syncFromLiveSession = () => {
      try {
        liveRecorder.sync();
        const raw = localStorage.getItem('mafia_live_session');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const activePlayers = Array.isArray(parsed?.activePlayers) ? parsed.activePlayers : [];
        const next: Record<number, LiveVisualDiscipline> = {};
        for (const player of activePlayers) {
          const slot = Number(player?.slot_num);
          if (!Number.isInteger(slot) || slot < 1 || slot > 10) continue;
          next[slot] = {
            fouls: Number(player?.fouls || 0),
            minorTech: Number(player?.minor_tech_fouls || 0),
            majorTech: Number(player?.major_tech_fouls || 0),
          };
        }
        const signature = JSON.stringify(next);
        if (signature !== lastSignature) {
          lastSignature = signature;
          setLiveDiscipline(next);
        }
      } catch {}
    };

    syncFromLiveSession();
    const intervalId = window.setInterval(syncFromLiveSession, 300);
    return () => window.clearInterval(intervalId);
  }, [livePhase, liveRecorder]);

  const finishConfirmedSave = (updated: ClubGameRecord) => {
    liveRecorder.finish();
    clearStoredDeathProtocols();
    setSaveError(null);
    onUpdated(updated);
    onClose();
  };

  const retryFinalSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await clubGamesApi.retryPendingProtocolSave(game.id);
      if (!updated) throw new Error('Локальная копия завершённого протокола не найдена');
      finishConfirmedSave(updated);
    } catch (err: any) {
      setSaveError(err?.message || 'Не удалось повторно сохранить результат. Локальная копия сохранена на устройстве.');
    } finally {
      setSaving(false);
    }
  };

  if (!game.club_protocol) return null;

  return (
    <div className={`fixed inset-0 z-[95] bg-slate-950 overflow-hidden ${rolesHidden ? 'evening-live-roles-hidden' : ''}`}>
      <MobileLiveGameStyles />

      <div className="h-[34px] md:h-12 sticky top-0 z-[110] bg-slate-950/95 backdrop-blur border-b border-slate-800 px-2 md:px-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <div className="text-[11px] md:text-xs font-black text-white truncate">Игра #{game.global_game_number}</div>
          <div className="evening-live-mobile-title-secondary text-[10px] text-slate-500 truncate">
            {game.table_name || 'Стол'}{game.judge_name ? ` • ${game.judge_name}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRolesHidden((value) => !value)}
            className={`w-7 h-7 md:w-9 md:h-9 rounded-lg md:rounded-xl border flex items-center justify-center shrink-0 ${rolesHidden ? 'bg-amber-950/70 border-amber-700 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
            title={rolesHidden ? 'Показать роли' : 'Скрыть роли'}
          >
            {rolesHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center shrink-0"
            title="Закрыть движок"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {saving && (
        <div className="fixed inset-0 z-[130] bg-slate-950/90 flex items-center justify-center text-sm font-black text-white">
          Сохраняем результат игры…
        </div>
      )}

      {!saving && saveError && (
        <div className="fixed inset-0 z-[130] bg-slate-950/95 px-5 flex items-center justify-center">
          <div className="w-full max-w-sm rounded-2xl border border-rose-900/80 bg-slate-900 p-5 shadow-2xl">
            <div className="text-base font-black text-white">Результат ещё не подтверждён сервером</div>
            <div className="mt-2 text-sm leading-5 text-slate-300">{saveError}</div>
            <div className="mt-2 text-xs leading-4 text-slate-500">
              Финальный протокол сохранён локально. Повтор отправляет ту же самую завершённую игру — проводить её заново не нужно.
            </div>
            <button
              type="button"
              onClick={retryFinalSave}
              className="mt-4 w-full min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black"
            >
              Повторить сохранение
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full min-h-10 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-sm font-bold"
            >
              Закрыть — локальная копия останется
            </button>
          </div>
        </div>
      )}

      <div className="evening-live-engine-shell py-0.5 md:py-3">
        <LiveGameEngine
          players={legacyPlayers}
          initialJudgeId={getClubJudgeIdentity(game)}
          onCancel={onClose}
          onPhaseChange={setLivePhase}
          onGameFinished={async (gameData) => {
            setSaving(true);
            setSaveError(null);
            try {
              const evidence = liveRecorder.getEvidence();
              const next = mapEngineResultToProtocol(game, { ...gameData, votes: evidence.votes, shots: evidence.shots });
              const updated = await clubGamesApi.saveProtocol(game.id, next);
              finishConfirmedSave(updated);
            } catch (err: any) {
              setSaveError(err?.message || 'Не удалось сохранить результат проведённой игры. Локальная копия сохранена на устройстве.');
            } finally {
              setSaving(false);
            }
          }}
        />

        {livePhase !== 'setup' && (
          <div className="evening-live-identity-layer" aria-hidden="true">
            {livePlayers.map((player) => {
              const current = liveDiscipline[player.seat_number];
              const fouls = current?.fouls ?? Number((player as any).regular_fouls || 0);
              const minorTech = current?.minorTech ?? Number((player as any).minor_technical_fouls || 0);
              const majorTech = current?.majorTech ?? Number((player as any).major_technical_fouls || 0);
              return (
                <div key={player.seat_number} className="evening-live-identity" style={seatPlacement[player.seat_number]}>
                  <PlayerAvatar
                    playerId={player.player_id}
                    nickname={player.display_name}
                    size="xl"
                    forceStoredLookup
                    className="evening-live-player-avatar"
                  />
                  <span className="evening-live-identity-name">{player.display_name}</span>
                  <div className="evening-live-discipline" aria-label={`Фолы ${fouls}, малые техфолы ${minorTech}, большие техфолы ${majorTech}`}>
                    <span className="evening-live-discipline-foul">✓{fouls}</span>
                    <span className="evening-live-discipline-minor">!{minorTech}</span>
                    <span className="evening-live-discipline-major">!{majorTech}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};