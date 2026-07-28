import React, { useState } from "react";
import { motion } from "motion/react";
import {
  X, CheckCircle2, AlertCircle, UserPlus, Search,
  DollarSign, Wallet
} from "lucide-react";
import { GameEvening, Booking, Game, Player } from "../../types.js";

interface EveningLedgerModalProps {
  evening: GameEvening;
  bookings: Booking[];
  games: Game[];
  players: Player[];
  onClose: () => void;
  onUpdateBooking: (bookingData: {
    oldNickname: string;
    oldDate: string;
    nickname: string;
    date: string;
    status: "Вовремя" | "Позже" | "Отмена";
    payment: number;
    payment_status: "Оплачено" | "В долг" | "Частично";
  }) => Promise<void>;
  onAddBooking: (nickname: string, date: string, payment: number, paymentStatus: "Оплачено" | "В долг" | "Частично") => Promise<void>;
  onSettleEveningDebts: (eveningDate: string, debtMap: { [nickname: string]: number }) => Promise<void>;
  onAddNewPlayer: (nickname: string, fullName: string) => Promise<Player | null>;
}

export const EveningLedgerModal: React.FC<EveningLedgerModalProps> = ({
  evening,
  bookings,
  games,
  players,
  onClose,
  onUpdateBooking,
  onAddBooking,
  onSettleEveningDebts,
  onAddNewPlayer
}) => {
  // Tariff mode: 'FLAT_400' or 'PER_GAME_100' or 'CUSTOM'
  const [tariffMode, setTariffMode] = useState<"FLAT_400" | "PER_GAME_100">("FLAT_400");
  const [perGameRate] = useState<number>(100);
  const [flatRate] = useState<number>(400);

  // Search & add player state
  const [playerSearch, setPlayerSearch] = useState("");
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newGuestNick, setNewGuestNick] = useState("");
  const [syncingDebts, setSyncingDebts] = useState(false);
  const [actionSuccessText, setActionSuccessText] = useState<string | null>(null);

  // Filter games played on this evening's date
  const eveningGames = games.filter((g) => g.game_date === evening.date);

  // Calculate participation per player from game protocols
  const playerGameCounts: { [nicknameLower: string]: number } = {};
  eveningGames.forEach((g) => {
    (g.slots || []).forEach((slot) => {
      if (slot.nickname) {
        const key = slot.nickname.trim().toLowerCase();
        playerGameCounts[key] = (playerGameCounts[key] || 0) + 1;
      }
    });
  });

  // Get list of booked players on this evening date
  const eveningBookings = bookings.filter((b) => b.date === evening.date);

  // Aggregate set of all active players at the evening (booked OR actually played)
  const allParticipantNicks = Array.from(
    new Set([
      ...eveningBookings.map((b) => b.nickname.trim().toLowerCase()),
      ...Object.keys(playerGameCounts),
    ])
  );

  // Combine data for ledger
  const participantList = allParticipantNicks.map((nickLower) => {
    const booking = eveningBookings.find((b) => b.nickname.trim().toLowerCase() === nickLower);
    const clubPlayer = players.find((p) => p.nickname.trim().toLowerCase() === nickLower);
    const gamesPlayed = playerGameCounts[nickLower] || 0;
    const displayName = clubPlayer?.nickname || booking?.nickname || nickLower;

    // Calculate recommended price
    let calculatedFee = flatRate;
    if (tariffMode === "PER_GAME_100") {
      calculatedFee = gamesPlayed * perGameRate;
    }

    const currentPayment = booking?.payment !== undefined ? booking.payment : calculatedFee;
    const currentPaymentStatus = booking?.payment_status || "Оплачено";

    return {
      nickLower,
      displayName,
      full_name: clubPlayer?.full_name || "",
      clubPlayer,
      booking,
      gamesPlayed,
      calculatedFee,
      currentPayment,
      currentPaymentStatus,
    };
  });

  // Total summary calculations
  const totalCollected = participantList.reduce((sum, p) => {
    if (p.currentPaymentStatus === "Оплачено") return sum + p.currentPayment;
    if (p.currentPaymentStatus === "Частично") return sum + p.currentPayment;
    return sum;
  }, 0);

  const totalOutstandingDebt = participantList.reduce((sum, p) => {
    if (p.currentPaymentStatus === "В долг") return sum + p.calculatedFee;
    if (p.currentPaymentStatus === "Частично") return sum + Math.max(0, p.calculatedFee - p.currentPayment);
    return sum;
  }, 0);

  const triggerSuccess = (msg: string) => {
    setActionSuccessText(msg);
    setTimeout(() => setActionSuccessText(null), 3000);
  };

  // Quick action: set payment status
  const handleSetPlayerPayment = async (
    nick: string,
    amount: number,
    status: "Оплачено" | "В долг" | "Частично"
  ) => {
    const existing = eveningBookings.find((b) => b.nickname.toLowerCase() === nick.toLowerCase());
    if (existing) {
      await onUpdateBooking({
        oldNickname: existing.nickname,
        oldDate: existing.date,
        nickname: existing.nickname,
        date: existing.date,
        status: (existing.status === "Не пришел" ? "Отмена" : existing.status) as "Вовремя" | "Позже" | "Отмена",
        payment: amount,
        payment_status: status,
      });
    } else {
      await onAddBooking(nick, evening.date, amount, status);
    }
    triggerSuccess(`Обновлена оплата для ${nick}`);
  };

  // Quick action: add player from search
  const handleAddWalkInPlayer = async (p: Player) => {
    await onAddBooking(p.nickname, evening.date, tariffMode === "FLAT_400" ? flatRate : 0, "Оплачено");
    setPlayerSearch("");
    setShowAddMenu(false);
    triggerSuccess(`Игрок ${p.nickname} добавлен на вечер`);
  };

  // Create new guest
  const handleCreateAndAddGuest = async () => {
    if (!newGuestNick.trim()) return;
    const created = await onAddNewPlayer(newGuestNick.trim(), "Гость вечера");
    if (created) {
      await onAddBooking(created.nickname, evening.date, flatRate, "Оплачено");
      setNewGuestNick("");
      setShowAddMenu(false);
      triggerSuccess(`Новый гость ${created.nickname} зарегистирован и добавлен!`);
    }
  };

  // Batch sync debts to player accounts
  const handleSyncDebts = async () => {
    setSyncingDebts(true);
    const debtMap: { [nick: string]: number } = {};
    participantList.forEach((p) => {
      if (p.currentPaymentStatus === "В долг") {
        debtMap[p.displayName] = p.calculatedFee;
      } else if (p.currentPaymentStatus === "Частично") {
        const remaining = Math.max(0, p.calculatedFee - p.currentPayment);
        if (remaining > 0) debtMap[p.displayName] = remaining;
      }
    });

    await onSettleEveningDebts(evening.date, debtMap);
    setSyncingDebts(false);
    triggerSuccess("Все неопплаченные суммы успешно списаны в долги игроков!");
  };

  // Search candidates
  const candidatePlayers = players.filter(
    (p) =>
      !allParticipantNicks.includes(p.nickname.toLowerCase()) &&
      (p.nickname.toLowerCase().includes(playerSearch.toLowerCase()) ||
        p.full_name.toLowerCase().includes(playerSearch.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-neu-flat flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-xl font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20">
                {evening.date}
              </span>
              <span className="text-xs text-slate-400 uppercase font-mono font-bold tracking-wider">
                Диспетчер оплат & Посещаемости
              </span>
            </div>
            <h2 className="text-xl font-display font-extrabold text-white mt-1">
              {evening.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Operational Metrics Bar */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono uppercase block">Присутствовало</span>
            <span className="text-lg font-bold text-white font-mono">
              {participantList.length} <span className="text-xs text-slate-400 font-normal">чел.</span>
            </span>
          </div>

          <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono uppercase block">Игр за вечер</span>
            <span className="text-lg font-bold text-amber-400 font-mono">
              {eveningGames.length} <span className="text-xs text-slate-400 font-normal">протоколов</span>
            </span>
          </div>

          <div className="bg-emerald-950/30 p-3 rounded-2xl border border-emerald-500/30">
            <span className="text-[10px] text-emerald-400 font-mono uppercase block">Собрано Кассы</span>
            <span className="text-lg font-bold text-emerald-400 font-mono">{totalCollected} ₽</span>
          </div>

          <div className="bg-rose-950/30 p-3 rounded-2xl border border-rose-500/30">
            <span className="text-[10px] text-rose-400 font-mono uppercase block">Неоплаченные Долги</span>
            <span className="text-lg font-bold text-rose-400 font-mono">{totalOutstandingDebt} ₽</span>
          </div>
        </div>

        {/* Success toast notification */}
        {actionSuccessText && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-2 text-xs font-mono font-bold text-emerald-400 text-center animate-pulse">
            ✨ {actionSuccessText}
          </div>
        )}

        {/* Toolbar: Tariff Switcher & Add Player Button */}
        <div className="p-4 bg-slate-900 border-b border-slate-800/60 flex flex-wrap justify-between items-center gap-3">
          {/* Tariff mode */}
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono uppercase px-2 font-bold">Тариф вечера:</span>
            <button
              onClick={() => setTariffMode("FLAT_400")}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tariffMode === "FLAT_400"
                  ? "bg-amber-500 text-slate-950 shadow-neu-flat"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Фиксированный ({flatRate} ₽/вечер)
            </button>
            <button
              onClick={() => setTariffMode("PER_GAME_100")}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tariffMode === "PER_GAME_100"
                  ? "bg-amber-500 text-slate-950 shadow-neu-flat"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              За игру ({perGameRate} ₽/игра)
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2 px-3.5 rounded-xl shadow-neu-flat-amber flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Добавить игрока на вечер
            </button>

            {totalOutstandingDebt > 0 && (
              <button
                onClick={handleSyncDebts}
                disabled={syncingDebts}
                className="bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-bold text-xs py-2 px-3.5 rounded-xl shadow-neu-flat flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Wallet className="w-4 h-4 text-rose-400" />
                {syncingDebts ? "Запись долгов..." : "Записать долги в профили"}
              </button>
            )}
          </div>
        </div>

        {/* Add Player Drawer / Modal Overlay */}
        {showAddMenu && (
          <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300 uppercase font-mono">
                Поиск игрока в базе или регистрация гостя
              </span>
              <button onClick={() => setShowAddMenu(false)} className="text-slate-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Existing Player Search */}
              <div className="space-y-2">
                <label className="text-[10px] text-slate-400 uppercase font-mono block">Из базы клуба:</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Поиск по никнейму или имени..."
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {playerSearch && candidatePlayers.length > 0 && (
                  <div className="max-h-36 overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800/60">
                    {candidatePlayers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleAddWalkInPlayer(p)}
                        className="w-full px-3 py-2 text-left hover:bg-amber-500/10 flex justify-between items-center cursor-pointer text-xs"
                      >
                        <span className="font-bold text-white">{p.nickname}</span>
                        <span className="text-[10px] text-slate-400">{p.full_name || "Без имени"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Guest Creation */}
              <div className="space-y-2 border-l border-slate-800/80 pl-3">
                <label className="text-[10px] text-slate-400 uppercase font-mono block">Быстрый новый гость:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Никнейм нового гостя..."
                    value={newGuestNick}
                    onChange={(e) => setNewGuestNick(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={handleCreateAndAddGuest}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs cursor-pointer"
                  >
                    + Создать
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Attendance Table */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Игрок</th>
                <th className="py-3 px-4 text-center">Сыграно игр</th>
                <th className="py-3 px-4 text-center">Расчетная плата</th>
                <th className="py-3 px-4 text-center">Статус оплаты</th>
                <th className="py-3 px-4 text-right">Быстрые действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {participantList.map((p) => {
                const isPaid = p.currentPaymentStatus === "Оплачено";
                const isDebt = p.currentPaymentStatus === "В долг";
                const isPartial = p.currentPaymentStatus === "Частично";

                return (
                  <tr key={p.nickLower} className="hover:bg-slate-950/30 transition-colors">
                    {/* Player Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{p.displayName}</span>
                        {p.clubPlayer?.tag && (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700">
                            {p.clubPlayer.tag}
                          </span>
                        )}
                      </div>
                      {p.full_name && (
                        <span className="text-[10px] text-slate-500 block font-mono">
                          {p.full_name}
                        </span>
                      )}
                    </td>

                    {/* Games played tonight */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl">
                        {p.gamesPlayed} {p.gamesPlayed === 1 ? "игра" : "игр"}
                      </span>
                    </td>

                    {/* Calculated Fee */}
                    <td className="py-3.5 px-4 text-center font-mono text-sm font-bold text-slate-200">
                      {p.calculatedFee} ₽
                    </td>

                    {/* Payment Status Pill */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono ${
                          isPaid
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : isDebt
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {isPaid && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                        {isDebt && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                        {isPartial && <DollarSign className="w-3.5 h-3.5 text-amber-400" />}
                        {p.currentPaymentStatus} ({p.currentPayment} ₽)
                      </span>
                    </td>

                    {/* Quick Action buttons */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Button 1: Mark Paid */}
                        <button
                          onClick={() => handleSetPlayerPayment(p.displayName, p.calculatedFee, "Оплачено")}
                          title="Отметить оплачено в полном объеме"
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isPaid
                              ? "bg-emerald-500 text-slate-950 font-extrabold"
                              : "bg-slate-950 border border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/30"
                          }`}
                        >
                          ✅ Оплатил ({p.calculatedFee}₽)
                        </button>

                        {/* Button 2: Mark Debt */}
                        <button
                          onClick={() => handleSetPlayerPayment(p.displayName, p.calculatedFee, "В долг")}
                          title="Отметить в долг"
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isDebt
                              ? "bg-rose-500 text-slate-950 font-extrabold"
                              : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30"
                          }`}
                        >
                          ⚠️ В долг
                        </button>

                        {/* Button 3: Mark Free */}
                        <button
                          onClick={() => handleSetPlayerPayment(p.displayName, 0, "Оплачено")}
                          title="Отметить как бесплатный вход (Судья/VIP)"
                          className="px-2 py-1.5 rounded-xl text-xs font-bold bg-slate-950 border border-slate-800 text-slate-400 hover:text-sky-400 hover:border-sky-500/30 cursor-pointer"
                        >
                          🎁 0 ₽
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {participantList.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 font-mono text-xs">
                    На данный вечер пока никто не зарегистрирован и не сыграл ни одной игры.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800/80 flex justify-between items-center">
          <div className="text-xs text-slate-500 font-mono">
            💡 Игроки, участвующие в протоколах игр за вечер, автоматически подтягиваются в данную ведомость.
          </div>
          <button
            onClick={onClose}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-6 py-2.5 rounded-2xl text-xs uppercase shadow-neu-flat-amber cursor-pointer"
          >
            Готово / Закрыть
          </button>
        </div>
      </motion.div>
    </div>
  );
};
