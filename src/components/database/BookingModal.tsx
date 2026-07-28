import React from "react";
import { motion } from "motion/react";
import { UserCheck, X } from "lucide-react";
import { Booking, Player } from "../../types.js";

interface BookingModalProps {
  editingBooking: Booking | null;
  players: Player[];
  bSelectedUserId: number;
  setBSelectedUserId: (v: number) => void;
  bNickname: string;
  setBNickname: (v: string) => void;
  bDate: string;
  setBDate: (v: string) => void;
  bStatus: "Вовремя" | "Позже" | "Отмена";
  setBStatus: (v: "Вовремя" | "Позже" | "Отмена") => void;
  bPayment: number;
  setBPayment: (v: number) => void;
  bPaymentMode: "preset_100" | "preset_200" | "preset_300" | "preset_400" | "manual";
  setBPaymentMode: (v: "preset_100" | "preset_200" | "preset_300" | "preset_400" | "manual") => void;
  bPaymentStatus: "Оплачено" | "В долг" | "Частично";
  setBPaymentStatus: (v: "Оплачено" | "В долг" | "Частично") => void;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (v: string | null) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: (booking: Booking) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  editingBooking,
  players,
  bSelectedUserId,
  setBSelectedUserId,
  bNickname,
  setBNickname,
  bDate,
  setBDate,
  bStatus,
  setBStatus,
  bPayment,
  setBPayment,
  bPaymentMode,
  setBPaymentMode,
  bPaymentStatus,
  setBPaymentStatus,
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
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-neu-flat flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
          <h3 className="font-display font-extrabold text-white text-md uppercase tracking-wide flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-amber-400" />
            {editingBooking ? "Редактировать запись игрока" : "Записать игрока на вечер"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Player selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
              1. Выбор игрока из базы клуба *
            </label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-1 shadow-neu-inset">
              <select
                value={bSelectedUserId}
                onChange={(e) => {
                  const uid = parseInt(e.target.value) || 0;
                  setBSelectedUserId(uid);
                  if (uid > 0) {
                    const p = players.find((pl) => pl.user_id === uid);
                    if (p) setBNickname(p.nickname);
                  }
                }}
                className="w-full bg-slate-950 text-xs text-slate-200 p-2 rounded-lg focus:outline-none cursor-pointer"
              >
                <option value={0}>-- Выберите игрока из списка --</option>
                {players.map((p) => (
                  <option key={p.id} value={p.user_id}>
                    {p.nickname} {p.full_name ? `(${p.full_name})` : ""} {p.username ? `@${p.username}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-1">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">Никнейм игрока в записи:</span>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                <input
                  type="text"
                  value={bNickname}
                  onChange={(e) => {
                    setBNickname(e.target.value);
                    const p = players.find((pl) => pl.nickname.toLowerCase() === e.target.value.toLowerCase());
                    if (p) setBSelectedUserId(p.user_id);
                  }}
                  placeholder="Или введите имя гостя..."
                  className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Date of Evening */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">2. Дата вечера (ДД.ММ.ГГГГ) *</label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
              <input
                type="text"
                value={bDate}
                onChange={(e) => setBDate(e.target.value)}
                className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">3. Статус прибытия</label>
            <div className="grid grid-cols-3 gap-2 bg-slate-950 border border-slate-800 p-1 rounded-2xl shadow-neu-inset">
              {(["Вовремя", "Позже", "Отмена"] as const).map((status) => {
                const isSel = bStatus === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setBStatus(status)}
                    className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      isSel ? "bg-amber-500 text-slate-950 shadow-neu-flat" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment section */}
          <div className="space-y-2 pt-2 border-t border-slate-800/60">
            <div className="flex justify-between items-center">
              <label className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                4. Оплата за вечер от игрока
              </label>
              <span className="text-emerald-400 font-mono font-bold text-sm bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg">
                {bPayment} ₽
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5 bg-slate-950 border border-slate-800 p-1 rounded-2xl shadow-neu-inset">
              {[100, 200, 300, 400].map((amt) => {
                const isSel = bPaymentMode === `preset_${amt}` && bPayment === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setBPayment(amt);
                      setBPaymentMode(`preset_${amt}` as any);
                    }}
                    className={`py-2 text-xs font-bold font-mono rounded-xl transition-all cursor-pointer ${
                      isSel
                        ? "bg-emerald-500 text-slate-950 shadow-neu-flat font-black"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    {amt} ₽
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setBPaymentMode("manual")}
                className={`py-2 text-[10px] font-bold uppercase rounded-xl transition-all cursor-pointer ${
                  bPaymentMode === "manual"
                    ? "bg-amber-500 text-slate-950 shadow-neu-flat"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                Вручную
              </button>
            </div>

            {bPaymentMode === "manual" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-950 border border-amber-500/30 rounded-xl p-1 shadow-neu-inset flex items-center gap-2"
              >
                <span className="pl-3 text-xs text-slate-400 font-bold whitespace-nowrap">Сумма (₽):</span>
                <input
                  type="number"
                  value={bPayment}
                  onChange={(e) => setBPayment(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full bg-transparent px-2 py-1 text-sm text-amber-400 font-mono font-bold focus:outline-none"
                />
              </motion.div>
            )}

            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Статус оплаты:</span>
              <div className="grid grid-cols-3 gap-2 bg-slate-950 border border-slate-800 p-1 rounded-2xl shadow-neu-inset">
                {(["Оплачено", "В долг", "Частично"] as const).map((st) => {
                  const isSel = bPaymentStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setBPaymentStatus(st)}
                      className={`py-1.5 text-[10px] font-bold rounded-xl transition-all cursor-pointer ${
                        isSel
                          ? st === "Оплачено"
                            ? "bg-emerald-500 text-slate-950 shadow-neu-flat"
                            : st === "В долг"
                            ? "bg-rose-500 text-white shadow-neu-flat"
                            : "bg-amber-500 text-slate-950 shadow-neu-flat"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {editingBooking && (
            <div className="pt-2 border-t border-slate-800/60">
              {deleteConfirmId === "booking" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onDelete(editingBooking)}
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
                  onClick={() => setDeleteConfirmId("booking")}
                  className="bg-rose-950/40 text-rose-400 border border-rose-900/30 text-xs font-bold px-3 py-2 rounded-xl w-full cursor-pointer hover:bg-rose-900/40"
                >
                  Удалить запись из вечера
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
