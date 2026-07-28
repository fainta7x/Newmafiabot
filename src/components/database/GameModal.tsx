import React from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { Game } from "../../types.js";

interface GameModalProps {
  editingGame: Game;
  gDate: string;
  setGDate: (v: string) => void;
  gWinner: "Красные" | "Чёрные";
  setGWinner: (v: "Красные" | "Чёрные") => void;
  gJudge: string;
  setGJudge: (v: string) => void;
  gProtocol: string;
  setGProtocol: (v: string) => void;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (v: string | null) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: (id: number) => void;
}

export const GameModal: React.FC<GameModalProps> = ({
  editingGame,
  gDate,
  setGDate,
  gWinner,
  setGWinner,
  gJudge,
  setGJudge,
  gProtocol,
  setGProtocol,
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
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-neu-flat flex flex-col"
      >
        <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
          <h3 className="font-display font-extrabold text-white text-md uppercase">
            Редактирование протокола игры #{editingGame.global_game_number}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Дата игры</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                <input
                  type="text"
                  value={gDate}
                  onChange={(e) => setGDate(e.target.value)}
                  className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Победители</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-950 border border-slate-800 p-1 rounded-2xl shadow-neu-inset">
                {(["Красные", "Чёрные"] as const).map((win) => {
                  const isSel = gWinner === win;
                  return (
                    <button
                      key={win}
                      type="button"
                      onClick={() => setGWinner(win)}
                      className={`py-1.5 text-xs font-bold rounded-xl cursor-pointer ${
                        isSel ? "bg-amber-500 text-slate-950 shadow-neu-flat" : "text-slate-400"
                      }`}
                    >
                      {win}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Судья игры</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <input
                type="text"
                value={gJudge}
                onChange={(e) => setGJudge(e.target.value)}
                className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Текст протокола</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <textarea
                value={gProtocol}
                onChange={(e) => setGProtocol(e.target.value)}
                rows={3}
                className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none resize-none"
              />
            </div>
          </div>

          <div className="pt-2">
            {deleteConfirmId === "game" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onDelete(editingGame.id)}
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
                onClick={() => setDeleteConfirmId("game")}
                className="bg-rose-950/40 text-rose-400 border border-rose-900/30 text-xs font-bold px-3 py-2 rounded-xl w-full cursor-pointer hover:bg-rose-900/40"
              >
                Удалить протокол из истории
              </button>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/10">
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold px-4 py-2.5 rounded-2xl cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onSave}
            className="bg-slate-900 border border-slate-800 text-amber-400 hover:text-white text-xs font-bold px-5 py-2.5 rounded-2xl shadow-neu-flat cursor-pointer"
          >
            Сохранить
          </button>
        </div>
      </motion.div>
    </div>
  );
};
