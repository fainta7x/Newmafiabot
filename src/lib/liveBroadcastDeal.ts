import { LIVE_BROADCAST_VERSION, type LiveBroadcastDeal, type LiveBroadcastState } from './liveBroadcast';

/**
 * The role deal on the stream (owner, 2026-11-03: «вынести процесс раздачи карт в оверлей… подсвечивать выбор и переворот
 * карты с ролью»; the viewers see the role; the choosing player's nickname and seat are lit). The deal writes its state on
 * the device; the game window (club or tournament) publishes it through its usual broadcast route.
 */
const KEY = 'mafia_live_deal';

export const writeDealBroadcast = (deal: LiveBroadcastDeal | null) => {
  try {
    if (deal) localStorage.setItem(KEY, JSON.stringify(deal));
    else localStorage.removeItem(KEY);
  } catch { /* the stream is a convenience: the deal never depends on it */ }
};

export const readDealBroadcast = (): LiveBroadcastDeal | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    return parsed && typeof parsed === 'object' && Number(parsed.seat) > 0 && Array.isArray(parsed.cards) ? parsed as LiveBroadcastDeal : null;
  } catch { return null; }
};

export type DealBroadcastMetadata = {
  gameId: number;
  globalGameNumber: number;
  eveningGameNumber?: number | null;
  tableName: string | null;
  players: Array<{ seat: number; playerId: string | null; nickname: string }>;
};

/** A broadcast state of the deal: the table's players (no roles yet), the deal itself. */
export const buildDealBroadcastState = (metadata: DealBroadcastMetadata, deal: LiveBroadcastDeal): LiveBroadcastState => ({
  version: LIVE_BROADCAST_VERSION,
  gameId: metadata.gameId,
  globalGameNumber: metadata.globalGameNumber,
  eveningGameNumber: metadata.eveningGameNumber ?? null,
  tableName: metadata.tableName,
  phaseKey: 'deal',
  phaseTitle: 'Раздача ролей',
  phaseDetail: '',
  roundNumber: 0,
  currentSpeakerSeat: null,
  timerSeconds: null,
  timerMaxSeconds: null,
  timerRunning: false,
  timerLabel: null,
  players: metadata.players.slice().sort((a, b) => a.seat - b.seat).map((player) => ({
    seat: player.seat, playerId: player.playerId, nickname: player.nickname, role: '—', team: '—', alive: true,
    status: 'В игре', statusKind: 'alive', fouls: 0, minorTech: 0, majorTech: 0, ppk: false,
  })),
  nominations: [],
  vote: null,
  deal,
  updatedAt: new Date().toISOString(),
});
