from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1. Standalone historical awards: these do not require a tournament row in the current database.
Path('drizzle/0007_player_historical_awards.sql').write_text('''CREATE TABLE IF NOT EXISTS player_historical_awards (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,
  title TEXT NOT NULL,
  tournament_title TEXT NOT NULL,
  tournament_date TEXT,
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_historical_awards_player
ON player_historical_awards(player_id, tournament_date);
''', encoding='utf-8')

replace_once(
    'src/db/index.ts',
    """  const migration6SqlPath = path.join(process.cwd(), 'drizzle', '0006_tournament_award_overrides.sql');
  if (fs.existsSync(migration6SqlPath)) {
    const migration6Sql = fs.readFileSync(migration6SqlPath, 'utf8');
    dbWrapper.sqlite.exec(migration6Sql);
  }

  addColumnIfNotExists('tournament_games', 'draft_protocol_json', 'TEXT');
""",
    """  const migration6SqlPath = path.join(process.cwd(), 'drizzle', '0006_tournament_award_overrides.sql');
  if (fs.existsSync(migration6SqlPath)) {
    const migration6Sql = fs.readFileSync(migration6SqlPath, 'utf8');
    dbWrapper.sqlite.exec(migration6Sql);
  }

  const migration7SqlPath = path.join(process.cwd(), 'drizzle', '0007_player_historical_awards.sql');
  if (fs.existsSync(migration7SqlPath)) {
    const migration7Sql = fs.readFileSync(migration7SqlPath, 'utf8');
    dbWrapper.sqlite.exec(migration7Sql);
  }

  addColumnIfNotExists('tournament_games', 'draft_protocol_json', 'TEXT');
""",
)

# 2. Merge historical records with automatic/overridden tournament awards in player profiles.
replace_once(
    'src/server/services/tournamentAwardsService.ts',
    "export type TournamentAwardKey = typeof TOURNAMENT_AWARD_DEFINITIONS[number]['key'];\n",
    "export type TournamentAwardKey = typeof TOURNAMENT_AWARD_DEFINITIONS[number]['key'];\nexport type HistoricalAwardKey = TournamentAwardKey | 'nomination_other';\n",
)

replace_once(
    'src/server/services/tournamentAwardsService.ts',
    """export interface PlayerTournamentAward {
  id: string;
  key: TournamentAwardKey;
  kind: TournamentAwardKind;
  title: string;
  place: number | null;
  category: string | null;
  tournament_id: string;
  tournament_title: string;
  tournament_date: string | null;
  source: 'automatic' | 'manual';
  comment: string | null;
}
""",
    """export interface PlayerTournamentAward {
  id: string;
  key: HistoricalAwardKey;
  kind: TournamentAwardKind;
  title: string;
  place: number | null;
  category: string | null;
  tournament_id: string | null;
  tournament_title: string;
  tournament_date: string | null;
  source: 'automatic' | 'manual' | 'historical';
  comment: string | null;
  historical_award_id: string | null;
}
""",
)

replace_once(
    'src/server/services/tournamentAwardsService.ts',
    """export const isTournamentAwardKey = (value: string): value is TournamentAwardKey =>
  TOURNAMENT_AWARD_DEFINITIONS.some((item) => item.key === value);

export const getTournamentAwardDefinition = (key: string) =>
  TOURNAMENT_AWARD_DEFINITIONS.find((item) => item.key === key) || null;
""",
    """export const isTournamentAwardKey = (value: string): value is TournamentAwardKey =>
  TOURNAMENT_AWARD_DEFINITIONS.some((item) => item.key === value);

export const isHistoricalAwardKey = (value: string): value is HistoricalAwardKey =>
  isTournamentAwardKey(value) || value === 'nomination_other';

export const getTournamentAwardDefinition = (key: string) =>
  TOURNAMENT_AWARD_DEFINITIONS.find((item) => item.key === key) || null;

export const getHistoricalAwardDefaultTitle = (key: HistoricalAwardKey) => {
  if (key === 'nomination_other') return 'Номинация';
  return getTournamentAwardDefinition(key)?.title || 'Награда';
};
""",
)

