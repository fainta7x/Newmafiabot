import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  Trash2,
  Users,
  Search,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  X,
  PieChart,
  ShieldAlert,
  Wallet
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Player, FinancialTransaction } from "../types.js";

export default function Finance() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");

  // New Transaction Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [txType, setTxType] = useState<"income" | "expense">("income");
  const [txAmount, setTxAmount] = useState<string>("");
  const [txCategory, setTxCategory] = useState<FinancialTransaction["category"]>("Взнос за вечер");
  const [txDescription, setTxDescription] = useState("");
  const [txPlayerId, setTxPlayerId] = useState<number>(0);
  const [txPaymentMethod, setTxPaymentMethod] = useState<"Наличные" | "Перевод / Карта" | "Внутренний баланс">("Наличные");

  // Debt Payment Modal/Inline state
  const [payingPlayerId, setPayingPlayerId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/players").then((res) => res.json()),
      fetch("/api/transactions").then((res) => res.json()),
    ])
      .then(([playersData, txData]) => {
        setPlayers(playersData);
        setTransactions(txData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading finance data", err);
        setLoading(false);
      });
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || parseInt(txAmount) <= 0) {
      alert("Укажите правильную сумму!");
      return;
    }

    const selectedPlayer = players.find((p) => p.id === txPlayerId);

    fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: txType,
        amount: parseInt(txAmount),
        category: txCategory,
        description: txDescription,
        player_id: txPlayerId > 0 ? txPlayerId : undefined,
        nickname: selectedPlayer ? selectedPlayer.nickname : undefined,
        payment_method: txPaymentMethod,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Ошибка при создании транзакции");
        return res.json();
      })
      .then(() => {
        setShowAddModal(false);
        setTxAmount("");
        setTxDescription("");
        setTxPlayerId(0);
        fetchData();
      })
      .catch((err) => alert(err.message));
  };

  const handleDeleteTransaction = (id: string) => {
    if (!confirm("Удалить эту финансовую запись из истории кассы?")) return;
    fetch(`/api/transactions/${id}`, { method: "DELETE" })
      .then(() => fetchData())
      .catch((err) => console.error(err));
  };

  const handleSettleDebt = (player: Player) => {
    const amountToPay = parseInt(payAmount) || Math.abs(player.debt);
    if (amountToPay <= 0) return;

    fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "income",
        amount: amountToPay,
        category: "Оплата долга",
        description: `Погашение долга игрока ${player.nickname}`,
        player_id: player.id,
        nickname: player.nickname,
        payment_method: "Наличные",
      }),
    })
      .then(() => {
        setPayingPlayerId(null);
        setPayAmount("");
        fetchData();
      })
      .catch((err) => alert(err.message));
  };

  const handlePardonDebt = (player: Player) => {
    if (!confirm(`Вы уверены, что хотите списать долг ${Math.abs(player.debt)} ₽ для игрока ${player.nickname}?`)) return;

    fetch(`/api/players/${player.id}/debt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", amount: 0 }),
    })
      .then(() => fetchData())
      .catch((err) => console.error(err));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  // Financial Calculations
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const netBalance = totalIncome - totalExpense;

  const totalDebt = players.reduce((sum, p) => sum + (p.debt < 0 ? Math.abs(p.debt) : 0), 0);
  const indebtedPlayers = players.filter((p) => p.debt < 0);

  // Group by category for chart
  const categoriesMap: Record<string, { income: number; expense: number }> = {};
  transactions.forEach((t) => {
    if (!categoriesMap[t.category]) {
      categoriesMap[t.category] = { income: 0, expense: 0 };
    }
    if (t.type === "income") categoriesMap[t.category].income += t.amount;
    else categoriesMap[t.category].expense += t.amount;
  });

  const chartData = Object.entries(categoriesMap).map(([cat, val]) => ({
    category: cat,
    "Доходы": val.income,
    "Расходы": val.expense,
  }));

  // Filtered transactions
  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.nickname && t.nickname.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === "all" || t.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2.5">
            <Wallet className="w-7 h-7 text-emerald-400" /> Касса Клуба & Финансовая Аналитика
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Учет всех поступлений, расходов, клубных взносов и контроллинг долгов игроков
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-neu-flat flex items-center gap-2 cursor-pointer uppercase tracking-wider"
        >
          <PlusCircle className="w-4 h-4" /> Добавить операцию
        </button>
      </div>

      {/* Top 4 Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Баланс Кассы</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <span className={`text-2xl font-display font-black block ${netBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {netBalance >= 0 ? `+${netBalance.toLocaleString()} ₽` : `${netBalance.toLocaleString()} ₽`}
          </span>
          <span className="text-[10px] text-slate-500 block">Чистый остаток средств клуба</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Всего Доходов</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-display font-black text-white block">
            +{totalIncome.toLocaleString()} ₽
          </span>
          <span className="text-[10px] text-slate-500 block">Взносы, сборы, покупки ролей</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Всего Расходов</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-display font-black text-rose-400 block">
            -{totalExpense.toLocaleString()} ₽
          </span>
          <span className="text-[10px] text-slate-500 block">Аренда зала, инвентарь, призы</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Долги Игроков</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-display font-black text-amber-400 block">
            {totalDebt.toLocaleString()} ₽
          </span>
          <span className="text-[10px] text-slate-500 block">Неоплачено у {indebtedPlayers.length} игроков</span>
        </div>
      </div>

      {/* Analytics Chart & Debt Collection */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Breakdown Chart */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-400" /> Структура кассы по категориям
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">График доходов/расходов</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="category" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                  labelStyle={{ color: "#f8fafc" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                <Bar dataKey="Доходы" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Расходы" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Player Debts Panel */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" /> Должники клуба ({indebtedPlayers.length})
              </h3>
            </div>

            {indebtedPlayers.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-80" />
                <p className="text-xs">Все игроки рассчитались! Долгов нет.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {indebtedPlayers.map((p) => {
                  const debtVal = Math.abs(p.debt);
                  const isPaying = payingPlayerId === p.id;
                  return (
                    <div
                      key={p.id}
                      className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-2"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <strong className="text-white font-bold block">{p.nickname}</strong>
                          <span className="text-[10px] text-slate-500">{p.full_name || "Игрок"}</span>
                        </div>
                        <span className="font-mono font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                          -{debtVal} ₽
                        </span>
                      </div>

                      {isPaying ? (
                        <div className="flex items-center gap-1.5 pt-1">
                          <input
                            type="number"
                            placeholder={`${debtVal}`}
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                          />
                          <button
                            onClick={() => handleSettleDebt(p)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold cursor-pointer shrink-0"
                          >
                            Оплатить
                          </button>
                          <button
                            onClick={() => setPayingPlayerId(null)}
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-900">
                          <button
                            onClick={() => {
                              setPayingPlayerId(p.id);
                              setPayAmount(debtVal.toString());
                            }}
                            className="text-[10px] text-emerald-400 hover:underline font-bold cursor-pointer"
                          >
                            Принять оплату
                          </button>
                          <button
                            onClick={() => handlePardonDebt(p)}
                            className="text-[10px] text-slate-500 hover:text-rose-400 cursor-pointer"
                          >
                            Списать
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transactions Register Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" /> Журнал операций кассы ({filteredTransactions.length})
          </h3>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Type Filter Buttons */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              {(["all", "income", "expense"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTypeFilter(mode)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                    typeFilter === mode
                      ? "bg-slate-800 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {mode === "all" ? "Все" : mode === "income" ? "Доходы +" : "Расходы -"}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Поиск записи..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="p-3">Дата / Время</th>
                <th className="p-3">Тип</th>
                <th className="p-3">Категория</th>
                <th className="p-3">Описание / Игрок</th>
                <th className="p-3">Оплата</th>
                <th className="p-3 text-right">Сумма</th>
                <th className="p-3 text-center">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500 font-sans">
                    Записи операций не найдены
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-900/80 transition-colors">
                    <td className="p-3 text-slate-400 text-[11px]">{t.timestamp}</td>
                    <td className="p-3 font-sans">
                      {t.type === "income" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <ArrowUpRight className="w-3 h-3" /> Доход
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                          <ArrowDownRight className="w-3 h-3" /> Расход
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-sans font-medium text-slate-200">{t.category}</td>
                    <td className="p-3 font-sans text-slate-300">
                      <div>{t.description}</div>
                      {t.nickname && (
                        <span className="text-[10px] text-amber-400 font-mono">Игрок: {t.nickname}</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-400 font-sans text-[11px]">{t.payment_method || "Наличные"}</td>
                    <td className={`p-3 text-right font-bold text-sm ${t.type === "income" ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.type === "income" ? `+${t.amount.toLocaleString()} ₽` : `-${t.amount.toLocaleString()} ₽`}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDeleteTransaction(t.id)}
                        className="p-1.5 rounded bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors cursor-pointer"
                        title="Удалить запись"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Financial Operation */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-display font-bold text-white flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-emerald-400" /> Добавить операцию в кассу
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddTransaction} className="space-y-4 text-xs font-sans">
                {/* Type toggle */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase text-[10px]">Тип операции</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTxType("income");
                        setTxCategory("Взнос за вечер");
                      }}
                      className={`p-2.5 rounded-xl border text-center font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        txType === "income"
                          ? "bg-emerald-600/20 border-emerald-500 text-emerald-400"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      + Поступление (Доход)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTxType("expense");
                        setTxCategory("Аренда помещения");
                      }}
                      className={`p-2.5 rounded-xl border text-center font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        txType === "expense"
                          ? "bg-rose-600/20 border-rose-500 text-rose-400"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      - Списание (Расход)
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase text-[10px]">Сумма (₽)</label>
                  <input
                    type="number"
                    required
                    placeholder="Например: 1200"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase text-[10px]">Категория</label>
                  <select
                    value={txCategory}
                    onChange={(e) => setTxCategory(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    {txType === "income" ? (
                      <>
                        <option value="Взнос за вечер">Взнос за вечер</option>
                        <option value="Турнирный сбор">Турнирный сбор</option>
                        <option value="Оплата долга">Оплата долга</option>
                        <option value="Внутриклубная покупка">Внутриклубная покупка</option>
                        <option value="Прочее">Прочее поступление</option>
                      </>
                    ) : (
                      <>
                        <option value="Аренда помещения">Аренда помещения</option>
                        <option value="Закупка инвентаря">Закупка инвентаря</option>
                        <option value="Призовой фонд">Призовой фонд</option>
                        <option value="Прочее">Прочие расходы</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Optional Player Selection */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase text-[10px]">Привязать игрока (необязательно)</label>
                  <select
                    value={txPlayerId}
                    onChange={(e) => setTxPlayerId(parseInt(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value={0}>-- Без привязки к игроку --</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nickname} ({p.full_name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment Method */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase text-[10px]">Способ оплаты</label>
                  <select
                    value={txPaymentMethod}
                    onChange={(e) => setTxPaymentMethod(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="Наличные">Наличные</option>
                    <option value="Перевод / Карта">Перевод / Карта</option>
                    <option value="Внутренний баланс">Внутренний баланс</option>
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase text-[10px]">Примечание / Описание</label>
                  <input
                    type="text"
                    placeholder="Например: Погашение долга наличными или Закупка 5 карт"
                    value={txDescription}
                    onChange={(e) => setTxDescription(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer shadow-neu-flat"
                  >
                    Сохранить запись
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
