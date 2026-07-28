import React from "react";
import { motion } from "motion/react";
import { CalendarRange, X, Shield, Award, Sparkles } from "lucide-react";
import { GameEvening, EveningFormat } from "../../types.js";

interface EveningModalProps {
  editingEvening: GameEvening | null;
  eveDate: string;
  setEveDate: (v: string) => void;
  eveTitle: string;
  setEveTitle: (v: string) => void;
  eveStatus: "Запланирован" | "Идет сейчас" | "Завершен";
  setEveStatus: (v: "Запланирован" | "Идет сейчас" | "Завершен") => void;
  eveLocation: string;
  setEveLocation: (v: string) => void;
  eveNotes: string;
  setEveNotes: (v: string) => void;
  eveFormat?: EveningFormat;
  setEveFormat?: (v: EveningFormat) => void;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (v: string | null) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: (evening: GameEvening) => void;
}

export const EveningModal: React.FC<EveningModalProps> = ({
  editingEvening,
  eveDate,
  setEveDate,
  eveTitle,
  setEveTitle,
  eveStatus,
  setEveStatus,
  eveLocation,
  setEveLocation,
  eveNotes,
  setEveNotes,
  eveFormat = "STANDARD",
  setEveFormat,
  deleteConfirmId,
  setDeleteConfirmId,
  onClose,
  onSave,
  onDelete,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-neu-flat flex flex-col max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
          <h3 className="font-display font-extrabold text-white text-md uppercase tracking-wide flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-amber-400" />
            {editingEvening ? "Редактировать вечер" : "Создать игровой вечер"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Format Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Формат / Экосистема вечера</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setEveFormat && setEveFormat("NOVICE")}
                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  eveFormat === "NOVICE"
                    ? "bg-sky-950/80 border-sky-500 text-sky-300 shadow-neu-flat"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span className="text-[11px] font-bold">Новичковый</span>
                <span className="text-[9px] text-slate-500 font-mono">Обучающий</span>
              </button>

              <button
                type="button"
                onClick={() => setEveFormat && setEveFormat("STANDARD")}
                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  eveFormat === "STANDARD"
                    ? "bg-amber-950/80 border-amber-500 text-amber-300 shadow-neu-flat"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Shield className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] font-bold">Классический</span>
                <span className="text-[9px] text-slate-500 font-mono">Клубный вечер</span>
              </button>

              <button
                type="button"
                onClick={() => setEveFormat && setEveFormat("TOURNAMENT")}
                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  eveFormat === "TOURNAMENT"
                    ? "bg-rose-950/80 border-rose-500 text-rose-300 shadow-neu-flat"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Award className="w-4 h-4 text-rose-400" />
                <span className="text-[11px] font-bold">Турнирный</span>
                <span className="text-[9px] text-slate-500 font-mono">Кубок / Соревновательный</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Дата вечера (ДД.ММ.ГГГГ) *</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <input
                type="text"
                value={eveDate}
                onChange={(e) => setEveDate(e.target.value)}
                placeholder="27.07.2026"
                className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Название вечера *</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <input
                type="text"
                value={eveTitle}
                onChange={(e) => setEveTitle(e.target.value)}
                placeholder="Пятничный мафия-вечер #42"
                className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Статус вечера</label>
            <div className="grid grid-cols-3 gap-2 bg-slate-950 border border-slate-800 p-1 rounded-2xl shadow-neu-inset">
              {(["Запланирован", "Идет сейчас", "Завершен"] as const).map((st) => {
                const isSel = eveStatus === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setEveStatus(st)}
                    className={`py-2 text-[10px] font-bold rounded-xl transition-all cursor-pointer ${
                      isSel
                        ? "bg-amber-500 text-slate-950 shadow-neu-flat font-black"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Локация / Зал</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <input
                type="text"
                value={eveLocation}
                onChange={(e) => setEveLocation(e.target.value)}
                placeholder="Зал #1 (Главный)"
                className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Заметки / Расписание</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <textarea
                value={eveNotes}
                onChange={(e) => setEveNotes(e.target.value)}
                rows={2}
                placeholder="Сбор в 19:00, старт первой игры в 19:30..."
                className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none resize-none"
              />
            </div>
          </div>

          {editingEvening && (
            <div className="pt-2 border-t border-slate-800/60">
              {deleteConfirmId === "evening" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onDelete(editingEvening)}
                    className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-2 rounded-xl uppercase cursor-pointer flex-1"
                  >
                    Подтвердить удаление
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="bg-slate-800 text-slate-300 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId("evening")}
                  className="bg-rose-950/40 text-rose-400 border border-rose-900/30 text-xs font-bold px-3 py-2 rounded-xl w-full cursor-pointer hover:bg-rose-900/40"
                >
                  Удалить вечер из базы
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/10">
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold px-4 py-2.5 rounded-2xl shadow-neu-flat cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onSave}
            className="bg-slate-900 border border-slate-800 text-amber-400 hover:text-white text-xs font-bold px-5 py-2.5 rounded-2xl shadow-neu-flat cursor-pointer uppercase tracking-wider"
          >
            Сохранить
          </button>
        </div>
      </motion.div>
    </div>
  );
};