replace_once(
    'src/server/services/tournamentAwardsService.ts',
    """        source: slot.source,
        comment: slot.comment,
      });
    }
  }

  awards.sort((a, b) => {
""",
    """        source: slot.source,
        comment: slot.comment,
        historical_award_id: null,
      });
    }
  }

  const historicalRows = await db.all<any>(`
    SELECT id, award_key, title, tournament_title, tournament_date, comment, created_at
      FROM player_historical_awards
     WHERE player_id = ?
     ORDER BY COALESCE(tournament_date, created_at) DESC, created_at DESC
  `, [playerId]);

  for (const row of historicalRows) {
    const key = String(row.award_key || '');
    if (!isHistoricalAwardKey(key)) continue;
    const definition = getTournamentAwardDefinition(key);
    const place = key === 'place_1' ? 1 : key === 'place_2' ? 2 : key === 'place_3' ? 3 : null;

    awards.push({
      id: `historical:${row.id}`,
      key,
      kind: place ? 'placement' : 'nomination',
      title: row.title || getHistoricalAwardDefaultTitle(key),
      place,
      category: definition?.category || null,
      tournament_id: null,
      tournament_title: row.tournament_title || 'Турнир',
      tournament_date: row.tournament_date || null,
      source: 'historical',
      comment: row.comment || null,
      historical_award_id: String(row.id),
    });
  }

  awards.sort((a, b) => {
""",
)

# 3. CRUD endpoints for independent historical awards on player profiles.
replace_once(
    'src/server/routes/playersRoutes.ts',
    "import { loadPlayerGameProfile } from '../services/playerProfileService.ts';\n",
    """import { loadPlayerGameProfile } from '../services/playerProfileService.ts';
import {
  getHistoricalAwardDefaultTitle,
  isHistoricalAwardKey,
  type HistoricalAwardKey,
} from '../services/tournamentAwardsService.ts';
""",
)

replace_once(
    'src/server/routes/playersRoutes.ts',
    "const router = Router();\n",
    """const router = Router();

type HistoricalAwardPayload = {
  awardKey: HistoricalAwardKey;
  title: string;
  tournamentTitle: string;
  tournamentDate: string | null;
  comment: string | null;
};

const parseHistoricalAwardPayload = (body: any): { value?: HistoricalAwardPayload; error?: string } => {
  const awardKey = String(body?.award_key || '').trim();
  if (!isHistoricalAwardKey(awardKey)) return { error: 'Неизвестный тип награды' };

  const tournamentTitle = typeof body?.tournament_title === 'string' ? body.tournament_title.trim().slice(0, 180) : '';
  if (!tournamentTitle) return { error: 'Укажи название турнира' };

  const rawDate = typeof body?.tournament_date === 'string' ? body.tournament_date.trim() : '';
  if (rawDate && (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(new Date(`${rawDate}T00:00:00Z`).getTime()))) {
    return { error: 'Некорректная дата турнира' };
  }

  const customTitle = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '';
  if (awardKey === 'nomination_other' && !customTitle) return { error: 'Укажи название номинации' };

  const comment = typeof body?.comment === 'string' && body.comment.trim()
    ? body.comment.trim().slice(0, 500)
    : null;

  return {
    value: {
      awardKey,
      title: awardKey === 'nomination_other' ? customTitle : getHistoricalAwardDefaultTitle(awardKey),
      tournamentTitle,
      tournamentDate: rawDate || null,
      comment,
    },
  };
};

const checkpointAfterPlayerMutation = async (db: any) => {
  if (path.basename(db.dbPath) !== 'mafia_crm.runtime.sqlite') return undefined;
  const result = await createPreviewCheckpoint(db);
  return result.success ? undefined : result.message;
};
""",
)

