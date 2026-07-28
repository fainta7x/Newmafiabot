import React from "react";
import { motion } from "motion/react";
import { AlertCircle, X } from "lucide-react";
import { Player } from "../../types.js";

interface PlayerModalProps {
  editingPlayer: Player | null;
  pNickname: string;
  setPNickname: (v: string) => void;
  pFullName: string;
  setPFullName: (v: string) => void;
  pUsername: string;
  setPUsername: (v: string) => void;
  pTag: string;
  setPTag: (v: string) => void;
  pElo: number;
  setPElo: (v: number) => void;
  pGamesPlayed: number;
  setPGamesPlayed: (v: number) => void;
  pGamesWon: number;
  setPGamesWon: (v: number) => void;
  pTokens: number;
  setPTokens: (v: number) => void;
  pError: string;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (v: string | null) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: (id: number) => void;
}

export const PlayerModal: React.FC<PlayerModalProps> = ({
  editingPlayer,
  pNickname,
  setPNickname,
  pFullName,
  setPFullName,
  pUsername,
  setPUsername,
  pTag,
  setPTag,
  pElo,
  setPElo,
  pGamesPlayed,
  setPGamesPlayed,
  pGamesWon,
  setPGamesWon,
  pTokens,
  setPTokens,
  pError,
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
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-neu-flat flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/10 border border-amber-500/30 flex items-center justify-center text-xl text-amber-400 shadow-neu-inset">
              🎭
            </div>
            <div>
              <h3 className="font-display font-extrabold text-white text-lg">
                {editingPlayer ? `Редактирование: ${editingPlayer.nickname}` : "Добавление игрока в базу"}
              </h3>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                {editingPlayer ? `ID: ${editingPlayer.id} • UserID: ${editingPlayer.user_id}` : "Регистрация нового профиля"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all shadow-neu-flat cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {pError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-2xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Никнейм игрока *</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                <input
                  type="text"
                  value={pNickname}
                  onChange={(e) => setPNickname(e.target.value)}
                  placeholder="Например: Алоэ"
                  className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">ФИО / Настоящее имя</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                <input
                  type="text"
                  value={pFullName}
                  onChange={(e) => setPFullName(e.target.value)}
                  placeholder="Александр Козлов"
                  className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Telegram username</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset flex items-center">
                <span className="pl-3 text-xs text-slate-500">@</span>
                <input
                  type="text"
                  value={pUsername}
                  onChange={(e) => setPUsername(e.target.value.replace(/^@/, ''))}
                  placeholder="aloe_maf"
                  className="w-full bg-transparent px-2 py-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Тег / Роль игрока в клубе</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                <select
                  value={pTag}
                  onChange={(e) => setPTag(e.target.value)}
                  className="w-full bg-transparent px-3 py-2 text-xs text-amber-400 font-bold focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-slate-900 text-slate-300">Без тега</option>
                  <option value="Регуляр" className="bg-slate-900 text-amber-400">Регуляр</option>
                  <option value="Новичок" className="bg-slate-900 text-sky-400">Новичок</option>
                  <option value="Судья" className="bg-slate-900 text-emerald-400">Судья</option>
                  <option value="VIP" className="bg-slate-900 text-purple-400">VIP</option>
                  <option value="Организатор" className="bg-slate-900 text-rose-400">Организатор</option>
                  <option value="Заблокирован" className="bg-slate-900 text-slate-500">Заблокирован</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Сыграно игр</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                <input
                  type="number"
                  value={pGamesPlayed}
                  onChange={(e) => setPGamesPlayed(parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Из них побед</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                <input
                  type="number"
                  value={pGamesWon}
                  onChange={(e) => setPGamesWon(parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Жетоны (Tokens)</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                <input
                  type="number"
                  value={pTokens}
                  onChange={(e) => setPTokens(parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent px-3 py-2 text-xs text-amber-400 font-mono font-bold focus:outline-none"
                />
              </div>
            </div>
          </div>

          {editingPlayer && (
            <div className="pt-2 border-t border-slate-800/60">
              {deleteConfirmId === "player" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onDelete(editingPlayer.id)}
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
                  onClick={() => setDeleteConfirmId("player")}
                  className="bg-rose-950/40 text-rose-400 border border-rose-900/30 text-xs font-bold px-3 py-2 rounded-xl w-full cursor-pointer hover:bg-rose-900/40"
                >
                  Удалить игрока из базы
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
            className="bg-slate-900 border border-slate-800 text-amber-400 hover:text-white text-xs font-bold px-5 py-2.5 rounded-2xl shadow-neu-flat cursor-pointer"
          >
            Сохранить профиль
          </button>
        </div>
      </motion.div>
    </div>
  );
};
