import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Coins, X, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";
import { Player, ShopItem } from "../types.js";

export default function Shop() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  
  // Selection / purchase flow
  const [activeItem, setActiveItem] = useState<ShopItem | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/players").then((res) => res.json()),
      fetch("/api/shop-items").then((res) => res.json()),
    ])
      .then(([playersData, shopItemsData]) => {
        setPlayers(playersData);
        setShopItems(shopItemsData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading shop data", err);
        setLoading(false);
      });
  };

  const handlePurchase = () => {
    if (!selectedPlayerId || !activeItem) return;

    fetch("/api/shop-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: selectedPlayerId,
        item_id: activeItem.id,
      })
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Ошибка при покупке");
        }
        return res.json();
      })
      .then((data) => {
        setPurchaseSuccess(data);
        setActiveItem(null);
        fetchData(); // refresh players data
        confetti({
          particleCount: 100,
          spread: 50,
          origin: { y: 0.6 }
        });
      })
      .catch((err) => {
        alert(err.message);
      });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  return (
    <div className="space-y-6">
      {/* Account Selector Section */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="space-y-1 w-full sm:w-auto">
          <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500 animate-bounce" /> Магазин Жетонов Клуба
          </h2>
          <p className="text-xs text-slate-500">Выберите игрока, чтобы посмотреть баланс и совершить покупку</p>
        </div>

        <div className="w-full sm:w-72">
          <select
            value={selectedPlayerId}
            onChange={(e) => {
              setSelectedPlayerId(parseInt(e.target.value));
              setPurchaseSuccess(null);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-rose-500 font-medium"
          >
            <option value={0}>-- Выбрать покупателя --</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname} (Баланс: {p.tokens} 🪙)
              </option>
            ))}
          </select>
        </div>
      </div>

      {purchaseSuccess && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 space-y-2 relative"
        >
          <button
            onClick={() => setPurchaseSuccess(null)}
            className="absolute right-4 top-4 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-md font-display font-bold text-amber-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" /> Покупка совершена успешно!
          </h3>
          <p className="text-xs text-slate-300">
            Игрок **{purchaseSuccess.purchase.nickname}** приобрел товар **"{purchaseSuccess.purchase.item_name}"** за **{purchaseSuccess.purchase.price} 🪙**.
            Новый баланс жетонов: **{purchaseSuccess.player.tokens} 🪙**.
          </p>
        </motion.div>
      )}

      {/* Available Items Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {shopItems.map((item) => (
          <div
            key={item.id}
            className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-colors relative overflow-hidden group"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-850 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                {item.icon}
              </div>
              <div>
                <h3 className="text-lg font-display font-bold text-white group-hover:text-rose-400 transition-colors">
                  {item.name}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                  {item.description}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-850/40 flex justify-between items-center gap-4">
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Стоимость</span>
                <span className="text-md font-mono font-bold text-amber-400">
                  {item.price} 🪙
                </span>
              </div>

              <button
                disabled={!selectedPlayerId || (selectedPlayer && selectedPlayer.tokens < item.price)}
                onClick={() => {
                  setPurchaseSuccess(null);
                  setActiveItem(item);
                }}
                className="bg-slate-850 hover:bg-rose-600 disabled:bg-slate-900/40 text-slate-200 hover:text-white disabled:text-slate-600 rounded-xl px-4 py-2 text-xs font-bold border border-slate-700 hover:border-rose-500 disabled:border-slate-850 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                Купить
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {activeItem && selectedPlayer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-3xl mx-auto">
                  {activeItem.icon}
                </div>
                <h3 className="text-xl font-display font-bold text-white">Подтверждение Покупки</h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                  Вы собираетесь приобрести товар **"{activeItem.name}"** на баланс игрока **{selectedPlayer.nickname}**.
                </p>
              </div>

              <div className="bg-slate-950/60 rounded-xl border border-slate-850 p-4 space-y-3.5 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span>Покупатель:</span>
                  <span className="font-semibold text-white">{selectedPlayer.nickname}</span>
                </div>
                <div className="flex justify-between">
                  <span>Текущий баланс:</span>
                  <span className="font-mono text-amber-400">{selectedPlayer.tokens} 🪙</span>
                </div>
                <div className="flex justify-between">
                  <span>Стоимость товара:</span>
                  <span className="font-mono text-amber-500">-{activeItem.price} 🪙</span>
                </div>
                <div className="flex justify-between border-t border-slate-850 pt-2.5">
                  <span>Баланс после покупки:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {selectedPlayer.tokens - activeItem.price} 🪙
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl py-2.5 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handlePurchase}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white rounded-xl py-2.5 text-xs font-bold transition-colors cursor-pointer"
                >
                  Подтвердить покупку
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rules rules banner */}
      <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-5 space-y-3">
        <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider">
          💡 Как зарабатывать жетоны в клубе:
        </h4>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs text-slate-500 list-disc pl-4 leading-relaxed">
          <li>Запись на игру вовремя (+500🪙)</li>
          <li>Запись на игру позже (+400🪙)</li>
          <li>Участие в игре (+100🪙)</li>
          <li>Победа в игре (+100🪙)</li>
          <li>Дополнительные баллы (0.1 доп. балла = 10🪙)</li>
          <li>Завершение игры без фолов (+15🪙)</li>
        </ul>
      </div>
    </div>
  );
}
