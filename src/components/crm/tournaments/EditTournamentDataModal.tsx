import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api, Tournament } from '../../../lib/api.ts';
import { formatForDateTimeLocal } from '../../../lib/dateUtils.ts';

interface EditTournamentDataModalProps {
  isOpen: boolean;
  tournament: Tournament;
  onClose: () => void;
  onSaved: () => void;
}

export const EditTournamentDataModal: React.FC<EditTournamentDataModalProps> = ({
  isOpen,
  tournament,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [stage, setStage] = useState('');
  const [chiefJudgeName, setChiefJudgeName] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && tournament) {
      setTitle(tournament.title || '');
      setDate(formatForDateTimeLocal(tournament.date));
      setVenue(tournament.venue || '');
      setStage(tournament.stage || '');
      setChiefJudgeName(tournament.chief_judge_name || '');
      setNotes(tournament.notes || '');
      setErrorMsg('');
    }
  }, [isOpen, tournament]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim() || !date) {
      setErrorMsg('Укажите название и дату проведения турнира');
      return;
    }

    setSaving(true);
    try {
      await api.updateTournament(tournament.id, {
        title: title.trim(),
        date: new Date(date).toISOString(),
        venue: venue.trim() || null,
        stage: stage.trim() || null,
        chief_judge_name: chiefJudgeName.trim() || null,
        notes: notes.trim() || null,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка обновления данных турнира');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="keyboard-aware-modal tournament-keyboard-scope fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="keyboard-aware-panel bg-surface-1 border border-border-soft rounded-3xl max-w-lg w-full p-5 sm:p-6 my-8 space-y-5 text-text-primary relative shadow-2xl overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary p-2 rounded-full hover:bg-surface-hover cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h3 className="text-xl font-bold tracking-tight">Редактировать данные турнира</h3>
          <p className="text-xs text-text-secondary mt-1">
            Изменение основных параметров турнира
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-2xl text-danger text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="keyboard-aware-scroll space-y-4 text-xs" data-keyboard-scroll-container>
          <div>
            <label className="block text-text-secondary font-semibold mb-1">Название турнира *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="например, Весенний Кубок Клуба 2026"
              className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-text-secondary font-semibold mb-1">Дата и время начала *</label>
              <input
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-text-secondary font-semibold mb-1">Площадка / Локация</label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="например, Зал #1"
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-text-secondary font-semibold mb-1">Стадия турнира</label>
              <input
                type="text"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                placeholder="например, Отборочный этап"
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-text-secondary font-semibold mb-1">Главный судья</label>
              <input
                type="text"
                value={chiefJudgeName}
                onChange={(e) => setChiefJudgeName(e.target.value)}
                placeholder="Имя / ник главного судьи"
                className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-text-secondary font-semibold mb-1">Заметки / Описание</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Правила, примечания и регламент..."
              className="w-full bg-surface-2 border border-border-soft rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent resize-none"
            />
          </div>

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
              disabled={saving}
              className="bg-accent hover:bg-accent-hover text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-accent/20"
            >
              {saving ? 'Сохранение...' : 'Сохранить данные'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
