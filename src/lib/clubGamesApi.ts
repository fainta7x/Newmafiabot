import type { PlayerResultData, TournamentGameProtocolData } from './api';
import { applyStoredDeathProtocolsToResults, clearStoredDeathProtocols } from './liveDeathProtocol';

export interface ClubGameProtocolEnvelope {
  version: 1;
  kind: 'club_evening_protocol';
  protocol: TournamentGameProtocolData;
  player_results: PlayerResultData[];
}

export interface ClubGameRecord {
  id: number;
  evening_id: string;
  evening_table_id?: string | null;
  table_name?: string | null;
  global_game_number: number;
  game_date: string;
  winner_team: string;
  winner_label: string;
  judge_name?: string | null;
  judge_player_id?: string | null;
  slots: any[];
  status: 'draft' | 'completed';
  club_protocol: ClubGameProtocolEnvelope | null;
  created_at: string;
  archived_at?: string | null;
}

export type ProtocolSavePayload = {
  protocol: TournamentGameProtocolData;
  player_results: PlayerResultData[];
};

type PendingProtocolSave = {
  version: 1;
  game_id: number;
  saved_at: string;
  payload: ProtocolSavePayload;
};

const FINAL_SAVE_KEY_PREFIX = 'mafia_club_final_save_v1:';
const FINAL_SAVE_RETRY_DELAYS_MS = [0, 250, 750];

export const clubGamePendingProtocolKey = (gameId: number | string) => `${FINAL_SAVE_KEY_PREFIX}${String(gameId)}`;

const organizerHeaders = () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

class ClubGameRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ClubGameRequestError';
    this.status = status;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { ...organizerHeaders(), ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ClubGameRequestError(body.error || body.message || 'Ошибка запроса', response.status);
  return body as T;
}

const persistPendingProtocolSave = (gameId: number, payload: ProtocolSavePayload) => {
  if (typeof window === 'undefined') return;
  const pending: PendingProtocolSave = {
    version: 1,
    game_id: gameId,
    saved_at: new Date().toISOString(),
    payload,
  };
  try { localStorage.setItem(clubGamePendingProtocolKey(gameId), JSON.stringify(pending)); } catch {}
};

export const getPendingClubGameProtocolSave = (gameId: number): PendingProtocolSave | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(clubGamePendingProtocolKey(gameId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingProtocolSave;
    if (parsed?.version !== 1 || Number(parsed?.game_id) !== Number(gameId) || !parsed?.payload) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearPendingClubGameProtocolSave = (gameId: number) => {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(clubGamePendingProtocolKey(gameId)); } catch {}
};

const replaceExactStringsDeep = (value: any, replacements: Map<string, string>): any => {
  if (typeof value === 'string') return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceExactStringsDeep(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceExactStringsDeep(item, replacements)]));
  }
  return value;
};

/**
 * Rebase a recoverable browser outbox payload onto the server's current immutable
 * seat identities. This is needed when a canonical data repair changes a
 * participant/player identity after the browser already stored the finished game.
 * Gameplay data follows seats; identity fields always stay server-owned.
 */
export const rebasePendingClubGameProtocol = (
  game: ClubGameRecord,
  payload: ProtocolSavePayload,
): ProtocolSavePayload => {
  const canonicalResults = game.club_protocol?.player_results;
  const pendingResults = payload?.player_results;
  if (!Array.isArray(canonicalResults) || canonicalResults.length !== 10) {
    throw new Error('Серверный состав игры повреждён: ожидается 10 игроков');
  }
  if (!Array.isArray(pendingResults) || pendingResults.length !== 10) {
    throw new Error('Локальная копия игры повреждена: ожидается 10 игроков');
  }

  const canonicalBySeat = new Map(canonicalResults.map((result) => [Number(result.seat_number), result]));
  const pendingBySeat = new Map(pendingResults.map((result) => [Number(result.seat_number), result]));
  const expectedSeats = Array.from({ length: 10 }, (_, index) => index + 1);
  if (canonicalBySeat.size !== 10 || pendingBySeat.size !== 10 || expectedSeats.some((seat) => !canonicalBySeat.has(seat) || !pendingBySeat.has(seat))) {
    throw new Error('Нельзя восстановить игру: места 1–10 в локальной и серверной копии не совпадают');
  }

  const participantReplacements = new Map<string, string>();
  for (const seat of expectedSeats) {
    const canonical = canonicalBySeat.get(seat)!;
    const pending = pendingBySeat.get(seat)!;
    const oldParticipantId = String(pending.participant_id || '').trim();
    const currentParticipantId = String(canonical.participant_id || '').trim();
    if (!oldParticipantId || !currentParticipantId) {
      throw new Error(`Нельзя восстановить игру: у места #${seat} отсутствует участник`);
    }
    if (oldParticipantId !== currentParticipantId) participantReplacements.set(oldParticipantId, currentParticipantId);
  }

  const protocol = replaceExactStringsDeep(payload.protocol, participantReplacements) as TournamentGameProtocolData;
  protocol.game_id = String(game.id);

  const playerResults = expectedSeats.map((seat) => {
    const canonical = canonicalBySeat.get(seat)!;
    const pending = pendingBySeat.get(seat)!;
    return {
      ...canonical,
      ...pending,
      participant_id: canonical.participant_id,
      player_id: canonical.player_id,
      seat_number: canonical.seat_number,
      display_name: canonical.display_name,
    } as PlayerResultData;
  });

  return { protocol, player_results: playerResults };
};