historical_routes = r'''
// POST /api/players/:id/historical-awards - Add an award from a tournament absent from the current DB
router.post('/:id/historical-awards', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const player = await db.get('SELECT id FROM players WHERE id = ?', [req.params.id]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const parsed = parseHistoricalAwardPayload(req.body);
    if (!parsed.value) return res.status(400).json({ error: parsed.error || 'Некорректные данные награды' });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const value = parsed.value;
    await db.run(
      `INSERT INTO player_historical_awards
        (id, player_id, award_key, title, tournament_title, tournament_date, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, value.awardKey, value.title, value.tournamentTitle, value.tournamentDate, value.comment, now, now]
    );

    const award = await db.get('SELECT * FROM player_historical_awards WHERE id = ?', [id]);
    const checkpoint_warning = await checkpointAfterPlayerMutation(db);
    res.status(201).json({ award, checkpoint_warning });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// PATCH /api/players/:id/historical-awards/:awardId - Edit a historical award
router.patch('/:id/historical-awards/:awardId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const existing = await db.get(
      'SELECT id FROM player_historical_awards WHERE id = ? AND player_id = ?',
      [req.params.awardId, req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'Историческая награда не найдена' });

    const parsed = parseHistoricalAwardPayload(req.body);
    if (!parsed.value) return res.status(400).json({ error: parsed.error || 'Некорректные данные награды' });

    const value = parsed.value;
    const now = new Date().toISOString();
    await db.run(
      `UPDATE player_historical_awards
          SET award_key = ?, title = ?, tournament_title = ?, tournament_date = ?, comment = ?, updated_at = ?
        WHERE id = ? AND player_id = ?`,
      [value.awardKey, value.title, value.tournamentTitle, value.tournamentDate, value.comment, now, req.params.awardId, req.params.id]
    );

    const award = await db.get('SELECT * FROM player_historical_awards WHERE id = ?', [req.params.awardId]);
    const checkpoint_warning = await checkpointAfterPlayerMutation(db);
    res.json({ award, checkpoint_warning });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// DELETE /api/players/:id/historical-awards/:awardId - Remove a historical award
router.delete('/:id/historical-awards/:awardId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const result = await db.run(
      'DELETE FROM player_historical_awards WHERE id = ? AND player_id = ?',
      [req.params.awardId, req.params.id]
    );
    if (!result.changes) return res.status(404).json({ error: 'Историческая награда не найдена' });

    const checkpoint_warning = await checkpointAfterPlayerMutation(db);
    res.json({ success: true, checkpoint_warning });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

'''
replace_once(
    'src/server/routes/playersRoutes.ts',
    "// PATCH /api/players/:id - Update player (Auth required)\n",
    historical_routes + "// PATCH /api/players/:id - Update player (Auth required)\n",
)

# 4. Client types and API methods.
replace_once(
    'src/lib/api.ts',
    "  | 'nomination_mvp';\n",
    "  | 'nomination_mvp'\n  | 'nomination_other';\n",
)

replace_once(
    'src/lib/api.ts',
    """export interface PlayerTournamentAward {
  id: string;
  key: PlayerAwardKey;
  kind: 'placement' | 'nomination';
  title: string;
  place: number | null;
  category: string | null;
  tournament_id: string;
  tournament_title: string;
  tournament_date: string | null;
  source: 'automatic' | 'manual';
  comment: string | null;
}
""",
    """export interface PlayerTournamentAward {
  id: string;
  key: PlayerAwardKey;
  kind: 'placement' | 'nomination';
  title: string;
  place: number | null;
  category: string | null;
  tournament_id: string | null;
  tournament_title: string;
  tournament_date: string | null;
  source: 'automatic' | 'manual' | 'historical';
  comment: string | null;
  historical_award_id: string | null;
}

export interface PlayerHistoricalAwardInput {
  award_key: PlayerAwardKey;
  tournament_title: string;
  tournament_date?: string | null;
  title?: string;
  comment?: string;
}

export interface PlayerHistoricalAwardRecord {
  id: string;
  player_id: string;
  award_key: PlayerAwardKey;
  title: string;
  tournament_title: string;
  tournament_date: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}
""",
)

