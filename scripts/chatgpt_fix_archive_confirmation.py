from pathlib import Path


def replace_once(path_str: str, old: str, new: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match in {path_str}, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


path = 'src/components/crm/EveningGamesView.tsx'

replace_once(
    path,
    "  const [creating, setCreating] = useState(false);",
    """  const [creating, setCreating] = useState(false);
  const [pendingGameAction, setPendingGameAction] = useState<{ type: 'archive' | 'delete'; game: ClubGameRecord } | null>(null);
  const [processingGameAction, setProcessingGameAction] = useState(false);""",
    'game action state',
)

replace_once(
    path,
    """  const archiveGame = async (game: ClubGameRecord) => {
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
  };""",
    """  const archiveGame = (game: ClubGameRecord) => {
    setPendingGameAction({ type: 'archive', game });
  };""",
    'archive request handler',
)

replace_once(
    path,
    """  const permanentlyDeleteArchivedGame = async (game: ClubGameRecord) => {
    if (!confirm(`Удалить игру #${game.global_game_number} НАВСЕГДА из архива? Восстановить её после этого будет нельзя.`)) return;
    try {
      await clubGamesApi.deleteArchived(game.id);
      setArchivedGames((previous) => previous.filter((item) => item.id !== game.id));
    } catch (err: any) {
      alert(err.message || 'Не удалось окончательно удалить игру');
    }
  };""",
    """  const permanentlyDeleteArchivedGame = (game: ClubGameRecord) => {
    setPendingGameAction({ type: 'delete', game });
  };

  const confirmPendingGameAction = async () => {
    const pending = pendingGameAction;
    if (!pending || processingGameAction) return;
    setProcessingGameAction(true);
    try {
      if (pending.type === 'archive') {
        const archived = await clubGamesApi.archive(pending.game.id);
        setGames((previous) => previous.filter((item) => item.id !== pending.game.id));
        setArchivedGames((previous) => [archived, ...previous.filter((item) => item.id !== pending.game.id)]);
        setActiveProtocolGame((current) => current?.id === pending.game.id ? null : current);
        setActiveLiveGame((current) => current?.id === pending.game.id ? null : current);
      } else {
        await clubGamesApi.deleteArchived(pending.game.id);
        setArchivedGames((previous) => previous.filter((item) => item.id !== pending.game.id));
      }
      setPendingGameAction(null);
    } catch (err: any) {
      alert(err.message || (pending.type === 'archive' ? 'Не удалось перенести игру в архив' : 'Не удалось окончательно удалить игру'));
    } finally {
      setProcessingGameAction(false);
    }
  };""",
    'permanent delete and confirmation handler',
)

replace_once(
    path,
    """      {showCreate && (
        <div className=\"fixed inset-0 z-[80] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto\">""",
    """      {pendingGameAction && (
        <div className=\"fixed inset-0 z-[95] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4\">
          <div className=\"w-full max-w-md rounded-3xl border-2 border-amber-700/60 bg-slate-900 shadow-2xl p-5 space-y-4\">
            <div>
              <div className=\"text-[10px] font-black uppercase tracking-widest text-amber-400\">Подтвердите действие</div>
              <h3 className=\"text-lg font-black text-white mt-1\">
                {pendingGameAction.type === 'archive' ? 'Перенести игру в архив?' : 'Удалить игру навсегда?'}
              </h3>
              <p className=\"text-sm font-bold text-slate-200 mt-2\">Игра #{pendingGameAction.game.global_game_number}</p>
              <p className=\"text-xs text-slate-400 mt-2 leading-relaxed\">
                {pendingGameAction.type === 'archive'
                  ? 'Игра исчезнет из основного списка, но все данные и протокол сохранятся. Её можно будет восстановить из архива.'
                  : 'Игра будет окончательно удалена из базы. После этого восстановить её будет нельзя.'}
              </p>
            </div>
            <div className=\"grid grid-cols-2 gap-2\">
              <button
                type=\"button\"
                disabled={processingGameAction}
                onClick={() => setPendingGameAction(null)}
                className=\"min-h-12 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-xs font-black disabled:opacity-40\"
              >
                Отмена
              </button>
              <button
                type=\"button\"
                disabled={processingGameAction}
                onClick={confirmPendingGameAction}
                className={`min-h-12 rounded-xl border text-white text-xs font-black uppercase tracking-wide disabled:opacity-50 ${pendingGameAction.type === 'archive' ? 'bg-amber-600 border-amber-500' : 'bg-rose-600 border-rose-500'}`}
              >
                {processingGameAction
                  ? (pendingGameAction.type === 'archive' ? 'Переносим…' : 'Удаляем…')
                  : (pendingGameAction.type === 'archive' ? 'В архив' : 'Удалить навсегда')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className=\"fixed inset-0 z-[80] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto\">""",
    'custom game action confirmation modal',
)

print('Archive confirmation UI fix applied')
