import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Calendar, UserCheck, Plus, Trash2, X, DollarSign, CheckCircle } from "lucide-react";
import confetti from "canvas-confetti";
import { Player, Booking } from "../types.js";

export default function Bookings() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Add booking state
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [arrivalStatus, setArrivalStatus] = useState<"Вовремя" | "Позже">("Вовремя");

  // Billing status reports
  const [billingResult, setBillingResult] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/players").then((res) => res.json()),
      fetch("/api/bookings").then((res) => res.json()),
    ])
      .then(([playersData, bookingsData]) => {
        setPlayers(playersData);
        setBookings(bookingsData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching bookings data", err);
        setLoading(false);
      });
  };

  const handleAddBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    const p = players.find((pl) => pl.user_id === selectedUserId);
    if (!p) return;

    fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: p.user_id,
        nickname: p.nickname,
        status: arrivalStatus
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setBookings(data);
        setSelectedUserId(0);
      })
      .catch((err) => console.error("Error adding booking", err));
  };

  const handleRemoveBooking = (booking: Booking) => {
    fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: booking.nickname,
        status: "Отмена"
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setBookings(data);
      })
      .catch((err) => console.error("Error removing booking", err));
  };

  const handleTriggerBilling = () => {
    if (bookings.length === 0) {
      alert("Нет активных записей на вечер!");
      return;
    }

    if (!confirm("Вы уверены, что хотите провести расчет вечера? Это начислит долги за сыгранные игры и выдаст жетоны игрокам.")) {
      return;
    }

    fetch("/api/bookings/archive", {
      method: "POST",
    })
      .then((res) => res.json())
      .then((resData) => {
        setBillingResult(resData);
        fetchData(); // reload empty bookings and updated players
        confetti({
          particleCount: 120,
          spread: 60,
          origin: { y: 0.6 }
        });
      })
      .catch((err) => {
        console.error("Error archiving bookings", err);
        alert("Ошибка биллинга");
      });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  // Get list of players who aren't currently booked
  const bookedUserIds = bookings.map((b) => b.user_id);
  const unbookedPlayers = players.filter((p) => !bookedUserIds.includes(p.user_id));

  return (
    <div className="space-y-6">
      {billingResult && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-5 space-y-3 relative"
        >
          <button
            onClick={() => setBillingResult(null)}
            className="absolute right-4 top-4 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-md font-display font-bold text-emerald-400 flex items-center gap-1.5">
            <CheckCircle className="w-5 h-5" /> Расчет Вечера Проведен Успешно!
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            {billingResult.message} Все активные записи очищены. Следующие счета занесены в профили должников:
          </p>
          <div className="space-y-1 mt-2 max-h-32 overflow-y-auto pr-1">
            {billingResult.details && billingResult.details.map((det: string, idx: number) => (
              <div key={idx} className="text-xs text-slate-400 font-mono">
                • {det}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Bookings List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800/60 bg-slate-900/20 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-rose-500" /> Запись на Вечер Игры
                </h2>
                <p className="text-xs text-slate-500">Зарегистрированные участники предстоящей пятницы</p>
              </div>
              <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1 rounded-full text-xs font-bold font-mono">
                Всего: {bookings.length}
              </span>
            </div>

            {bookings.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">
                Никто еще не записан на ближайший вечер. Зарегистрируйте первого игрока справа!
              </div>
            ) : (
              <div className="divide-y divide-slate-800/40">
                {bookings.map((booking) => (
                  <div
                    key={booking.user_id}
                    className="p-4 flex items-center justify-between hover:bg-slate-900/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-850 flex items-center justify-center font-bold text-slate-400">
                        {booking.nickname.slice(0, 2)}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-white block">{booking.nickname}</span>
                        <span className="text-[10px] text-slate-500 block">Пятница {booking.date}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {booking.status === "Вовремя" ? (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider">
                          Вовремя
                        </span>
                      ) : (
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider">
                          Позже
                        </span>
                      )}

                      <button
                        onClick={() => handleRemoveBooking(booking)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-500 transition-all cursor-pointer"
                        title="Отменить запись"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Seeding / Add Form & Billing Action */}
        <div className="space-y-6">
          {/* Add Booking Card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-display font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-rose-500" /> Записать игрока
            </h3>

            <form onSubmit={handleAddBooking} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase block">
                  Выбрать игрока
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value={0}>-- Выбрать из базы --</option>
                  {unbookedPlayers.map((p) => (
                    <option key={p.id} value={p.user_id}>
                      {p.nickname} ({p.full_name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase block">
                  Время прибытия
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setArrivalStatus("Вовремя")}
                    className={`py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide border transition-all cursor-pointer ${
                      arrivalStatus === "Вовремя"
                        ? "bg-rose-600 border-rose-500 text-white"
                        : "bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    Вовремя
                  </button>
                  <button
                    type="button"
                    onClick={() => setArrivalStatus("Позже")}
                    className={`py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wide border transition-all cursor-pointer ${
                      arrivalStatus === "Позже"
                        ? "bg-amber-600 border-amber-500 text-white"
                        : "bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    Позже
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedUserId}
                className="w-full bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-300 rounded-xl py-2 text-xs font-bold border border-slate-700 hover:border-rose-500 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800 disabled:hover:text-slate-300 disabled:hover:border-slate-700"
              >
                <Plus className="w-4 h-4" /> Записать на вечер
              </button>
            </form>
          </div>

          {/* Billing Admin Action Card */}
          <div className="bg-gradient-to-br from-rose-950/20 to-slate-900 border border-rose-500/25 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-display font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-rose-500" /> Провести расчет вечера
            </h3>

            <p className="text-xs text-slate-400 leading-relaxed">
              Нажмите эту кнопку в конце игрового вечера, чтобы **начислить счета** за сыгранные партии:
            </p>
            
            <ul className="text-[11px] text-slate-500 space-y-1 list-disc pl-4 leading-tight">
              <li>100 ₽ за одну игру</li>
              <li>Максимум 400 ₽ за вечер</li>
              <li>Начисление жетонов (+500 вовремя / +400 позже)</li>
              <li>Автоматическая архивация сессии</li>
            </ul>

            <button
              onClick={handleTriggerBilling}
              disabled={bookings.length === 0}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-rose-600/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              💸 Провести Расчет & Счета
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