replace_once(
    'src/lib/api.ts',
    """  resetTournamentAwardOverride: (tournamentId: string, awardKey: PlayerAwardKey) =>
    request<TournamentAwardsResponse>(`/api/tournaments/${tournamentId}/awards/${awardKey}`, { method: 'DELETE' }),
  createPlayer: (data: Partial<Player>) => request<Player>('/api/players', { method: 'POST', body: JSON.stringify(data) }),
""",
    """  resetTournamentAwardOverride: (tournamentId: string, awardKey: PlayerAwardKey) =>
    request<TournamentAwardsResponse>(`/api/tournaments/${tournamentId}/awards/${awardKey}`, { method: 'DELETE' }),
  createPlayerHistoricalAward: (playerId: string, data: PlayerHistoricalAwardInput) =>
    request<{ award: PlayerHistoricalAwardRecord; checkpoint_warning?: string }>(`/api/players/${playerId}/historical-awards`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePlayerHistoricalAward: (playerId: string, awardId: string, data: PlayerHistoricalAwardInput) =>
    request<{ award: PlayerHistoricalAwardRecord; checkpoint_warning?: string }>(`/api/players/${playerId}/historical-awards/${awardId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deletePlayerHistoricalAward: (playerId: string, awardId: string) =>
    request<{ success: boolean; checkpoint_warning?: string }>(`/api/players/${playerId}/historical-awards/${awardId}`, { method: 'DELETE' }),
  createPlayer: (data: Partial<Player>) => request<Player>('/api/players', { method: 'POST', body: JSON.stringify(data) }),
""",
)

# 5. Player profile UI: historical entries get their own editor and stay separate from official overrides.
replace_once(
    'src/components/crm/PlayerProfileContent.tsx',
    """const nominationOptions: Array<{ key: PlayerAwardKey; label: string }> = [
  { key: 'nomination_best_citizen', label: 'Лучший мирный' },
  { key: 'nomination_best_mafia', label: 'Лучшая мафия' },
  { key: 'nomination_best_sheriff', label: 'Лучший Шериф' },
  { key: 'nomination_best_don', label: 'Лучший Дон' },
  { key: 'nomination_mvp', label: 'MVP' },
];
""",
    """const nominationOptions: Array<{ key: PlayerAwardKey; label: string }> = [
  { key: 'nomination_best_citizen', label: 'Лучший мирный' },
  { key: 'nomination_best_mafia', label: 'Лучшая мафия' },
  { key: 'nomination_best_sheriff', label: 'Лучший Шериф' },
  { key: 'nomination_best_don', label: 'Лучший Дон' },
  { key: 'nomination_mvp', label: 'MVP' },
];
const historicalNominationOptions: Array<{ key: PlayerAwardKey; label: string }> = [
  ...nominationOptions,
  { key: 'nomination_other', label: 'Другая номинация' },
];
""",
)

replace_once(
    'src/components/crm/PlayerProfileContent.tsx',
    """  const [awardSaving, setAwardSaving] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);

  const stats = player.gameStats;
""",
    """  const [awardSaving, setAwardSaving] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);
  const [showHistoricalEditor, setShowHistoricalEditor] = useState(false);
  const [historicalEditingId, setHistoricalEditingId] = useState<string | null>(null);
  const [historicalTournamentTitle, setHistoricalTournamentTitle] = useState('');
  const [historicalTournamentDate, setHistoricalTournamentDate] = useState('');
  const [historicalAwardKey, setHistoricalAwardKey] = useState<PlayerAwardKey>('place_1');
  const [historicalCustomTitle, setHistoricalCustomTitle] = useState('');
  const [historicalComment, setHistoricalComment] = useState('');

  const stats = player.gameStats;
""",
)

