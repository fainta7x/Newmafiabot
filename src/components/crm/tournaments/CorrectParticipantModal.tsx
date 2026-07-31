import React, { useState, useEffect } from 'react';
import { X, Search, UserCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { api, TournamentParticipant, Player } from '../../../lib/api';

interface CorrectParticipantModalProps {
  isOpen: boolean;
  tournamentId: string;
  participant: TournamentParticipant | null;
  allParticipants: TournamentParticipant[];
  onClose: () => void;
  onSuccess: () => void;
}

export const CorrectParticipantModal: React.FC<CorrectParticipantModalProps> = ({
  isOpen,
  tournamentId,
  participant,
  allParticipants,
  onClose,
  onSuccess,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && participant) {
      setLoading(true);
      setError(null);
      setSelectedPlayerId('');
      setSearchQuery('');
      api
        .getPlayers()
        .then((data) => {
          setPlayers(data || []);
        })
        .catch((err) => {
          setError(err.message || 'Ошибка загрузки игроков CRM');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, participant]);

  if (!isOpen || !participant) return null;

  // Exclude players who are already in this tournament (except the current participant's player_id)
  const existingPlayerIds = new Set(
    allParticipants
      .filter((p) => p.id !== participant.id)
      .map((p) => p.player_id)
  );

  const availablePlayers = players.filter((p) => !existingPlayerIds.has(p.id));

  const filteredPlayers = availablePlayers.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const nick = (p.nickname || '').toLowerCase();
    const name = (p.full_name || '').toLowerCase();
    const phone = (p.phone || '').toLowerCase();
    return nick.includes(q) || name.includes(q) || phone.includes(q);
  });

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  const handleSave = async () => {
    if (!selectedPlayerId) {
      setError('Выберите игрока из CRM');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.correctTournamentParticipant(tournamentId, participant.id, selectedPlayerId);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка исправления профиля участника');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-surface-1 border border-border-soft rounded-3xl max-w-md w-full p-6 space-y-4 text-text-primary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-soft pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-accent" />
            <h3 className="text-base font-bold">Исправить профиль участника</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1 rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-surface-2 p-3.5 rounded-2xl border border-border-soft space-y-1">
          <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
            Текущий слот №{participant.participant_number}
          </span>
          <p className="text-sm font-bold text-text-primary">{participant.display_name}</p>
          {participant.player_nickname && participant.player_nickname !== participant.display_name && (
            <p className="text-xs text-text-muted">Никнейм в CRM: {participant.player_nickname}</p>
          )}
        </div>

        {/* Confirmation note required by specs */}
        <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Профиль участника будет исправлен во всём турнире. Игры, протоколы и статистика сохранятся.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger font-semibold">
            {error}
          </div>
        )}

        {/* Player search & selector */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-text-secondary">
            Выберите правильный профиль из CRM:
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск игрока по нику или имени..."
              className="w-full bg-surface-2 border border-border-soft rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div className="max-h-44 overflow-y-auto space-y-1 pr-1 border border-border-soft rounded-2xl p-1.5 bg-surface-2">
            {loading ? (
              <div className="p-4 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span>Загрузка списка игроков...</span>
              </div>
            ) : filteredPlayers.length === 0 ? (
              <div className="p-3 text-center text-xs text-text-muted">Игроки не найдены</div>
            ) : (
              filteredPlayers.map((p) => {
                const isSelected = p.id === selectedPlayerId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(p.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-accent text-white font-bold shadow-sm'
                        : 'hover:bg-surface-1 text-text-primary font-medium'
                    }`}
                  >
                    <span className="truncate">
                      {p.nickname || p.full_name || 'Без имени'}
                    </span>
                    {isSelected && <UserCheck className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {selectedPlayer && (
          <div className="text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl">
            Выбран новый профиль: {selectedPlayer.nickname || selectedPlayer.full_name}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !selectedPlayerId}
            className={`flex-1 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer min-h-[44px] flex items-center justify-center gap-2 ${
              saving || !selectedPlayerId
                ? 'bg-surface-2 text-text-muted border border-border-soft cursor-not-allowed opacity-60'
                : 'bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20'
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Сохранение...</span>
              </>
            ) : (
              <span>Исправить профиль</span>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="bg-surface-2 hover:bg-surface-hover text-text-secondary font-bold px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer min-h-[44px]"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};
