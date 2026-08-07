from pathlib import Path


def replace_once(path_str: str, old: str, new: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match in {path_str}, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


# -------------------- Live discipline misclick protection --------------------
engine = 'src/components/LiveGameEngine.tsx'
replace_once(
    engine,
    "  GameDiscipline,\n  addMajorTechFoul,",
    "  GameDiscipline,\n  PendingActionType,\n  addMajorTechFoul,",
    'import PendingActionType',
)
replace_once(
    engine,
    "  cancelAction,\n  confirmAction,",
    "  confirmAction,",
    'remove cancelAction import',
)
replace_once(
    engine,
    "type PostNightStage = 'none' | 'farewell' | 'death_protocol';\n",
    """type PostNightStage = 'none' | 'farewell' | 'death_protocol';

type PendingDisciplineConfirmation = {
  slot: number;
  action: PendingActionType;
};

const dangerousActionCopy = (action: PendingActionType) => {
  if (action === 'removal_4th_foul') return {
    title: 'Удаление по 4-му фолу',
    description: 'Игрок будет удалён из игры, а ближайшее голосование будет отменено.',
    confirmLabel: 'Подтвердить 4-й фол',
  };
  if (action === 'minor_tech_causing_removal' || action === 'major_tech_causing_removal') return {
    title: 'Удаление по второму техфолу',
    description: 'Технический фол будет зафиксирован, игрок будет удалён, а ближайшее голосование будет отменено.',
    confirmLabel: 'Подтвердить техфол',
  };
  if (action === 'direct_removal') return {
    title: 'Удаление решением судьи',
    description: 'Игрок будет удалён из игры, а ближайшее голосование будет отменено.',
    confirmLabel: 'Подтвердить удаление',
  };
  return {
    title: 'Зафиксировать ППК',
    description: 'Игра немедленно завершится победой противоположной команды, а ППК попадёт в итоговый протокол.',
    confirmLabel: 'Подтвердить ППК',
  };
};
""",
    'danger confirmation types',
)
replace_once(
    engine,
    "  const [discipline, setDiscipline] = useState<GameDiscipline>(initialDiscipline);\n  const [actionPlayerSlot, setActionPlayerSlot] = useState<number | null>(null);",
    """  const [discipline, setDiscipline] = useState<GameDiscipline>(initialDiscipline);
  const [actionPlayerSlot, setActionPlayerSlot] = useState<number | null>(null);
  const [pendingDisciplineConfirmation, setPendingDisciplineConfirmation] = useState<PendingDisciplineConfirmation | null>(null);""",
    'danger confirmation state',
)

old_discipline_handlers = """  const addRegularFoulFromMenu = (slot: number) => {
    const id = String(slot);
    saveSnapshot();
    let next = addRegularFoul(discipline, id);
    const pending = next.players[id]?.pendingAction;
    if (pending === 'removal_4th_foul') {
      if (window.confirm(`4-й фол удалит игрока #${slot} и отменит ближайшее голосование. Подтвердить?`)) {
        next = confirmAction(next, id);
      } else {
        next = cancelAction(next, id);
      }
    }
    setDiscipline(next);
    syncDisciplinePlayer(next, slot);
  };

  const addTechFoulFromMenu = (slot: number, kind: 'minor' | 'major') => {
    const id = String(slot);
    saveSnapshot();
    let next = kind === 'minor' ? addMinorTechFoul(discipline, id) : addMajorTechFoul(discipline, id);
    const pending = next.players[id]?.pendingAction;
    if (pending === 'minor_tech_causing_removal' || pending === 'major_tech_causing_removal') {
      if (window.confirm(`Это второй технический фол игрока #${slot}: игрок будет удалён, а ближайшее голосование отменится. Подтвердить?`)) {
        next = confirmAction(next, id);
      } else {
        next = cancelAction(next, id);
      }
    }
    setDiscipline(next);
    syncDisciplinePlayer(next, slot);
  };

  const directRemoveFromMenu = (slot: number) => {
    if (!window.confirm(`Удалить игрока #${slot} решением судьи? Ближайшее голосование будет отменено.`)) return;
    const id = String(slot);
    saveSnapshot();
    let next = requestDirectRemoval(discipline, id);
    next = confirmAction(next, id);
    setDiscipline(next);
    syncDisciplinePlayer(next, slot);
    setActionPlayerSlot(null);
  };
"""
new_discipline_handlers = """  const requestDisciplineConfirmation = (slot: number, action: PendingActionType) => {
    setActionPlayerSlot(null);
    setPendingDisciplineConfirmation({ slot, action });
  };

  const addRegularFoulFromMenu = (slot: number) => {
    const id = String(slot);
    const next = addRegularFoul(discipline, id);
    const pending = next.players[id]?.pendingAction;
    if (pending === 'removal_4th_foul') {
      requestDisciplineConfirmation(slot, pending);
      return;
    }
    if (next === discipline) return;
    saveSnapshot();
    setDiscipline(next);
    syncDisciplinePlayer(next, slot);
  };

  const addTechFoulFromMenu = (slot: number, kind: 'minor' | 'major') => {
    const id = String(slot);
    const next = kind === 'minor' ? addMinorTechFoul(discipline, id) : addMajorTechFoul(discipline, id);
    const pending = next.players[id]?.pendingAction;
    if (pending === 'minor_tech_causing_removal' || pending === 'major_tech_causing_removal') {
      requestDisciplineConfirmation(slot, pending);
      return;
    }
    if (next === discipline) return;
    saveSnapshot();
    setDiscipline(next);
    syncDisciplinePlayer(next, slot);
  };

  const directRemoveFromMenu = (slot: number) => {
    requestDisciplineConfirmation(slot, 'direct_removal');
  };

  const confirmPendingDisciplineAction = () => {
    const pending = pendingDisciplineConfirmation;
    if (!pending) return;
    const id = String(pending.slot);
    let next = discipline;

    if (pending.action === 'removal_4th_foul') next = addRegularFoul(next, id);
    else if (pending.action === 'minor_tech_causing_removal') next = addMinorTechFoul(next, id);
    else if (pending.action === 'major_tech_causing_removal') next = addMajorTechFoul(next, id);
    else if (pending.action === 'direct_removal') next = requestDirectRemoval(next, id);
    else if (pending.action === 'ppk') next = requestPpk(next, id);

    if (next.players[id]?.pendingAction !== pending.action) {
      setPendingDisciplineConfirmation(null);
      showToast('Действие уже недоступно — состояние игрока изменилось', 'warning');
      return;
    }

    saveSnapshot();
    next = confirmAction(next, id);
    setDiscipline(next);
    syncDisciplinePlayer(next, pending.slot);
    setPendingDisciplineConfirmation(null);

    if (pending.action === 'ppk') {
      const winner = next.ppkWinnerTeam === 'red' ? 'Красные' : 'Чёрные';
      handleEndGameWithWinner(winner, 'ppk', pending.slot);
    }
  };
"""
replace_once(engine, old_discipline_handlers, new_discipline_handlers, 'discipline handler flow')

replace_once(
    engine,
    """  const handlePpkFromMenu = (slot: number) => {
    if (!window.confirm(`Зафиксировать ППК игрока #${slot}? Игра немедленно завершится победой противоположной команды.`)) return;
    const id = String(slot);
    saveSnapshot();
    let next = requestPpk(discipline, id);
    next = confirmAction(next, id);
    setDiscipline(next);
    syncDisciplinePlayer(next, slot);
    setActionPlayerSlot(null);
    const winner = next.ppkWinnerTeam === 'red' ? 'Красные' : 'Чёрные';
    handleEndGameWithWinner(winner, 'ppk', slot);
  };""",
    """  const handlePpkFromMenu = (slot: number) => {
    requestDisciplineConfirmation(slot, 'ppk');
  };""",
    'PPK confirmation flow',
)
replace_once(
    engine,
    "          handleFoulChange={handleFoulChange}\n          markPlayerSpoken={markPlayerSpoken}",
    "          handleFoulChange={handleFoulChange}\n          onRequestDirectRemoval={directRemoveFromMenu}\n          markPlayerSpoken={markPlayerSpoken}",
    'SeatCard direct removal callback',
)
replace_once(
    engine,
    """    <div className=\"space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-32 sm:pb-24 select-none\">
      {actionPlayer && phase === 'day_speeches' && (""",
    """    <div className=\"space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-32 sm:pb-24 select-none\">
      {pendingDisciplineConfirmation && (() => {
        const copy = dangerousActionCopy(pendingDisciplineConfirmation.action);
        const player = activePlayers.find((item) => item.slot_num === pendingDisciplineConfirmation.slot);
        return (
          <div className=\"fixed inset-0 z-[126] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4\">
            <div className=\"w-full max-w-md rounded-3xl border-2 border-rose-700/70 bg-slate-900 shadow-2xl p-5 space-y-4\">
              <div>
                <div className=\"text-[10px] font-black uppercase tracking-widest text-rose-400\">Требуется подтверждение</div>
                <h3 className=\"text-lg font-black text-white mt-1\">{copy.title}</h3>
                <p className=\"text-sm font-bold text-slate-200 mt-2\">#{pendingDisciplineConfirmation.slot} · {player?.nickname || 'Игрок'}</p>
                <p className=\"text-xs text-slate-400 mt-2 leading-relaxed\">{copy.description}</p>
              </div>
              <div className=\"rounded-2xl border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-200\">
                Первое нажатие ничего не меняет. Действие будет применено только после кнопки ниже.
              </div>
              <div className=\"grid grid-cols-2 gap-2\">
                <button type=\"button\" onClick={() => setPendingDisciplineConfirmation(null)} className=\"min-h-12 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-xs font-black\">Отмена</button>
                <button type=\"button\" onClick={confirmPendingDisciplineAction} className=\"min-h-12 rounded-xl bg-rose-600 border border-rose-500 text-white text-xs font-black uppercase tracking-wide\">{copy.confirmLabel}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {actionPlayer && phase === 'day_speeches' && (""",
    'danger confirmation modal',
)

# SeatCard direct removal must use the discipline engine instead of mutating player state directly.
seat = 'src/components/LiveGameEngine/SeatCard.tsx'
replace_once(
    seat,
    "  handleFoulChange: (slotNum: number, dir: \"up\" | \"down\") => void;\n  markPlayerSpoken: (slotNum: number) => void;",
    "  handleFoulChange: (slotNum: number, dir: \"up\" | \"down\") => void;\n  onRequestDirectRemoval: (slotNum: number) => void;\n  markPlayerSpoken: (slotNum: number) => void;",
    'SeatCard prop type',
)
replace_once(
    seat,
    "  handleFoulChange,\n  markPlayerSpoken,",
    "  handleFoulChange,\n  onRequestDirectRemoval,\n  markPlayerSpoken,",
    'SeatCard prop destructure',
)
old_direct_button = """                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Дисквалифицировать игрока #${slotNum} (${p.nickname})?`)) {
                      setActivePlayers((prev) =>
                        prev.map((pl) =>
                          pl.slot_num === slotNum
                            ? {
                                ...pl,
                                fouls: 4,
                                alive: false,
                                eliminated_phase: `Удален (Д${roundNumber})`,
                              }
                            : pl
                        )
                      );
                      showToast(`Игрок #${slotNum} (${p.nickname}) дисквалифицирован!`, \"error\");
                    }
                  }}"""
new_direct_button = """                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDirectRemoval(slotNum);
                  }}"""
replace_once(seat, old_direct_button, new_direct_button, 'SeatCard direct removal behavior')

# -------------------- Persistent game archive --------------------
replace_once(
    'src/db/index.ts',
    "  addColumnIfNotExists('games', 'evening_table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');",
    "  addColumnIfNotExists('games', 'evening_table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');\n  addColumnIfNotExists('games', 'archived_at', 'TEXT');",
    'games archived_at migration',
)
replace_once(
    'src/db/schema.ts',
    "  created_at: text('created_at').notNull(),\n});\n\nexport const migrationHistory",
    "  created_at: text('created_at').notNull(),\n  archived_at: text('archived_at'),\n});\n\nexport const migrationHistory",
    'games schema archived_at',
)

routes = 'src/server/routes/gamesRoutes.ts'
replace_once(
    routes,
    "    const { evening_id } = req.query;",
    "    const { evening_id, archived } = req.query;",
    'games list archived query param',
)
replace_once(
    routes,
    """    if (evening_id) {
      query += ' AND g.evening_id = ?';
      params.push(evening_id);
    }

    query += ' ORDER BY g.global_game_number DESC, g.id DESC';""",
    """    if (evening_id) {
      query += ' AND g.evening_id = ?';
      params.push(evening_id);
    }

    if (archived === '1' || archived === 'true') query += ' AND g.archived_at IS NOT NULL';
    else query += ' AND g.archived_at IS NULL';

    query += ' ORDER BY g.global_game_number DESC, g.id DESC';""",
    'games list archive filter',
)
replace_once(
    routes,
    "    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });\n    if (!existing.evening_id) return res.status(400).json({ error: 'Это не игра обычного вечера' });",
    "    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });\n    if (!existing.evening_id) return res.status(400).json({ error: 'Это не игра обычного вечера' });\n    if (existing.archived_at) return res.status(409).json({ error: 'Игра находится в архиве. Сначала восстановите её.' });",
    'block protocol edits in archive',
)
archive_routes = r'''
// POST /api/games/:gameId/archive - soft-delete any club evening game.
router.post('/:gameId/archive', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = (req as any).db || (await getDb());
    const existing = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    if (!existing.evening_id) return res.status(400).json({ error: 'Архив доступен только для игр обычного вечера' });
    const protocol = safeJsonParse<any>(existing.protocol_text, null);
    if (!protocol || protocol.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'Архив доступен только для клубных игр вечера' });
    }
    if (!existing.archived_at) {
      await db.run('UPDATE games SET archived_at = ? WHERE id = ?', [new Date().toISOString(), gameId]);
    }
    const row = await db.get(
      `SELECT g.*, et.name AS table_name
         FROM games g
    LEFT JOIN evening_tables et ON et.id = g.evening_table_id
        WHERE g.id = ?`,
      [gameId]
    );
    res.json(normalizeGame(row));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось перенести игру в архив' });
  }
});

// POST /api/games/:gameId/archive/restore - restore a soft-deleted club evening game.
router.post('/:gameId/archive/restore', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = (req as any).db || (await getDb());
    const existing = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    const protocol = safeJsonParse<any>(existing.protocol_text, null);
    if (!existing.evening_id || !protocol || protocol.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'Это не клубная игра обычного вечера' });
    }
    await db.run('UPDATE games SET archived_at = NULL WHERE id = ?', [gameId]);
    const row = await db.get(
      `SELECT g.*, et.name AS table_name
         FROM games g
    LEFT JOIN evening_tables et ON et.id = g.evening_table_id
        WHERE g.id = ?`,
      [gameId]
    );
    res.json(normalizeGame(row));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось восстановить игру' });
  }
});

// DELETE /api/games/:gameId/archive - permanent deletion is allowed only from archive.
router.delete('/:gameId/archive', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = (req as any).db || (await getDb());
    const existing = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    const protocol = safeJsonParse<any>(existing.protocol_text, null);
    if (!existing.evening_id || !protocol || protocol.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'Это не клубная игра обычного вечера' });
    }
    if (!existing.archived_at) {
      return res.status(409).json({ error: 'Сначала перенесите игру в архив' });
    }
    await db.run('DELETE FROM games WHERE id = ?', [gameId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось окончательно удалить игру' });
  }
});

'''
replace_once(
    routes,
    "// DELETE /api/games/:gameId/evening-draft - delete only an unfinished club draft.\n",
    archive_routes + "// DELETE /api/games/:gameId/evening-draft - legacy hard-delete for unfinished drafts.\n",
    'archive routes',
)

api_path = 'src/lib/clubGamesApi.ts'
replace_once(
    api_path,
    "  created_at: string;\n}",
    "  created_at: string;\n  archived_at?: string | null;\n}",
    'ClubGameRecord archived_at',
)
replace_once(
    api_path,
    """  list: (eveningId: string) =>
    request<ClubGameRecord[]>(`/api/games?evening_id=${encodeURIComponent(eveningId)}`),
""",
    """  list: (eveningId: string) =>
    request<ClubGameRecord[]>(`/api/games?evening_id=${encodeURIComponent(eveningId)}`),

  listArchived: (eveningId: string) =>
    request<ClubGameRecord[]>(`/api/games?evening_id=${encodeURIComponent(eveningId)}&archived=1`),
""",
    'clubGamesApi listArchived',
)
replace_once(
    api_path,
    """  deleteDraft: (gameId: number) =>
    request<{ success: boolean }>(`/api/games/${gameId}/evening-draft`, { method: 'DELETE' }),
};""",
    """  archive: (gameId: number) =>
    request<ClubGameRecord>(`/api/games/${gameId}/archive`, { method: 'POST' }),

  restoreArchived: (gameId: number) =>
    request<ClubGameRecord>(`/api/games/${gameId}/archive/restore`, { method: 'POST' }),

  deleteArchived: (gameId: number) =>
    request<{ success: boolean }>(`/api/games/${gameId}/archive`, { method: 'DELETE' }),

  deleteDraft: (gameId: number) =>
    request<{ success: boolean }>(`/api/games/${gameId}/evening-draft`, { method: 'DELETE' }),
};""",
    'clubGamesApi archive methods',
)

# Archive UI for evening games.
view = 'src/components/crm/EveningGamesView.tsx'
replace_once(
    view,
    "import { ArrowLeft, CheckCircle2, FileText, Gamepad2, Play, Plus, Trash2, Users, X } from 'lucide-react';",
    "import { Archive, ArrowLeft, CheckCircle2, FileText, Gamepad2, Play, Plus, RotateCcw, Trash2, Users, X } from 'lucide-react';",
    'archive icons',
)
replace_once(
    view,
    "  const [games, setGames] = useState<ClubGameRecord[]>([]);\n  const [loading, setLoading] = useState(true);",
    "  const [games, setGames] = useState<ClubGameRecord[]>([]);\n  const [archivedGames, setArchivedGames] = useState<ClubGameRecord[]>([]);\n  const [showArchive, setShowArchive] = useState(false);\n  const [loading, setLoading] = useState(true);",
    'archive UI state',
)
replace_once(
    view,
    """      const [eveningData, gameData] = await Promise.all([
        api.getEvening(eveningId) as any,
        clubGamesApi.list(eveningId),
      ]);
      setEvening(eveningData);
      setGames(gameData.filter((game) => Boolean(game.club_protocol)));""",
    """      const [eveningData, gameData, archivedData] = await Promise.all([
        api.getEvening(eveningId) as any,
        clubGamesApi.list(eveningId),
        clubGamesApi.listArchived(eveningId),
      ]);
      setEvening(eveningData);
      setGames(gameData.filter((game) => Boolean(game.club_protocol)));
      setArchivedGames(archivedData.filter((game) => Boolean(game.club_protocol)));""",
    'load archived games',
)
old_delete = """  const deleteDraft = async (game: ClubGameRecord) => {
    if (!confirm('Удалить черновик этой игры?')) return;
    try {
      await clubGamesApi.deleteDraft(game.id);
      setGames((previous) => previous.filter((item) => item.id !== game.id));
    } catch (err: any) {
      alert(err.message || 'Не удалось удалить черновик');
    }
  };
"""
new_archive_handlers = """  const archiveGame = async (game: ClubGameRecord) => {
    if (!confirm(`Перенести игру #${game.global_game_number} в архив? Данные и протокол сохранятся.`)) return;
    try {
      const archived = await clubGamesApi.archive(game.id);
      setGames((previous) => previous.filter((item) => item.id !== game.id));
      setArchivedGames((previous) => [archived, ...previous.filter((item) => item.id !== game.id)]);
      setActiveProtocolGame((current) => current?.id === game.id ? null : current);
      setActiveLiveGame((current) => current?.id === game.id ? null : current);
    } catch (err: any) {
      alert(err.message || 'Не удалось перенести игру в архив');
    }
  };

  const restoreArchivedGame = async (game: ClubGameRecord) => {
    try {
      const restored = await clubGamesApi.restoreArchived(game.id);
      setArchivedGames((previous) => previous.filter((item) => item.id !== game.id));
      setGames((previous) => [restored, ...previous.filter((item) => item.id !== game.id)]);
    } catch (err: any) {
      alert(err.message || 'Не удалось восстановить игру');
    }
  };

  const permanentlyDeleteArchivedGame = async (game: ClubGameRecord) => {
    if (!confirm(`Удалить игру #${game.global_game_number} НАВСЕГДА из архива? Восстановить её после этого будет нельзя.`)) return;
    try {
      await clubGamesApi.deleteArchived(game.id);
      setArchivedGames((previous) => previous.filter((item) => item.id !== game.id));
    } catch (err: any) {
      alert(err.message || 'Не удалось окончательно удалить игру');
    }
  };
"""
replace_once(view, old_delete, new_archive_handlers, 'archive handlers')
replace_once(
    view,
    """  const localNumberById = useMemo(() => {
    const chronological = [...games].sort((a, b) => a.id - b.id);
    return new Map(chronological.map((game, index) => [game.id, index + 1]));
  }, [games]);""",
    """  const localNumberById = useMemo(() => {
    const chronological = [...games, ...archivedGames].sort((a, b) => a.id - b.id);
    return new Map(chronological.map((game, index) => [game.id, index + 1]));
  }, [games, archivedGames]);""",
    'stable local numbering with archive',
)
replace_once(
    view,
    """        <div className=\"grid grid-cols-3 gap-2 text-center\">
          <div className=\"bg-slate-950 border border-slate-850 rounded-2xl p-2.5\"><span className=\"text-[9px] uppercase text-slate-500 block\">Всего игр</span><strong className=\"text-lg text-white\">{games.length}</strong></div>
          <div className=\"bg-slate-950 border border-slate-850 rounded-2xl p-2.5\"><span className=\"text-[9px] uppercase text-slate-500 block\">Завершено</span><strong className=\"text-lg text-emerald-400\">{games.filter((game) => game.status === 'completed').length}</strong></div>
          <div className=\"bg-slate-950 border border-slate-850 rounded-2xl p-2.5\"><span className=\"text-[9px] uppercase text-slate-500 block\">Черновики</span><strong className=\"text-lg text-amber-400\">{games.filter((game) => game.status === 'draft').length}</strong></div>
        </div>""",
    """        <div className=\"grid grid-cols-2 sm:grid-cols-4 gap-2 text-center\">
          <div className=\"bg-slate-950 border border-slate-850 rounded-2xl p-2.5\"><span className=\"text-[9px] uppercase text-slate-500 block\">Активные</span><strong className=\"text-lg text-white\">{games.length}</strong></div>
          <div className=\"bg-slate-950 border border-slate-850 rounded-2xl p-2.5\"><span className=\"text-[9px] uppercase text-slate-500 block\">Завершено</span><strong className=\"text-lg text-emerald-400\">{games.filter((game) => game.status === 'completed').length}</strong></div>
          <div className=\"bg-slate-950 border border-slate-850 rounded-2xl p-2.5\"><span className=\"text-[9px] uppercase text-slate-500 block\">Черновики</span><strong className=\"text-lg text-amber-400\">{games.filter((game) => game.status === 'draft').length}</strong></div>
          <button type=\"button\" onClick={() => setShowArchive((value) => !value)} className=\"bg-slate-950 border border-slate-800 rounded-2xl p-2.5 hover:border-slate-600\"><span className=\"text-[9px] uppercase text-slate-500 block\">Архив</span><strong className=\"text-lg text-slate-300\">{archivedGames.length}</strong></button>
        </div>""",
    'archive counter',
)
replace_once(
    view,
    "                  {game.status === 'draft' && <button type=\"button\" onClick={() => deleteDraft(game)} className=\"w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 hover:text-rose-400 flex items-center justify-center\"><Trash2 className=\"w-4 h-4\" /></button>}",
    "                  <button type=\"button\" onClick={() => archiveGame(game)} title=\"Перенести в архив\" className=\"w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 hover:text-amber-300 hover:border-amber-700 flex items-center justify-center\"><Archive className=\"w-4 h-4\" /></button>",
    'archive button for every game',
)
archive_ui = r'''

      {showArchive && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2"><Archive className="w-4 h-4 text-amber-400" />Архив игр</h3>
              <p className="text-[10px] text-slate-500 mt-1">Архивные игры не показываются в основном списке и не редактируются. Здесь их можно восстановить или удалить навсегда вручную.</p>
            </div>
            <button type="button" onClick={() => setShowArchive(false)} className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">×</button>
          </div>
          {archivedGames.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">Архив пуст</div>
          ) : archivedGames.map((game) => {
            const protocol = game.club_protocol?.protocol;
            const localNumber = localNumberById.get(game.id) || 1;
            return (
              <div key={game.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm text-slate-200">Игра {localNumber}</strong>
                    <span className="text-[9px] font-mono text-slate-600">#{game.global_game_number}</span>
                    <span className="px-2 py-0.5 rounded-full border border-slate-700 text-[9px] font-black uppercase text-slate-400">В архиве</span>
                    {protocol?.winner_team && <span className="text-[9px] text-slate-500">Победа {protocol.winner_team === 'red' ? 'красных' : 'чёрных'}</span>}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{game.table_name || 'Без стола'}{game.judge_name ? ` · ${game.judge_name}` : ''}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => restoreArchivedGame(game)} className="min-h-10 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-black flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" />Восстановить</button>
                  <button type="button" onClick={() => permanentlyDeleteArchivedGame(game)} className="min-h-10 px-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-[10px] font-black flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Навсегда</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
'''
replace_once(
    view,
    "\n      {showCreate && (\n",
    archive_ui + "\n      {showCreate && (\n",
    'archive section UI',
)

# Integration test for archive lifecycle, including completed games.
test_path = Path('src/tests/clubGameArchive.test.ts')
if test_path.exists():
    raise RuntimeError('src/tests/clubGameArchive.test.ts already exists')
test_path.write_text(r'''import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

describe('club evening game archive', () => {
  let app: any;
  let db: DatabaseWrapper;
  let cookie: string;
  const eveningId = 'archive-evening';

  beforeAll(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    cookie = `organizer_token=${generateOrganizerToken()}`;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, default_price, created_at, updated_at)
       VALUES (?, ?, ?, 'Europe/Moscow', 'STANDARD', 'active', 0, ?, ?)`,
      [eveningId, 'Архивный вечер', now, now, now],
    );
    const protocol = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: { game_id: '1', status: 'completed', winner_team: 'red' },
      player_results: [],
    };
    await db.run(
      `INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, protocol_text, slots_json, created_at)
       VALUES (?, 101, ?, 'Красные', 'Победа Красные', ?, '[]', ?)`,
      [eveningId, now, JSON.stringify(protocol), now],
    );
  });

  it('archives, hides, restores and permanently deletes a completed club game', async () => {
    const initial = await request(app).get(`/api/games?evening_id=${eveningId}`);
    expect(initial.status).toBe(200);
    expect(initial.body).toHaveLength(1);
    const gameId = initial.body[0].id;

    const archive = await request(app).post(`/api/games/${gameId}/archive`).set('Cookie', cookie);
    expect(archive.status).toBe(200);
    expect(archive.body.archived_at).toBeTruthy();
    expect(archive.body.status).toBe('completed');

    const activeList = await request(app).get(`/api/games?evening_id=${eveningId}`);
    expect(activeList.body).toHaveLength(0);
    const archivedList = await request(app).get(`/api/games?evening_id=${eveningId}&archived=1`);
    expect(archivedList.body).toHaveLength(1);

    const editWhileArchived = await request(app)
      .put(`/api/games/${gameId}/evening-protocol`)
      .set('Cookie', cookie)
      .send({ protocol: { status: 'draft' }, player_results: Array(10).fill({}) });
    expect(editWhileArchived.status).toBe(409);

    const restore = await request(app).post(`/api/games/${gameId}/archive/restore`).set('Cookie', cookie);
    expect(restore.status).toBe(200);
    expect(restore.body.archived_at).toBeNull();
    expect((await request(app).get(`/api/games?evening_id=${eveningId}`)).body).toHaveLength(1);

    await request(app).post(`/api/games/${gameId}/archive`).set('Cookie', cookie);
    const permanent = await request(app).delete(`/api/games/${gameId}/archive`).set('Cookie', cookie);
    expect(permanent.status).toBe(200);
    expect(permanent.body.success).toBe(true);
    expect((await request(app).get(`/api/games?evening_id=${eveningId}&archived=1`)).body).toHaveLength(0);
  });
});
''', encoding='utf-8')

print('Safety confirmations and persistent game archive patch applied')