replace_once(
    'src/components/crm/PlayerProfileContent.tsx',
    """  const openAwardHistory = (filter: AwardFilter) => {
    setAwardFilter(filter);
    setShowAwardEditor(false);
    setAwardError(null);
    setAwardComment('');
    if (filter === 'nominations') setAwardKey('nomination_best_citizen');
    else setAwardKey(filter);
    if (!awardTournamentId && awardTournaments[0]) setAwardTournamentId(awardTournaments[0].id);
  };
""",
    """  const openAwardHistory = (filter: AwardFilter) => {
    setAwardFilter(filter);
    setShowAwardEditor(false);
    setShowHistoricalEditor(false);
    setHistoricalEditingId(null);
    setHistoricalTournamentTitle('');
    setHistoricalTournamentDate('');
    setHistoricalCustomTitle('');
    setHistoricalComment('');
    setAwardError(null);
    setAwardComment('');
    if (filter === 'nominations') {
      setAwardKey('nomination_best_citizen');
      setHistoricalAwardKey('nomination_best_citizen');
    } else {
      setAwardKey(filter);
      setHistoricalAwardKey(filter);
    }
    if (!awardTournamentId && awardTournaments[0]) setAwardTournamentId(awardTournaments[0].id);
  };
""",
)

replace_once(
    'src/components/crm/PlayerProfileContent.tsx',
    """  const handleSuppressAward = async (award: PlayerTournamentAward) => {
    if (!window.confirm(`Убрать «${award.title}» за турнир «${award.tournament_title}»?`)) return;
""",
    """  const handleSuppressAward = async (award: PlayerTournamentAward) => {
    if (!award.tournament_id) return;
    if (!window.confirm(`Убрать «${award.title}» за турнир «${award.tournament_title}»?`)) return;
""",
)

replace_once(
    'src/components/crm/PlayerProfileContent.tsx',
    """  const handleResetAward = async (award: PlayerTournamentAward) => {
    setAwardSaving(true);
""",
    """  const handleResetAward = async (award: PlayerTournamentAward) => {
    if (!award.tournament_id) return;
    setAwardSaving(true);
""",
)

