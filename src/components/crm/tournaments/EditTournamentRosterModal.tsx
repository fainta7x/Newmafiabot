import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, Search, AlertTriangle } from 'lucide-react';
import { api, Player, Tournament, TournamentParticipant } from '../../../lib/api.ts';

interface EditTournamentRosterModalProps {
  isOpen: boolean;
  tournament: Tournament;
  onClose: () => void;
  onSaved: () => void;
}

export const EditTournamentRosterModal: React.FC<EditTournamentRosterModalProps> = ({
  isOpen,
  tournament,
  onClose,
  onSaved,
}) => {
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<
    Array<{ player_id: string; nickname: string; display_name: string }>
  >([]);

  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showConfirmWarning, setShowConfirmWarning] = useState(false);

  useEffect(() => {
    if (isOpen && tournament) {
      loadData();
      setErrorMsg('');
      setShowConfirmWarning(false);
    }
  }, [isOpen, tournament]);

  const loadData = async () => {
    setLoadingPlayers(true);
    try {
      const players = await api.getPlayers();
      setAvailablePlayers(players);

      if (tournament.participants && tournament.participants.length > 0) {
        setSelectedParticipants(
          tournament.participants.map((p: TournamentParticipant) => ({
            player_id: p.player_id,
            nickname: p.player_nickname || p.display_name,
            display_name: p.display_name,
          }))
        );
      }
    } catch (err: any) {
      console.error('Failed to load players:', err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelectPlayer = (player: Player) => {
    setErrorMsg('');
    const exists = selectedParticipants.some((p) => p.player_id === player.id);
    if (exists) {
      setSelectedParticipants(selectedParticipants.filter((p) => p.player_id !== player.id));
    } else {
      if (selectedParticipants.length >= 10) {
        setErrorMsg('В турнире должно быть ровно 10 игроков. Сначала удалите одного из выбранных.');
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

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (selectedParticipants.length !== 10) {
      setErrorMsg(`Выбрано ${selectedParticipants.length} из 10 участников. Требуется ровно 10 игроков.`);
      return;
    }

    // Show warning prompt before replacing roster & seating
    setShowConfirmWarning(true);
  };

  const executeSave = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      await api.updateTournamentParticipants(
        tournament.id,
        selectedParticipants.map((p) => ({
          player_id: p.player_id,
          display_name: p.display_name,
        }))
      );

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка обновления состава участников');
      setShowConfirmWarning(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-4">
      <div className="max-h-[100dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border border-border-soft bg-surface-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-text-primary relative shadow-2xl sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-3xl sm:p-6 sm:pb-6 space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary p-2 rounded-full hover:bg-surface-hover cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h3 className="text-xl font-bold tracking-tight">Изменение состава участников (10 игроков)</h3>
          <p className="text-xs text-text-secondary mt-1">
            Выберите 10 участников и задайте их турнирные никнеймы.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-2xl text-danger text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {showConfirmWarning ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 space-y-4 text-xs">
            <div className="flex items-start gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Подтверждение смены состава</h4>
                <p className="mt-1 text-text-secondary leading-relaxed">
                  При изменении состава турнира вся текущая рассадка 10 игр будет пересоздана случайным образом, а выбранные ранее роли будут сброшены.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmWarning(false)}
                className="bg-surface-2 hover:bg-surface-hover text-text-secondary font-bold px-4 py-2.5 rounded-xl uppercase tracking-wider cursor-pointer"
              >
                Вернуться
              </button>
              <button
                type="button"
                onClick={executeSave}
                disabled={saving}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-5 py-2.5 rounded-xl uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-600/20"
              >
                {saving ? 'Сохранение...' : 'Подтвердить и пересоздать'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInitialSubmit} className="space-y-4">
            {/* Selected 10 players list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-text-primary">
                  Выбранные участники ({selectedParticipants.length}/10)
                </span>
                <span className="text-[11px] text-text-muted">Требуется ровно 10</span>
              </div>

              {selectedParticipants.length === 0 ? (
                <div className="p-4 bg-surface-2 border border-dashed border-border-soft rounded-2xl text-center text-xs text-text-muted">
                  Участники не выбраны. Выберите 10 игроков из списка ниже.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedParticipants.map((p, idx) => (
                    <div
                      key={p.player_id}
                      className="bg-surface-2 border border-border-soft p-2.5 rounded-2xl flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-[10px] font-bold inline-flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={p.display_name}
                            onChange={(e) => updateDisplayName(p.player_id, e.target.value)}
                            className="w-full bg-surface-1 border border-border-soft rounded px-2 py-0.5 text-xs text-text-primary font-bold focus:outline-none focus:border-accent"
                            placeholder="Никнейм в турнире"
                          />
                          {p.nickname !== p.display_name && (
                            <span className="text-[10px] text-text-muted block truncate mt-0.5">
                              Базовый: {p.nickname}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleSelectPlayer({ id: p.player_id } as Player)}
                        className="text-text-muted hover:text-danger p-1 cursor-pointer shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available Players Selection Grid */}
            <div className="space-y-2 pt-2 border-t border-border-soft">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-bold text-text-primary">Выбор игроков из CRM</span>
                <div className="relative w-full sm:w-48">
                  <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск игрока..."
                    className="w-full bg-surface-2 border border-border-soft rounded-xl pl-8 pr-3 py-1.5 text-xs text-text-primary focus:outline-none"
                  />
                </div>
              </div>

              {loadingPlayers ? (
                <div className="py-8 text-center text-xs text-text-muted">Загрузка базы игроков...</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {filteredPlayers.map((player) => {
                    const isSelected = selectedParticipants.some((p) => p.player_id === player.id);
                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => toggleSelectPlayer(player)}
                        className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-accent/10 border-accent text-accent font-bold'
                            : 'bg-surface-2 border-border-soft text-text-primary hover:border-accent/50'
                        }`}
                      >
                        <span className="text-xs truncate">{player.nickname}</span>
                        {isSelected ? <Check className="w-4 h-4 text-accent shrink-0" /> : <UserPlus className="w-4 h-4 text-text-muted shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-border-soft">
              <button
                type="button"
                onClick={onClose}
                className="bg-surface-2 hover:bg-surface-hover text-text-secondary font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={selectedParticipants.length !== 10}
                className="bg-accent hover:bg-accent-hover text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-accent/20"
              >
                Сохранить состав (10/10)
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
