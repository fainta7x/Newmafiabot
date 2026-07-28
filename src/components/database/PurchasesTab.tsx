import React from "react";
import { Edit2 } from "lucide-react";
import { ShopPurchase } from "../../types.js";

interface PurchasesTabProps {
  purchases: ShopPurchase[];
  onEditPurchase: (purchase: ShopPurchase) => void;
}

export const PurchasesTab: React.FC<PurchasesTabProps> = ({ purchases, onEditPurchase }) => {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-950/20">
          <th className="px-6 py-4">Транзакция ID</th>
          <th className="px-6 py-4">Покупатель</th>
          <th className="px-6 py-4">Товар</th>
          <th className="px-6 py-4 font-mono">Цена (Tokens)</th>
          <th className="px-6 py-4">Дата заказа</th>
          <th className="px-6 py-4 text-right">Опции</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800/40">
        {purchases.map((p) => (
          <tr key={p.id} className="hover:bg-slate-950/15 transition-colors">
            <td className="px-6 py-4 font-mono text-xs text-slate-500">{p.id}</td>
            <td className="px-6 py-4 font-display font-bold text-slate-200">{p.nickname}</td>
            <td className="px-6 py-4 text-xs text-amber-100 font-semibold">{p.item_name}</td>
            <td className="px-6 py-4 font-mono text-xs text-amber-400 font-bold">
              {p.price} 🪙
            </td>
            <td className="px-6 py-4 font-mono text-xs text-slate-400">{p.timestamp}</td>
            <td className="px-6 py-4 text-right">
              <button
                onClick={() => onEditPurchase(p)}
                className="bg-slate-950/60 p-2 border border-slate-800 hover:border-amber-500/30 text-slate-400 hover:text-amber-400 rounded-xl transition-all shadow-neu-flat-sm hover:shadow-neu-inset cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </td>
          </tr>
        ))}

        {purchases.length === 0 && (
          <tr>
            <td colSpan={6} className="py-12 text-center text-slate-500 font-mono text-xs">
              Записей покупок в магазине нет.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};
