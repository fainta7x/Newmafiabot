export interface Player {
  id: string;
  telegram_user_id?: string | null;
  nickname: string;
  full_name?: string | null;
  telegram_username?: string | null;
  phone?: string | null;
  lifecycle_status: 'lead' | 'newcomer' | 'returning' | 'regular' | 'inactive' | 'blocked';
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
}

export interface EveningParticipant {
  id: string;
  evening_id: string;
  player_id: string;
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
  totalPlayers: number;
  newPlayersCount: number;
  conversion1to2: number;
  oneVisitPlayers: number;
  multiVisitPlayers: number;
  inactive30: number;
  inactive60: number;
  inactive90: number;
  totalRegistrations: number;
  totalAttended: number;
  totalCancelled: number;
  totalNoShow: number;
  cancellationRate: number;
  noShowRate: number;
  totalEvenings: number;
  avgAttendance: string | number;
  totalRevenue: number;
  avgRevenue: number;
  totalOutstandingDebt: number;
  sourceBreakdown: Record<string, number>;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('organizer_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errorMsg = 'Ошибка запроса';
    try {
      const json = await res.json();
      errorMsg = json.error || json.message || errorMsg;
    } catch (e) {}
    throw new Error(errorMsg);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (password: string) => request<{ success: boolean; token: string; role: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  getMe: () => request<{ role: string; isOrganizer: boolean }>('/api/auth/me'),
  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  // Evenings
  getEvenings: () => request<GameEvening[]>('/api/evenings'),
  getEvening: (id: string) => request<GameEvening & { participants: EveningParticipant[] }>(`/api/evenings/${id}`),
  createEvening: (data: Partial<GameEvening>) => request<GameEvening>('/api/evenings', { method: 'POST', body: JSON.stringify(data) }),
  updateEvening: (id: string, data: Partial<GameEvening>) => request<GameEvening>(`/api/evenings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEvening: (id: string) => request<{ success: boolean }>(`/api/evenings/${id}`, { method: 'DELETE' }),
  settleEvening: (id: string) => request<{ success: boolean; alreadySettled: boolean; evening: GameEvening }>(`/api/evenings/${id}/settle`, { method: 'POST' }),

  // Participants
  bulkAddParticipants: (eveningId: string, playerIds: string[], amountDue?: number) =>
    request<{ success: boolean; addedCount: number; skippedCount: number; participants: EveningParticipant[] }>(
      `/api/evenings/${eveningId}/participants/bulk`,
      { method: 'POST', body: JSON.stringify({ player_ids: playerIds, registration_status: 'registered', amount_due: amountDue }) }
    ),
  addParticipant: (eveningId: string, data: { player_id?: string; nickname?: string; phone?: string; amount_due?: number; amount_paid?: number }) =>
    request<EveningParticipant>(`/api/evenings/${eveningId}/participants`, { method: 'POST', body: JSON.stringify(data) }),
  updateParticipant: (participantId: string, data: Partial<EveningParticipant>) =>
    request<EveningParticipant>(`/api/evening-participants/${participantId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteParticipant: (participantId: string) => request<{ success: boolean }>(`/api/evening-participants/${participantId}`, { method: 'DELETE' }),

  // Players
  getPlayers: (params: Record<string, string | number | boolean> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    return request<Player[]>(`/api/players?${query.toString()}`);
  },
  getPlayer: (id: string) => request<Player & { stats: any; eveningHistory: any[]; tasks: OrganizerTask[]; nextTask: OrganizerTask | null; transactions: any[] }>(`/api/players/${id}`),
  createPlayer: (data: Partial<Player>) => request<Player>('/api/players', { method: 'POST', body: JSON.stringify(data) }),
  updatePlayer: (id: string, data: Partial<Player>) => request<Player>(`/api/players/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePlayer: (id: string) => request<{ success: boolean }>(`/api/players/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: (params: Record<string, string | boolean> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    return request<OrganizerTask[]>(`/api/tasks?${query.toString()}`);
  },
  createTask: (data: Partial<OrganizerTask>) => request<OrganizerTask>('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: Partial<OrganizerTask>) => request<OrganizerTask>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id: string) => request<{ success: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),

  // Analytics
  getAnalytics: () => request<AnalyticsData>('/api/analytics'),
};
