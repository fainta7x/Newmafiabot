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
  slots: any[];
  status: 'draft' | 'completed';
  club_protocol: ClubGameProtocolEnvelope | null;
  created_at: string;
}

const organizerHeaders = () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...organizerHeaders(),
      ...(options?.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.message || 'Ошибка запроса');
  }
  return body as T;
}

export const clubGamesApi = {
  list: (eveningId: string) =>
    request<ClubGameRecord[]>(`/api/games?evening_id=${encodeURIComponent(eveningId)}`),

  create: (
    eveningId: string,
    data: {
      evening_table_id?: string | null;
      judge_name?: string | null;
      seats: Array<{ participant_id: string; seat_number: number; role?: string | null }>;
    }
  ) =>
    request<ClubGameRecord>(`/api/games/evening/${encodeURIComponent(eveningId)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  saveProtocol: async (
    gameId: number,
    data: { protocol: TournamentGameProtocolData; player_results: PlayerResultData[] }
  ) => {
    const payload = {
      ...data,
      player_results: applyStoredDeathProtocolsToResults(data.player_results),
    };
    const result = await request<ClubGameRecord>(`/api/games/${gameId}/evening-protocol`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    clearStoredDeathProtocols();
    return result;
  },

  deleteDraft: (gameId: number) =>
    request<{ success: boolean }>(`/api/games/${gameId}/evening-draft`, { method: 'DELETE' }),
};