export const getRecoverablePendingClubGame = (game: ClubGameRecord): ClubGameRecord => {
  const pending = getPendingClubGameProtocolSave(game.id);
  if (!pending) return game;
  const payload = rebasePendingClubGameProtocol(game, pending.payload);
  const editableProtocol = {
    ...payload.protocol,
    status: 'draft' as const,
    completed_at: null,
  };
  return {
    ...game,
    status: 'draft',
    club_protocol: {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: editableProtocol,
      player_results: payload.player_results,
    },
  };
};

const shouldRetryFinalSave = (error: unknown) => {
  if (error instanceof ClubGameRequestError) {
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  }
  return !(error instanceof DOMException && error.name === 'AbortError');
};

const isRosterIdentityConflict = (error: unknown) => error instanceof ClubGameRequestError
  && error.status === 400
  && /состав|замен/i.test(error.message);

const wait = (milliseconds: number) => milliseconds > 0
  ? new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    })
  : Promise.resolve();

const saveProtocolWithRetry = async (gameId: number, payload: ProtocolSavePayload) => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < FINAL_SAVE_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await wait(FINAL_SAVE_RETRY_DELAYS_MS[attempt]);
    try {
      return await request<ClubGameRecord>(`/api/games/${gameId}/evening-protocol`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      lastError = error;
      if (!shouldRetryFinalSave(error) || attempt === FINAL_SAVE_RETRY_DELAYS_MS.length - 1) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Не удалось сохранить результат проведённой игры');
};

const loadCurrentGameForRecovery = async (gameId: number): Promise<ClubGameRecord> => {
  const games = await request<ClubGameRecord[]>('/api/games');
  if (!Array.isArray(games)) throw new Error('Сервер вернул некорректный список игр для восстановления');
  const game = games.find((candidate) => Number(candidate.id) === Number(gameId));
  if (!game) throw new Error('Игра для восстановления не найдена на сервере');
  if (!game.club_protocol) throw new Error('У игры отсутствует серверный клубный протокол');
  return game;
};

export const clubGamesApi = {
  list: (eveningId: string) => request<ClubGameRecord[]>(`/api/games?evening_id=${encodeURIComponent(eveningId)}`),
  listArchived: (eveningId: string) => request<ClubGameRecord[]>(`/api/games?evening_id=${encodeURIComponent(eveningId)}&archived=1`),
  create: (eveningId: string, data: {
    evening_table_id?: string | null;
    judge_name?: string | null;
    judge_player_id?: string | null;
    seats: Array<{ participant_id: string; seat_number: number; role?: string | null }>;
  }) => request<ClubGameRecord>(`/api/games/evening/${encodeURIComponent(eveningId)}`, { method: 'POST', body: JSON.stringify(data) }),
  saveProtocol: async (gameId: number, data: ProtocolSavePayload) => {
    // The final protocol is a recoverable client-side outbox item until the
    // server confirms the PUT. This protects a completed game from a dropped
    // connection, a 5xx response, or a WebView/process restart during save.
    const payload = { ...data, player_results: applyStoredDeathProtocolsToResults(data.player_results) };
    persistPendingProtocolSave(gameId, payload);
    const result = await saveProtocolWithRetry(gameId, payload);
    clearPendingClubGameProtocolSave(gameId);
    clearStoredDeathProtocols();
    return result;
  },
  retryPendingProtocolSave: async (gameId: number) => {
    const pending = getPendingClubGameProtocolSave(gameId);
    if (!pending) return null;

    let result: ClubGameRecord;
    try {
      // Preserve the established fast path: most failed final saves only need
      // the exact same PUT resent after connectivity recovers.
      result = await saveProtocolWithRetry(gameId, pending.payload);
    } catch (error) {
      if (!isRosterIdentityConflict(error)) throw error;

      // A canonical identity repair can make a previously valid browser outbox
      // stale. Only for that specific immutable-roster conflict, reload the
      // current server game and move gameplay data onto its identities by seat.
      const currentGame = await loadCurrentGameForRecovery(gameId);
      const rebasedPayload = rebasePendingClubGameProtocol(currentGame, pending.payload);
      // Persist before the second write so another interruption cannot leave
      // the browser holding obsolete participant identities again.
      persistPendingProtocolSave(gameId, rebasedPayload);
      result = await saveProtocolWithRetry(gameId, rebasedPayload);
    }

    clearPendingClubGameProtocolSave(gameId);
    clearStoredDeathProtocols();
    return result;
  },
  archive: (gameId: number) => request<ClubGameRecord>(`/api/games/${gameId}/archive`, { method: 'POST' }),
  restoreArchived: (gameId: number) => request<ClubGameRecord>(`/api/games/${gameId}/archive/restore`, { method: 'POST' }),
  deleteArchived: (gameId: number) => request<{ success: boolean }>(`/api/games/${gameId}/archive`, { method: 'DELETE' }),
  deleteDraft: (gameId: number) => request<{ success: boolean }>(`/api/games/${gameId}/evening-draft`, { method: 'DELETE' }),
};