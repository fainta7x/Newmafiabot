import React from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { ShopPurchase } from "../../types.js";

interface PurchaseModalProps {
  editingPurchase: ShopPurchase;
  purNickname: string;
  setPurNickname: (v: string) => void;
  purItemName: string;
  setPurItemName: (v: string) => void;
  purPrice: number;
  setPurPrice: (v: number) => void;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (v: string | null) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: (id: number) => void;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({
  editingPurchase,
  purNickname,
  setPurNickname,
  purItemName,
  setPurItemName,
  purPrice,
  setPurPrice,
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
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-neu-flat flex flex-col"
      >
        <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
          <h3 className="font-display font-extrabold text-white text-md uppercase">
            Редактировать покупку #{editingPurchase.id}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Никнейм покупателя</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <input
                type="text"
                value={purNickname}
                onChange={(e) => setPurNickname(e.target.value)}
                className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Название товара</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <input
                type="text"
                value={purItemName}
                onChange={(e) => setPurItemName(e.target.value)}
                className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Цена (Жетоны)</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <input
                type="number"
                value={purPrice}
                onChange={(e) => setPurPrice(parseInt(e.target.value) || 0)}
                className="w-full bg-transparent px-3 py-2 text-xs text-amber-400 font-mono font-bold focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            {deleteConfirmId === "purchase" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onDelete(Number(editingPurchase.id) || 0)}
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
                onClick={() => setDeleteConfirmId("purchase")}
                className="bg-rose-950/40 text-rose-400 border border-rose-900/30 text-xs font-bold px-3 py-2 rounded-xl w-full cursor-pointer hover:bg-rose-900/40"
              >
                Удалить транзакцию
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
