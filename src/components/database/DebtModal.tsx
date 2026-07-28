import React from "react";
import { motion } from "motion/react";
import { CreditCard, X } from "lucide-react";
import { Player } from "../../types.js";

interface DebtModalProps {
  editingDebtPlayer: Player;
  debtAmountInput: number;
  setDebtAmountInput: (v: number) => void;
  onClose: () => void;
  onSave: () => void;
}

export const DebtModal: React.FC<DebtModalProps> = ({
  editingDebtPlayer,
  debtAmountInput,
  setDebtAmountInput,
  onClose,
  onSave,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-neu-flat flex flex-col"
      >
        <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
          <h3 className="font-display font-extrabold text-white text-md uppercase tracking-wide flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-rose-400" />
            Корректировка долга
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 text-center">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Игрок</span>
            <span className="font-display font-extrabold text-white text-base">{editingDebtPlayer.nickname}</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Сумма долга (₽)</label>
            <div className="bg-slate-950 border border-rose-500/30 rounded-xl p-1 shadow-neu-inset">
              <input
                type="number"
                value={debtAmountInput}
                onChange={(e) => setDebtAmountInput(parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full bg-transparent px-3 py-2 text-base text-rose-400 font-mono font-extrabold focus:outline-none text-center"
              />
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              Укажите 0 для полного погашения долга
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-end gap-2 bg-slate-950/10">
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
            className="bg-rose-500 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-2xl shadow-neu-flat hover:bg-rose-400 cursor-pointer uppercase"
          >
            Сохранить
          </button>
        </div>
      </motion.div>
    </div>
  );
};