historical_handlers = r'''
  const openHistoricalEditor = () => {
    setShowAwardEditor(false);
    setShowHistoricalEditor(true);
    setHistoricalEditingId(null);
    setHistoricalTournamentTitle('');
    setHistoricalTournamentDate('');
    setHistoricalCustomTitle('');
    setHistoricalComment('');
    setHistoricalAwardKey(awardFilter === 'nominations' ? 'nomination_best_citizen' : (awardFilter || 'place_1'));
    setAwardError(null);
  };

  const editHistoricalAward = (award: PlayerTournamentAward) => {
    if (!award.historical_award_id) return;
    setShowAwardEditor(false);
    setShowHistoricalEditor(true);
    setHistoricalEditingId(award.historical_award_id);
    setHistoricalTournamentTitle(award.tournament_title || '');
    setHistoricalTournamentDate(award.tournament_date ? award.tournament_date.slice(0, 10) : '');
    setHistoricalAwardKey(award.key);
    setHistoricalCustomTitle(award.key === 'nomination_other' ? award.title : '');
    setHistoricalComment(award.comment || '');
    setAwardError(null);
  };

  const closeHistoricalEditor = () => {
    setShowHistoricalEditor(false);
    setHistoricalEditingId(null);
    setHistoricalTournamentTitle('');
    setHistoricalTournamentDate('');
    setHistoricalCustomTitle('');
    setHistoricalComment('');
  };

  const handleSaveHistoricalAward = async () => {
    if (!historicalTournamentTitle.trim()) {
      setAwardError('Укажи название турнира');
      return;
    }
    if (historicalAwardKey === 'nomination_other' && !historicalCustomTitle.trim()) {
      setAwardError('Укажи название номинации');
      return;
    }

    setAwardSaving(true);
    setAwardError(null);
    const payload = {
      award_key: historicalAwardKey,
      tournament_title: historicalTournamentTitle.trim(),
      tournament_date: historicalTournamentDate || null,
      title: historicalAwardKey === 'nomination_other' ? historicalCustomTitle.trim() : undefined,
      comment: historicalComment.trim() || undefined,
    };

    try {
      if (historicalEditingId) {
        await api.updatePlayerHistoricalAward(player.id, historicalEditingId, payload);
      } else {
        await api.createPlayerHistoricalAward(player.id, payload);
      }
      await refreshAwards();
      closeHistoricalEditor();
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось сохранить историческую награду');
    } finally {
      setAwardSaving(false);
    }
  };

  const handleDeleteHistoricalAward = async (award: PlayerTournamentAward) => {
    if (!award.historical_award_id) return;
    if (!window.confirm(`Удалить «${award.title}» за турнир «${award.tournament_title}» из истории?`)) return;
    setAwardSaving(true);
    setAwardError(null);
    try {
      await api.deletePlayerHistoricalAward(player.id, award.historical_award_id);
      await refreshAwards();
    } catch (err: any) {
      setAwardError(err.message || 'Не удалось удалить историческую награду');
    } finally {
      setAwardSaving(false);
    }
  };

'''
replace_once(
    'src/components/crm/PlayerProfileContent.tsx',
    "  const awardHistoryTitle = awardFilter === 'place_1'\n",
    historical_handlers + "  const awardHistoryTitle = awardFilter === 'place_1'\n",
)

replace_once(
    'src/components/crm/PlayerProfileContent.tsx',
    "<p className=\"text-[10px] text-slate-500 mt-1\">История официальных наград по турнирам</p>",
    "<p className=\"text-[10px] text-slate-500 mt-1\">Автоматические результаты и добавленная вручную история</p>",
)

replace_once(
    'src/components/crm/PlayerProfileContent.tsx',
    """                    <span className={`shrink-0 rounded-lg border px-2 py-1 text-[8px] font-black ${award.source === 'manual' ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
                      {award.source === 'manual' ? 'РУЧНАЯ ПРАВКА' : 'ПО ИТОГАМ'}
                    </span>
""",
    """                    <span className={`shrink-0 rounded-lg border px-2 py-1 text-[8px] font-black ${award.source === 'historical' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : award.source === 'manual' ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
                      {award.source === 'historical' ? 'ДОБАВЛЕНО ВРУЧНУЮ' : award.source === 'manual' ? 'РУЧНАЯ ПРАВКА' : 'ПО ИТОГАМ'}
                    </span>
""",
)

replace_once(
    'src/components/crm/PlayerProfileContent.tsx',
    """                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button type="button" disabled={awardSaving} onClick={() => handleSuppressAward(award)} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[9px] font-bold text-rose-300 disabled:opacity-50">Убрать</button>
                    {award.source === 'manual' && (
                      <button type="button" disabled={awardSaving} onClick={() => handleResetAward(award)} className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[9px] font-bold text-slate-300 flex items-center gap-1 disabled:opacity-50"><RotateCcw className="w-3 h-3" />Вернуть расчёт</button>
                    )}
                  </div>
""",
    """                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {award.source === 'historical' ? (
                      <>
                        <button type="button" disabled={awardSaving} onClick={() => editHistoricalAward(award)} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[9px] font-bold text-amber-300 disabled:opacity-50">Изменить</button>
                        <button type="button" disabled={awardSaving} onClick={() => handleDeleteHistoricalAward(award)} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[9px] font-bold text-rose-300 disabled:opacity-50">Удалить</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={awardSaving} onClick={() => handleSuppressAward(award)} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[9px] font-bold text-rose-300 disabled:opacity-50">Убрать</button>
                        {award.source === 'manual' && (
                          <button type="button" disabled={awardSaving} onClick={() => handleResetAward(award)} className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[9px] font-bold text-slate-300 flex items-center gap-1 disabled:opacity-50"><RotateCcw className="w-3 h-3" />Вернуть расчёт</button>
                        )}
                      </>
                    )}
                  </div>
""",
)

