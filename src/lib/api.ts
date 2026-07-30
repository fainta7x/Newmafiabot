export interface Player {
  id: string;
  telegram_user_id?: string | null;
  nickname: string;
  full_name?: string | null;
  telegram_username?: string | null;
  phone?: string | null;
  contact_status: 'normal' | 'paused' | 'blocked';
  engagement_stage: 'lead' | 'newcomer' | 'returning' | 'regular' | 'inactive';
  lifecycle_status?: string;
  calculated_stage?: string;
  preferred_format?: string | null;
  referred_by?: string | null;
  do_not_invite_until?: string | null;
  pause_reason?: string | null;
  source?: string | null;
  notes?: string | null;
  elo: number;
  tokens: number;
  created_at: string;
  updated_at: string;
  attendance_count?: number;
  no_show_count?: number;
  first_visit?: string | null;
  last_visit?: string | null;
  days_since_last_visit?: number | null;
  open_tasks_count?: number;
  outstanding_debt?: number;
}

export interface EveningTable {
  id: string;
  evening_id: string;
  name: string;
  format: string;
  capacity: number;
  host_name?: string | null;
  starts_at?: string | null;
  default_price?: number | null;
  notes?: string | null;
  sort_order?: number;
  participant_count?: number;
  occupied?: number;
  free_spots?: number;
  invited_count?: number;
  waitlist_count?: number;
}

export interface PlayerActivity {
  id: string;
  player_id: string;
  evening_id?: string | null;
  task_id?: string | null;
  type: string;
  outcome?: string | null;
  description?: string | null;
  occurred_at: string;
  created_at: string;
}

export interface CrmOverview {
  nextEvening: (GameEvening & {
    tables: EveningTable[];
    invitedCount: number;
    registeredCount: number;
    confirmedCount: number;
    waitlistCount: number;
    newcomersCount: number;
    expectedToPayAmount?: number;
    expectedToPayCount?: number;
  }) | null;
  actionLists: {
    unansweredInvites: any[];
    unconfirmedRegistered: any[];
    waitlistParticipants: any[];
    newcomersAfterFirst: any[];
    lapsedPlayers: any[];
    overdueTasks: OrganizerTask[];
    todayTasks: OrganizerTask[];
    noDeadlineTasks: OrganizerTask[];
    unpaidParticipants: any[];
  };
  summary: {
    overdueTasksCount: number;
    todayTasksCount: number;
    noDeadlineTasksCount: number;
    newcomersWithoutFollowupCount: number;
    lapsedPlayersCount: number;
    unpaidParticipantsCount: number;
    totalUnpaidAmount: number;
  };
}

export interface GameEvening {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  timezone: string;
  venue?: string | null;
  format: 'NOVICE' | 'STANDARD' | 'TOURNAMENT';
  status: 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  capacity: number;
  default_price: number;
  notes?: string | null;
  settled_at?: string | null;
  created_at: string;
  updated_at: string;
  registered_count?: number;
  confirmed_count?: number;
  attended_count?: number;
  no_show_count?: number;
  total_revenue?: number;
  available_spots?: number;
}

