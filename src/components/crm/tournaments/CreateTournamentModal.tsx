import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Check, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { api, Player, Tournament } from '../../../lib/api.ts';
import { formatForDateTimeLocal } from '../../../lib/dateUtils.ts';
import {
  validateTournamentForm,
  hasTournamentErrors,
  TournamentValidationErrors,
} from '../../../lib/tournamentValidation.ts';

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
  const [gameCount, setGameCount] = useState(10);

  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<
    Array<{ player_id: string; nickname: string; display_name: string }>
  >([]);

  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<TournamentValidationErrors>({});
  const [globalError, setGlobalError] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const participantsSectionRef = useRef<HTMLDivElement>(null);
  const displayNameRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      loadPlayers();
      const now = new Date();
      now.setHours(19, 0, 0, 0);
      setDate(formatForDateTimeLocal(now));
      setGameCount(10);
      setErrors({});
      setGlobalError('');
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
    setErrors((prev) => ({ ...prev, participants: undefined }));
    setGlobalError('');
    const exists = selectedParticipants.some((p) => p.player_id === player.id);
    if (exists) {
      setSelectedParticipants(selectedParticipants.filter((p) => p.player_id !== player.id));
    } else {
      if (selectedParticipants.length >= 10) {
        setErrors((prev) => ({
          ...prev,
          participants: 'В турнире должно быть ровно 10 игроков. Удалите одного из выбранных, чтобы добавить другого.',
        }));
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
    if (errors.displayNames?.[playerId]) {
      setErrors((prev) => {
        const nextDisplayNames = { ...prev.displayNames };
        delete nextDisplayNames[playerId];
        return { ...prev, displayNames: nextDisplayNames };
      });
    }
  };

  const filteredPlayers = availablePlayers.filter(
    (p) =>
      p.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.phone && p.phone.includes(searchQuery)) ||
      (p.telegram_username && p.telegram_username.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const MAX_SEARCH_RESULTS = 30;
  const displayedPlayers = filteredPlayers.slice(0, MAX_SEARCH_RESULTS);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setGlobalError('');
    if (!Number.isInteger(gameCount) || gameCount < 1) {
      setGlobalError('Количество игр должно быть положительным целым числом.');
      return;
    }

    const valErrors = validateTournamentForm({
      title,
      date,
      participants: selectedParticipants,
    });

    if (hasTournamentErrors(valErrors)) {
      setErrors(valErrors);
      if (valErrors.title) {
        titleInputRef.current?.focus();
        titleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (valErrors.date) {
        dateInputRef.current?.focus();
        dateInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (valErrors.displayNames && Object.keys(valErrors.displayNames).length > 0) {
        const firstId = Object.keys(valErrors.displayNames)[0];
        displayNameRefs.current[firstId]?.focus();
        displayNameRefs.current[firstId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (valErrors.participants) {
        participantsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setSaving(true);
    try {
      const created = await api.createTournament({
        title: title.trim(),
        date: new Date(date).toISOString(),
        venue: venue.trim(),
        stage: stage.trim(),
        chief_judge_name: chiefJudgeName.trim(),
        notes: notes.trim(),
        game_count: gameCount,
        participants: selectedParticipants.map((p) => ({
          player_id: p.player_id,
          display_name: p.display_name.trim(),
        })),
      } as any);

      onCreated(created);
      onClose();
    } catch (err: any) {
      setGlobalError(err.message || 'Ошибка создания турнира');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-surface-1 border border-border-soft rounded-3xl max-w-2xl w-full flex flex-col max-h-[calc(100dvh-16px)] text-text-primary relative shadow-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border-soft shrink-0 flex items-center justify-between">
          <div>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight">Новый Личный Турнир (10 игроков)</h3>
            <p className="text-[11px] sm:text-xs text-text-secondary mt-0.5">
              10 участников · дистанция {gameCount > 0 ? gameCount : '—'} игр
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-2 rounded-full hover:bg-surface-hover cursor-pointer transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-5 text-xs">
          {globalError && (
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-2xl flex items-center gap-2 text-danger text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{globalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-text-secondary font-semibold mb-1">
                Название турнира <span className="text-danger">*</span>
              </label>
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
                }}
                placeholder="Кубок Клуба #1"
                className={`w-full bg-surface-2 border rounded-xl px-3 py-2.5 text-text-primary focus:outline-none ${
                  errors.title ? 'border-danger focus:border-danger' : 'border-border-soft focus:border-accent'
                }`}
              />
              {errors.title && <p className="text-[11px] text-danger mt-1 font-medium">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-text-secondary font-semibold mb-1">
                Дата и время начала <span className="text-danger">*</span>
              </label>
              <input
                ref={dateInputRef}
                type="datetime-local"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }));
                }}
                className={`w-full bg-surface-2 border rounded-xl px-3 py-2.5 text-text-primary focus:outline-none font-mono ${
                  errors.date ? 'border-danger focus:border-danger' : 'border-border-soft focus:border-accent'
                }`}
              />
              {errors.date && <p className="text-[11px] text-danger mt-1 font-medium">{errors.date}</p>}
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

            <div>
              <label className="block text-text-secondary font-semibold mb-1">Количество игр</label>
              <input
                type="number"
                min={1}
                step={1}
                value={gameCount || ''}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setGameCount(Number.isFinite(value) ? Math.trunc(value) : 0);
                  setGlobalError('');
                }}
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent font-mono"
              />
              <p className="mt-1 text-[10px] text-text-muted">Любое положительное целое число: 8, 10, 12 и т.д.</p>
            </div>

            <div>
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

          <div ref={participantsSectionRef} className="space-y-3 pt-2 border-t border-border-soft">
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

            {errors.participants && (
              <p className="text-[11px] text-danger font-semibold bg-danger/10 border border-danger/30 p-2 rounded-xl">
                {errors.participants}
              </p>
            )}

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

            {selectedParticipants.length > 0 && (
              <div className="space-y-2 bg-surface-2 p-3 rounded-2xl border border-border-soft">
                <span className="text-[11px] font-bold text-text-secondary block">Состав участников (10):</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedParticipants.map((p, idx) => {
                    const hasDisplayNameError = Boolean(errors.displayNames?.[p.player_id]);
                    return (
                      <div
                        key={p.player_id}
                        className={`flex items-center justify-between gap-2 bg-surface-1 p-2 rounded-xl border ${
                          hasDisplayNameError ? 'border-danger' : 'border-border-soft'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <input
                              ref={(el) => {
                                displayNameRefs.current[p.player_id] = el;
                              }}
                              type="text"
                              value={p.display_name}
                              onChange={(e) => updateDisplayName(p.player_id, e.target.value)}
                              placeholder={p.nickname}
                              className={`w-full bg-transparent text-xs font-semibold text-text-primary focus:outline-none rounded px-1 border ${
                                hasDisplayNameError
                                  ? 'border-danger bg-danger/10'
                                  : 'border-transparent focus:border-accent'
                              }`}
                            />
                            {hasDisplayNameError && (
                              <p className="text-[10px] text-danger font-medium mt-0.5">
                                {errors.displayNames?.[p.player_id]}
                              </p>
                            )}
                          </div>
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
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5 border border-border-soft rounded-2xl p-2 bg-surface-2/50">
              {loadingPlayers ? (
                <div className="py-4 text-center text-text-muted text-xs">Загрузка игроков из CRM...</div>
              ) : displayedPlayers.length === 0 ? (
                <div className="py-4 text-center text-text-muted text-xs">Игроки не найдены</div>
              ) : (
                <>
                  {displayedPlayers.map((player) => {
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
                  })}
                  {filteredPlayers.length > MAX_SEARCH_RESULTS && (
                    <p className="text-[11px] text-text-muted text-center py-1">
                      Показано первые 30 результатов из {filteredPlayers.length}. Уточните поисковый запрос.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </form>

        <div className="p-4 sm:p-5 border-t border-border-soft bg-surface-1 shrink-0 flex items-center justify-between gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-2 hover:bg-surface-hover text-text-secondary font-bold px-3 sm:px-5 py-2.5 rounded-2xl text-xs uppercase tracking-wider cursor-pointer min-h-[44px]"
          >
            Отмена
          </button>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono border ${
                selectedParticipants.length === 10
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-accent/10 text-accent border border-accent/30'
              }`}
            >
              {selectedParticipants.length} из 10
            </span>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-bold px-3 sm:px-5 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-accent/20 min-h-[44px]"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Создаём…</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Создать турнир</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
