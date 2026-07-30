import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { api, Player, Tournament } from '../../../lib/api.ts';

interface CreateTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (tournament: Tournament) => void;
}

export const CreateTournamentModal: React.FC<CreateTournamentModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('Зал #1 (Главный)');
  const [stage, setStage] = useState('Отборочный этап');
  const [chiefJudgeName, setChiefJudgeName] = useState('');
  const [notes, setNotes] = useState('');

  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<
    Array<{ player_id: string; nickname: string; display_name: string }>
  >([]);

  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadPlayers();
      // Set default date to today 19:00
      const now = new Date();
      now.setHours(19, 0, 0, 0);
      setDate(now.toISOString().slice(0, 16));
      setErrorMsg('');
    }
  }, [isOpen]);

  const loadPlayers = async () => {
    setLoadingPlayers(true);
    try {
      const players = await api.getPlayers();
      setAvailablePlayers(players);
    } catch (err: any) {
      console.error('Failed to load players for tournament creation:', err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  if (!isOpen) return null;

  const toggleSelectPlayer = (player: Player) => {
    setErrorMsg('');
    const exists = selectedParticipants.some((p) => p.player_id === player.id);
    if (exists) {
      setSelectedParticipants(selectedParticipants.filter((p) => p.player_id !== player.id));
    } else {
      if (selectedParticipants.length >= 10) {
        setErrorMsg('В турнире должно быть ровно 10 игроков. Удалите одного из выбранных, чтобы добавить другого.');
        return;
      }
      setSelectedParticipants([
        ...selectedParticipants,
        {
          player_id: player.id,
          nickname: player.nickname,
          display_name: player.nickname,
        },
      ]);
    }
  };

  const updateDisplayName = (playerId: string, newDisplayName: string) => {
    setSelectedParticipants(
      selectedParticipants.map((p) =>
        p.player_id === playerId ? { ...p, display_name: newDisplayName } : p
      )
    );
  };

  const filteredPlayers = availablePlayers.filter(
    (p) =>
      p.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.phone && p.phone.includes(searchQuery)) ||
      (p.telegram_username && p.telegram_username.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim() || !date) {
      setErrorMsg('Укажите название и дату проведения турнира');
      return;
    }

    if (selectedParticipants.length !== 10) {
      setErrorMsg(`Для создания турнира требуется ровно 10 игроков (сейчас выбрано: ${selectedParticipants.length})`);
      return;
    }

    setSaving(true);
    try {
      const created = await api.createTournament({
        title,
        date: new Date(date).toISOString(),
        venue,
        stage,
        chief_judge_name: chiefJudgeName,
        notes,
        participants: selectedParticipants.map((p) => ({
          player_id: p.player_id,
          display_name: p.display_name,
        })),
      });

      onCreated(created);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка создания турнира');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-surface-1 border border-border-soft rounded-3xl max-w-2xl w-full p-5 sm:p-6 my-8 space-y-5 text-text-primary relative shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary p-2 rounded-full hover:bg-surface-hover cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h3 className="text-xl font-bold tracking-tight">Новый Личный Турнир (10 игроков)</h3>
          <p className="text-xs text-text-secondary mt-1">
            Создание турнира: 10 участников проведут 10 игр, каждый поучаствует в каждой игре.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-2xl flex items-center gap-2 text-danger text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          {/* Main info inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-text-secondary font-semibold mb-1">Название турнира *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Кубок Клуба #1"
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-text-secondary font-semibold mb-1">Дата и время начала *</label>
              <input
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent font-mono"
              />
            </div>

            <div>
              <label className="block text-text-secondary font-semibold mb-1">Локация</label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Зал #1"
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-text-secondary font-semibold mb-1">Стадия турнира</label>
              <input
                type="text"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                placeholder="Отборочный этап / Финал"
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-text-secondary font-semibold mb-1">Главный судья</label>
              <input
                type="text"
                value={chiefJudgeName}
                onChange={(e) => setChiefJudgeName(e.target.value)}
                placeholder="ФИО или никнейм главного судьи"
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-text-secondary font-semibold mb-1">Заметки / Описание</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Дополнительные заметки по регламенту..."
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent resize-none"
              />
            </div>
          </div>

          {/* Participant selection section */}
          <div className="space-y-3 pt-2 border-t border-border-soft">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-text-primary">Выбор 10 участников</h4>
                <p className="text-[11px] text-text-secondary">Выберите ровно 10 уникальных игроков из CRM</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${
                  selectedParticipants.length === 10
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-accent/10 text-accent border border-accent/30'
                }`}
              >
                {selectedParticipants.length} / 10 игроков
              </span>
            </div>

            {/* Search bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по никнейму или телефону..."
                className="w-full bg-surface-2 border border-border-soft rounded-xl pl-9 pr-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            {/* Selected players list with display_name editing */}
            {selectedParticipants.length > 0 && (
              <div className="space-y-2 bg-surface-2 p-3 rounded-2xl border border-border-soft max-h-48 overflow-y-auto">
                <span className="text-[11px] font-bold text-text-secondary block">Выбранный состав:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedParticipants.map((p, idx) => (
                    <div
                      key={p.player_id}
                      className="flex items-center justify-between gap-2 bg-surface-1 p-2 rounded-xl border border-border-soft"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={p.display_name}
                          onChange={(e) => updateDisplayName(p.player_id, e.target.value)}
                          placeholder={p.nickname}
                          className="w-full bg-transparent text-xs font-semibold text-text-primary focus:outline-none focus:border-accent rounded px-1"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSelectPlayer({ id: p.player_id } as Player)}
                        className="text-danger hover:bg-danger/10 p-1 rounded cursor-pointer shrink-0"
                        title="Удалить"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available players selection list */}
            <div className="max-h-40 overflow-y-auto space-y-1.5 border border-border-soft rounded-2xl p-2 bg-surface-2/50">
              {loadingPlayers ? (
                <div className="py-4 text-center text-text-muted text-xs">Загрузка игроков из CRM...</div>
              ) : filteredPlayers.length === 0 ? (
                <div className="py-4 text-center text-text-muted text-xs">Игроки не найдены</div>
              ) : (
                filteredPlayers.map((player) => {
                  const isSelected = selectedParticipants.some((p) => p.player_id === player.id);
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => toggleSelectPlayer(player)}
                      className={`w-full text-left p-2 rounded-xl flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-accent/15 border border-accent/40 text-accent font-bold'
                          : 'bg-surface-1 hover:bg-surface-hover text-text-primary border border-border-soft'
                      }`}
                    >
                      <div className="min-w-0 truncate">
                        <span className="text-xs font-bold truncate block">{player.nickname}</span>
                        {player.phone && (
                          <span className="text-[10px] text-text-muted font-mono block truncate">{player.phone}</span>
                        )}
                      </div>
                      <div
                        className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-accent border-accent text-white'
                            : 'border-border-soft text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Form submission actions */}
          <div className="flex items-center gap-3 pt-3 border-t border-border-soft">
            <button
              type="submit"
              disabled={saving || selectedParticipants.length !== 10}
              className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-accent/20 min-h-[44px]"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Создание турнира...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Создать и сгенерировать рассадку</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="bg-surface-2 hover:bg-surface-hover text-text-secondary font-bold px-5 rounded-2xl text-xs uppercase tracking-wider cursor-pointer min-h-[44px]"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