export interface EveningParticipant {
  id: string;
  evening_id: string;
  player_id: string;
  table_id?: string | null;
  nickname: string;
  phone?: string | null;
  telegram_username?: string | null;
  lifecycle_status: string;
  elo: number;
  registration_status: 'invited' | 'registered' | 'confirmed' | 'waitlist' | 'cancelled';
  attendance_status: 'pending' | 'attended' | 'no_show';
  arrival_status: 'unknown' | 'on_time' | 'late';
  payment_status: 'unpaid' | 'partial' | 'paid' | 'waived';
  amount_due: number;
  amount_paid: number;
  notes?: string | null;
  registered_at?: string | null;
  confirmed_at?: string | null;
  checked_in_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizerTask {
  id: string;
  title: string;
  description?: string | null;
  type: 'call' | 'invite' | 'reminder' | 'feedback' | 'preparation' | 'payment' | 'other';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  due_at?: string | null;
  completed_at?: string | null;
  player_id?: string | null;
  evening_id?: string | null;
  player_nickname?: string | null;
  evening_title?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsData {
  period: string;
  totalPlayers: number;
  inactive30: number;
  inactive60: number;
  inactive90: number;
  cohortFirstVisits: number;
  cohortReturnedIn30Days: number;
  cohortRetention30dRate: number;
  completedEvenings: number;
  totalRegistrations: number;
  totalAttended: number;
  totalCancelled: number;
  totalNoShow: number;
  cancellationRate: number;
  noShowRate: number;
  avgAttendance: string | number;
  financials: {
    accrued: number;
    incomePaid: number;
    outstandingDebt: number;
    refunds: number;
    expenses: number;
    avgRevenuePerEvening: number;
  };
  sourceBreakdown: Record<string, number>;
}

export interface TournamentParticipant {
  id: string;
  tournament_id: string;
  player_id: string;
  display_name: string;
  participant_number: number;
  player_nickname?: string;
  telegram_username?: string;
  phone?: string;
}

export interface TournamentGameSeat {
  id: string;
  game_id: string;
  participant_id: string;
  seat_number: number;
  role: string | null;
  display_name?: string;
  player_id?: string;
}

export interface TournamentGame {
  id: string;
  tournament_id: string;
  game_number: number;
  judge_name: string | null;
  status: 'planned' | 'active' | 'completed';
  winner_team: string | null;
  started_at: string | null;
  completed_at: string | null;
  draft_protocol_json?: string | null;
  protocol_import_id?: string | null;
  seats?: TournamentGameSeat[];
}

export interface ProtocolImportRecord {
  id: string;
  tournament_id: string;
  uploaded_by: string;
  original_filename: string;
  mime_type: string;
  storage_path: string;
  status: 'uploaded' | 'processing' | 'review' | 'applied' | 'failed';
  recognition_json?: any;
  error_message?: string;
  image_url: string;
  created_at: string;
  updated_at: string;
}

export interface ColorProtocolMark {
  seat_numbers: number[];
  mark: 'red' | 'black' | 'sheriff';
}

export interface PlayerResultInput {
  participant_id: string;
  exit_type: 'alive' | 'killed' | 'voted_zero_round' | 'voted_day' | 'removed';
  exit_order?: number | null;
  regular_fouls: number;
  technical_fouls: number;
  judge_bonus: number;
  protocol_bonus: number;
  penalty_points: number;
  ci_points?: number;
  color_protocol: ColorProtocolMark[];
  notes?: string | null;
}

export interface PlayerResultData extends PlayerResultInput {
  id?: string;
  game_id?: string;
  seat_number: number;
  display_name: string;
  player_id: string;
  role: string | null;
}

export interface VotingRound {
  round_number: number;
  is_revote?: boolean;
  nominated_seats: number[];
  vote_counts: Record<number, number>;
}

export interface ShotEntry {
  night_number: number;
  target_seat: number;
  result: 'killed' | 'miss' | 'agreement_failed';
}

export interface ReplacementData {
  replaced_seat: number;
  replaced_participant_id?: string | null;
  new_participant_id?: string | null;
  replacement_name_or_comment?: string | null;
  replacement_time?: string | null;
  notes?: string | null;
  reason?: string | null;
}

export interface TournamentGameProtocolData {
  id?: string;
  game_id: string;
  status: 'draft' | 'completed';
  winner_team: 'red' | 'black' | null;
  first_killed_participant_id: string | null;
  zero_round_voted_participant_id: string | null;
  best_move_participant_id: string | null;
  best_move_source: 'first_killed' | 'zero_round_voted' | null;
  best_move_seats: number[];
  votes: VotingRound[];
  shots: ShotEntry[];
  replacement: ReplacementData | null;
  judge_notes: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  best_move_score?: number;
}

export interface FullGameProtocolResponse {
  protocol: TournamentGameProtocolData;
  player_results: PlayerResultData[];
  game: TournamentGame;
}

export interface TournamentStandingGame {
  game_number: number;
  seat_number: number;
  role: string | null;
  winner_team: 'red' | 'black' | null;
  win_point: number;
  positive_points: number;
  best_move_points: number;
  penalty_points: number;
  ci_points: number;
  game_total: number;
}

export interface TournamentStandingItem {
  place: number;
  participant_id: string;
  participant_number: number;
  display_name: string;
  total_points: number;
  additional_total: number;
  positive_points: number;
  penalty_points: number;
  best_move_points: number;
  ci_points: number;
  wins: number;
  don_wins: number;
  sheriff_wins: number;
  first_killed_count: number;
  games_played: number;
  games: TournamentStandingGame[];
}

export interface TournamentStandingsResponse {
  tournament_id: string;
  standings: TournamentStandingItem[];
}

export interface TournamentStartReadiness {
  ready: boolean;
  participants_count: number;
  games_count: number;
  seats_count: number;
  errors: string[];
}

export interface Tournament {
  id: string;
  title: string;
  date: string;
  venue?: string | null;
  stage?: string | null;
  status: 'draft' | 'active' | 'completed';
  chief_judge_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  participants_count?: number;
  total_games_count?: number;
  completed_games_count?: number;
  start_readiness?: TournamentStartReadiness;
  participants?: TournamentParticipant[];
  games?: TournamentGame[];
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (typeof window !== 'undefined') {
    const storedToken = localStorage.getItem('organizer_token');
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Automatically send HttpOnly cookies
  });

  if (!res.ok) {
    let errorMsg = 'Ошибка запроса';
    let details = null;
    try {
      const json = await res.json();
      errorMsg = json.error || json.message || errorMsg;
      details = json.details || json.pendingParticipants || null;
    } catch (e) {}
    const err = new Error(errorMsg) as any;
    err.details = details;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  // Auth
  login: async (password: string) => {
    const res = await request<{ success: boolean; role: string; token?: string; message: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (res.token && typeof window !== 'undefined') {
      localStorage.setItem('organizer_token', res.token);
    }
    return res;
  },
  getMe: () => request<{ role: string; isOrganizer: boolean }>('/api/auth/me'),
  logout: async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('organizer_token');
    }
    return request<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  // CRM & Overview
  getCrmOverview: () => request<CrmOverview>('/api/crm/overview'),

  // Evenings
  getEvenings: () => request<GameEvening[]>('/api/evenings'),
  getEvening: (id: string) =>
    request<GameEvening & { tables: EveningTable[]; participants: EveningParticipant[]; games?: any[] }>(`/api/evenings/${id}`),
  createEvening: (data: Partial<GameEvening>) =>
    request<GameEvening>('/api/evenings', { method: 'POST', body: JSON.stringify(data) }),
  createNextFriday: () =>
    request<GameEvening & { tables: EveningTable[] }>('/api/evenings/create-next-friday', { method: 'POST' }),
  duplicateLastEvening: () =>
    request<GameEvening & { tables: EveningTable[] }>('/api/evenings/duplicate-last', { method: 'POST' }),
  updateEvening: (id: string, data: Partial<GameEvening>) =>
    request<GameEvening>(`/api/evenings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEvening: (id: string) => request<{ success: boolean }>(`/api/evenings/${id}`, { method: 'DELETE' }),
  settleEvening: (id: string) =>
    request<{ success: boolean; alreadySettled: boolean; evening: GameEvening; message?: string }>(
      `/api/evenings/${id}/settle`,
      { method: 'POST' }
    ),

  // Evening Tables
  getEveningTables: (eveningId: string) => request<EveningTable[]>(`/api/evenings/${eveningId}/tables`),
  createEveningTable: (eveningId: string, data: Partial<EveningTable>) =>
    request<EveningTable>(`/api/evenings/${eveningId}/tables`, { method: 'POST', body: JSON.stringify(data) }),
  updateEveningTable: (tableId: string, data: Partial<EveningTable>) =>
    request<EveningTable>(`/api/evenings/tables/${tableId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEveningTable: (tableId: string) =>
    request<{ success: boolean }>(`/api/evenings/tables/${tableId}`, { method: 'DELETE' }),
  moveParticipantTable: (participantId: string, tableId: string | null) =>
    request<EveningParticipant>(`/api/evenings/participants/${participantId}/move-table`, {
      method: 'PATCH',
      body: JSON.stringify({ table_id: tableId }),
    }),

  // Participants
  bulkAddParticipants: (eveningId: string, playerIds: string[], tableId?: string | null, registrationStatus: string = 'registered', amountDue?: number) =>
    request<{ success: boolean; addedCount: number; waitlistCount: number; skippedCount: number; participants: EveningParticipant[] }>(
      `/api/evenings/${eveningId}/participants/bulk`,
      { method: 'POST', body: JSON.stringify({ player_ids: playerIds, table_id: tableId, registration_status: registrationStatus, amount_due: amountDue }) }
    ),
  bulkUpdateParticipants: (eveningId: string, updates: Partial<EveningParticipant>[]) =>
    request<{ success: boolean; participants: EveningParticipant[] }>(
      `/api/evenings/${eveningId}/participants/bulk`,
      { method: 'PATCH', body: JSON.stringify({ updates }) }
    ),
  addParticipant: (
    eveningId: string,
    data: { player_id?: string; nickname?: string; phone?: string; table_id?: string | null; registration_status?: 'invited' | 'registered' | 'confirmed' | 'waitlist' | 'cancelled'; amount_due?: number; amount_paid?: number; force_over_capacity?: boolean }
  ) =>
    request<EveningParticipant>(`/api/evenings/${eveningId}/participants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getParticipants: (eveningId: string) => request<EveningParticipant[]>(`/api/evenings/${eveningId}/participants`),
  updateParticipant: (participantId: string, data: Partial<EveningParticipant>) =>
    request<EveningParticipant>(`/api/evening-participants/${participantId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteParticipant: (participantId: string) =>
    request<{ success: boolean }>(`/api/evening-participants/${participantId}`, { method: 'DELETE' }),

  // Players
  getPlayers: (params: Record<string, string | number | boolean> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    return request<Player[]>(`/api/players?${query.toString()}`);
  },
  getPlayer: (id: string) =>
    request<
      Player & {
        stats: any;
        futureBookings: EveningParticipant[];
        attendedEvenings: EveningParticipant[];
        cancelledEvenings: EveningParticipant[];
        noShowEvenings: EveningParticipant[];
        eveningHistory: EveningParticipant[];
        tasks: OrganizerTask[];
        nextTask: OrganizerTask | null;
        transactions: any[];
      }
    >(`/api/players/${id}`),
  createPlayer: (data: Partial<Player>) => request<Player>('/api/players', { method: 'POST', body: JSON.stringify(data) }),
  updatePlayer: (id: string, data: Partial<Player>) => request<Player>(`/api/players/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePlayer: (id: string) => request<{ success: boolean }>(`/api/players/${id}`, { method: 'DELETE' }),
  invitePlayer: (playerId: string, eveningId: string, tableId?: string | null, createFollowupTask: boolean = true) =>
    request<{
      success: boolean;
      alreadyParticipant?: boolean;
      participant: EveningParticipant;
      registration_status?: string;
      task?: OrganizerTask;
      telegramLink?: string;
      message?: string;
    }>(
      `/api/players/${playerId}/invite`,
      { method: 'POST', body: JSON.stringify({ evening_id: eveningId, table_id: tableId, create_followup_task: createFollowupTask }) }
    ),
  getPlayerActivities: (playerId: string) => request<PlayerActivity[]>(`/api/players/${playerId}/activities`),
  addPlayerActivity: (playerId: string, data: Partial<PlayerActivity>) =>
    request<PlayerActivity>(`/api/players/${playerId}/activities`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  recordCommunicationOutcome: (
    playerId: string,
    data: {
      channel: 'telegram' | 'phone' | 'in_person' | 'other';
      outcome: 'answered' | 'no_answer' | 'interested' | 'declined' | 'call_later';
      comment?: string;
      create_next_task?: boolean;
      task_due_at?: string | null;
      task_title?: string;
    }
  ) =>
    request<{ success: boolean; activity: PlayerActivity; task?: OrganizerTask }>(
      `/api/players/${playerId}/communication-log`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  // Public Join
  getPublicEvening: (eveningId: string) =>
    request<{
      id: string;
      title: string;
      starts_at: string;
      ends_at?: string;
      venue?: string;
      format: string;
      status: string;
      capacity: number;
      default_price: number;
      notes?: string;
      tables: EveningTable[];
    }>(`/api/public/evenings/${eveningId}`),
  joinPublicEvening: (
    eveningId: string,
    data: { nickname: string; telegram_username?: string; phone?: string; table_id?: string; source?: string }
  ) =>
    request<{ success: boolean; registration_status: string; tableName: string; message: string; alreadyRegistered?: boolean }>(
      `/api/public/evenings/${eveningId}/join`,
      { method: 'POST', body: JSON.stringify(data) }
    ),

  // Tasks
  getTasks: (params: Record<string, string | boolean> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    return request<OrganizerTask[]>(`/api/tasks?${query.toString()}`);
  },
  createTask: (data: Partial<OrganizerTask>) => request<OrganizerTask>('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  completeTask: (id: string) => request<OrganizerTask>(`/api/tasks/${id}/complete`, { method: 'POST' }),
  updateTask: (id: string, data: Partial<OrganizerTask>) => request<OrganizerTask>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id: string) => request<{ success: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),

  // Games
  getGames: (eveningId?: string) =>
    request<any[]>(`/api/games${eveningId ? `?evening_id=${eveningId}` : ''}`),
  saveClubGameProtocol: (data: any) =>
    request<any>('/api/games', { method: 'POST', body: JSON.stringify(data) }),

  // Analytics
  getAnalytics: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return request<AnalyticsData>(`/api/analytics${query ? `?${query}` : ''}`);
  },

  // Tournaments
  getTournaments: () => request<Tournament[]>('/api/tournaments'),
  getTournament: (id: string) => request<Tournament>(`/api/tournaments/${id}`),
  createTournament: (data: {
    title: string;
    date: string;
    venue?: string;
    stage?: string;
    chief_judge_name?: string;
    notes?: string;
    participants: Array<{ player_id: string; display_name?: string }>;
  }) => request<Tournament>('/api/tournaments', { method: 'POST', body: JSON.stringify(data) }),
  updateTournament: (id: string, data: Partial<Tournament>) =>
    request<Tournament>(`/api/tournaments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateTournamentParticipants: (
    id: string,
    participants: Array<{ player_id: string; display_name?: string }>
  ) =>
    request<{ success: boolean; participants: TournamentParticipant[] }>(`/api/tournaments/${id}/participants`, {
      method: 'PUT',
      body: JSON.stringify({ participants }),
    }),
  generateTournamentSeating: (id: string) =>
    request<{ success: boolean; games: TournamentGame[] }>(`/api/tournaments/${id}/generate-seating`, { method: 'POST' }),
  swapTournamentSeats: (tournamentId: string, gameId: string, seat1: number, seat2: number) =>
    request<{ success: boolean; game_id: string; seats: TournamentGameSeat[] }>(
      `/api/tournaments/${tournamentId}/games/${gameId}/swap-seats`,
      { method: 'POST', body: JSON.stringify({ seat_number_1: seat1, seat_number_2: seat2 }) }
    ),
  updateGameRoles: (
    tournamentId: string,
    gameId: string,
    roles: Array<{ seat_number: number; role: string | null }>
  ) =>
    request<{ success: boolean; game_id: string; seats: TournamentGameSeat[] }>(
      `/api/tournaments/${tournamentId}/games/${gameId}/roles`,
      { method: 'PATCH', body: JSON.stringify({ roles }) }
    ),
  updateGameJudge: (tournamentId: string, gameId: string, judge_name: string | null) =>
    request<TournamentGame>(`/api/tournaments/${tournamentId}/games/${gameId}/judge`, {
      method: 'PATCH',
      body: JSON.stringify({ judge_name }),
    }),
  startTournament: (id: string) =>
    request<{ success: boolean; tournament: Tournament }>(`/api/tournaments/${id}/start`, { method: 'POST' }),
  startTournamentGame: (tournamentId: string, gameId: string) =>
    request<{ success: boolean; game: TournamentGame }>(`/api/tournaments/${tournamentId}/games/${gameId}/start`, {
      method: 'POST',
    }),

  // Protocol Blank Imports
  uploadProtocolBlank: async (tournamentId: string, file: File): Promise<{
    success?: boolean;
    import_id: string;
    status: string;
    recognition_json?: any;
    detected_games?: any[];
    image_url: string;
  }> => {
    const formData = new FormData();
    formData.append('image', file);

    const headers: Record<string, string> = {};
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('organizer_token');
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
    }

    const res = await fetch(`/api/tournaments/${tournamentId}/protocol-imports`, {
      method: 'POST',
      body: formData,
      headers,
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) {
      const err = new Error(json.error || json.message || 'Ошибка загрузки бланка') as any;
      err.import_id = json.import_id;
      err.status = res.status;
      throw err;
    }
    return json;
  },

  getProtocolImports: (tournamentId: string) =>
    request<ProtocolImportRecord[]>(`/api/tournaments/${tournamentId}/protocol-imports`),

  getProtocolImport: (tournamentId: string, importId: string) =>
    request<ProtocolImportRecord>(`/api/tournaments/${tournamentId}/protocol-imports/${importId}`),

  applyProtocolImport: (tournamentId: string, importId: string, gameMappings: any[]) =>
    request<{ success: boolean; applied_count: number; updated_games: TournamentGame[]; errors?: string[] }>(
      `/api/tournaments/${tournamentId}/protocol-imports/${importId}/apply`,
      {
        method: 'POST',
        body: JSON.stringify({ game_mappings: gameMappings }),
      }
    ),

  getGameProtocolDraft: (tournamentId: string, gameId: string) =>
    request<{ game: TournamentGame; draft_protocol: any }>(`/api/tournaments/${tournamentId}/games/${gameId}/protocol-draft`),

  getGameProtocol: (tournamentId: string, gameId: string) =>
    request<FullGameProtocolResponse>(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`),

  saveGameProtocol: (
    tournamentId: string,
    gameId: string,
    payload: {
      protocol: Partial<TournamentGameProtocolData>;
      player_results: PlayerResultInput[];
    }
  ) =>
    request<FullGameProtocolResponse>(`/api/tournaments/${tournamentId}/games/${gameId}/protocol`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  completeGameProtocol: (
    tournamentId: string,
    gameId: string,
    payload: {
      protocol: Partial<TournamentGameProtocolData>;
      player_results: PlayerResultInput[];
    }
  ) =>
    request<FullGameProtocolResponse>(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  revertGameProtocolToDraft: (tournamentId: string, gameId: string) =>
    request<FullGameProtocolResponse>(`/api/tournaments/${tournamentId}/games/${gameId}/protocol/revert-to-draft`, {
      method: 'POST',
    }),

  getTournamentStandings: (tournamentId: string) =>
    request<TournamentStandingsResponse>(`/api/tournaments/${tournamentId}/standings`),
};