old_editor = r'''            {!showAwardEditor ? (
              <button type="button" onClick={() => setShowAwardEditor(true)} className="w-full min-h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-black flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Добавить / исправить награду</button>
            ) : (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between"><strong className="text-xs text-white">Ручная корректировка</strong><button type="button" onClick={() => setShowAwardEditor(false)} className="text-[10px] text-slate-500">Закрыть</button></div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Турнир</label>
                  <select value={awardTournamentId} onChange={(event) => setAwardTournamentId(event.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                    <option value="">Выбери турнир</option>
                    {awardTournaments.map((item) => <option key={item.id} value={item.id}>{item.title} · {fmtDate(item.date)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Награда</label>
                  {awardFilter === 'nominations' ? (
                    <select value={awardKey} onChange={(event) => setAwardKey(event.target.value as PlayerAwardKey)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                      {nominationOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs font-bold text-amber-300">{awardHistoryTitle.replace('ые места', 'ое место').replace('Первые места', '1 место').replace('Вторые места', '2 место').replace('Третьи места', '3 место')}</div>
                  )}
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Комментарий, необязательно</label>
                  <input value={awardComment} onChange={(event) => setAwardComment(event.target.value)} maxLength={500} placeholder="Например: решение главного судьи" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                </div>
                <p className="text-[9px] leading-relaxed text-slate-500">Назначение заменит текущего обладателя этой награды. Для призовых мест, если оба игрока уже в топ-3, система автоматически поменяет их местами.</p>
                <button type="button" disabled={awardSaving || !awardTournamentId} onClick={handleAssignAward} className="w-full min-h-11 rounded-xl bg-amber-500 text-slate-950 text-xs font-black disabled:opacity-50">{awardSaving ? 'Сохранение…' : `Назначить: ${player.nickname}`}</button>
              </div>
            )}
'''

new_editor = r'''            {!showAwardEditor && !showHistoricalEditor && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" onClick={openHistoricalEditor} className="min-h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-black flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Добавить прошлую награду</button>
                {awardTournaments.length > 0 && (
                  <button type="button" onClick={() => setShowAwardEditor(true)} className="min-h-11 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-black">Исправить турнир в базе</button>
                )}
              </div>
            )}

            {showHistoricalEditor && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between"><strong className="text-xs text-white">{historicalEditingId ? 'Изменить прошлую награду' : 'Добавить прошлую награду'}</strong><button type="button" onClick={closeHistoricalEditor} className="text-[10px] text-slate-500">Закрыть</button></div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Название турнира</label>
                  <input value={historicalTournamentTitle} onChange={(event) => setHistoricalTournamentTitle(event.target.value)} maxLength={180} placeholder="Например: Кубок города 2023" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Дата, если известна</label>
                  <input type="date" value={historicalTournamentDate} onChange={(event) => setHistoricalTournamentDate(event.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white" />
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Награда</label>
                  {awardFilter === 'nominations' ? (
                    <select value={historicalAwardKey} onChange={(event) => setHistoricalAwardKey(event.target.value as PlayerAwardKey)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                      {historicalNominationOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs font-bold text-amber-300">{awardHistoryTitle.replace('Первые места', '1 место').replace('Вторые места', '2 место').replace('Третьи места', '3 место')}</div>
                  )}
                </div>
                {historicalAwardKey === 'nomination_other' && (
                  <div>
                    <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Название номинации</label>
                    <input value={historicalCustomTitle} onChange={(event) => setHistoricalCustomTitle(event.target.value)} maxLength={120} placeholder="Например: Лучший дебют" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                  </div>
                )}
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Комментарий, необязательно</label>
                  <input value={historicalComment} onChange={(event) => setHistoricalComment(event.target.value)} maxLength={500} placeholder="Откуда взята информация или уточнение" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                </div>
                <p className="text-[9px] leading-relaxed text-slate-500">Эта запись существует только в профиле игрока и не меняет результаты турниров в базе.</p>
                <button type="button" disabled={awardSaving || !historicalTournamentTitle.trim()} onClick={handleSaveHistoricalAward} className="w-full min-h-11 rounded-xl bg-amber-500 text-slate-950 text-xs font-black disabled:opacity-50">{awardSaving ? 'Сохранение…' : historicalEditingId ? 'Сохранить изменения' : `Добавить: ${player.nickname}`}</button>
              </div>
            )}

            {showAwardEditor && (
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between"><strong className="text-xs text-white">Исправить результат турнира в базе</strong><button type="button" onClick={() => setShowAwardEditor(false)} className="text-[10px] text-slate-500">Закрыть</button></div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Турнир</label>
                  <select value={awardTournamentId} onChange={(event) => setAwardTournamentId(event.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                    <option value="">Выбери турнир</option>
                    {awardTournaments.map((item) => <option key={item.id} value={item.id}>{item.title} · {fmtDate(item.date)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Награда</label>
                  {awardFilter === 'nominations' ? (
                    <select value={awardKey} onChange={(event) => setAwardKey(event.target.value as PlayerAwardKey)} className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white">
                      {nominationOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs font-bold text-sky-300">{awardHistoryTitle.replace('Первые места', '1 место').replace('Вторые места', '2 место').replace('Третьи места', '3 место')}</div>
                  )}
                </div>
                <div>
                  <label className="text-[9px] uppercase font-black text-slate-500 block mb-1">Комментарий, необязательно</label>
                  <input value={awardComment} onChange={(event) => setAwardComment(event.target.value)} maxLength={500} placeholder="Например: решение главного судьи" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" />
                </div>
                <p className="text-[9px] leading-relaxed text-slate-500">Это меняет официальный результат существующего турнира. Для призовых мест система сохраняет уникальные 1–3 места и при необходимости переставляет игроков.</p>
                <button type="button" disabled={awardSaving || !awardTournamentId} onClick={handleAssignAward} className="w-full min-h-11 rounded-xl bg-sky-500 text-slate-950 text-xs font-black disabled:opacity-50">{awardSaving ? 'Сохранение…' : `Назначить: ${player.nickname}`}</button>
              </div>
            )}
'''
replace_once('src/components/crm/PlayerProfileContent.tsx', old_editor, new_editor)

# 6. Unit coverage for historical award key/title behaviour.
replace_once(
    'src/tests/tournamentAwardsService.test.ts',
    """  buildPlayerAwardStats,
  getTournamentAwardDefinition,
  isTournamentAwardKey,
  TOURNAMENT_AWARD_DEFINITIONS,
""",
    """  buildPlayerAwardStats,
  getHistoricalAwardDefaultTitle,
  getTournamentAwardDefinition,
  isHistoricalAwardKey,
  isTournamentAwardKey,
  TOURNAMENT_AWARD_DEFINITIONS,
""",
)

replace_once(
    'src/tests/tournamentAwardsService.test.ts',
    """  it('counts podium places and nominations independently', () => {
""",
    """  it('accepts custom historical nominations without adding them to official tournament slots', () => {
    expect(isHistoricalAwardKey('nomination_other')).toBe(true);
    expect(isTournamentAwardKey('nomination_other')).toBe(false);
    expect(getHistoricalAwardDefaultTitle('nomination_other')).toBe('Номинация');
    expect(getHistoricalAwardDefaultTitle('place_1')).toBe('1 место');
  });

  it('counts podium places and nominations independently', () => {
""",
)
