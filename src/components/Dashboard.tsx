import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { Users, Calendar, Trophy, DollarSign, Activity, Award, Crown, Zap } from "lucide-react";
import { Player } from "../types.js";
import GameProtocolsView from "./GameProtocolsView.tsx";

interface DashboardStats {
  totalPlayers: number;
  totalGames: number;
  activeBookings: number;
  totalDebt: number;
  topElo: { nickname: string; elo: number }[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard-stats").then((res) => res.json()),
      fetch("/api/players").then((res) => res.json()),
    ])
      .then(([statsData, playersData]) => {
        setStats(statsData);
        setPlayers(playersData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading dashboard data", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  // Calculate some insights
  const leader = players.length > 0 ? [...players].sort((a, b) => b.elo - a.elo)[0] : null;
  const topSpenders = players.length > 0 ? [...players].sort((a, b) => b.tokens - a.tokens).slice(0, 3) : [];
  
  // Format data for chart: Player ELO rankings
  const chartData = stats?.topElo || [];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 border border-rose-500/10 rounded-2xl p-6 overflow-hidden"
      >
        <div className="absolute right-0 top-0 -mr-6 -mt-6 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl"></div>
        <div className="relative z-10 space-y-2">
          <h1 className="text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-rose-400 to-amber-300 bg-clip-text text-transparent">
            Панель Клуба Мафии 🎭
          </h1>
          <p className="text-slate-400 max-w-xl text-sm leading-relaxed">
            Добро пожаловать в веб-пульт управления вашим клубом мафии. Здесь вы можете вести протоколы игр, отслеживать рейтинги Эло, вести учет долгов и регистрировать игроков.
          </p>
        </div>
      </motion.div>

      {/* Grid Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "Всего игроков",
            value: stats?.totalPlayers || 0,
            icon: Users,
            color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
            desc: "Зарегистрировано в клубе",
          },
          {
            title: "Игр сыграно",
            value: stats?.totalGames || 0,
            icon: Activity,
            color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
            desc: "Записано в историю",
          },
          {
            title: "Запись на пятницу",
            value: stats?.activeBookings || 0,
            icon: Calendar,
            color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
            desc: "Активные регистрации",
          },
          {
            title: "Долги клуба",
            value: `${stats?.totalDebt || 0} ₽`,
            icon: DollarSign,
            color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
            desc: "Неоплаченные взносы",
          },
        ].map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`p-5 rounded-2xl border bg-slate-900/60 backdrop-blur-md flex flex-col justify-between h-36 ${item.color.split(" ").slice(2).join(" ")}`}
          >
            <div className="flex justify-between items-start">
              <span className="text-slate-400 font-medium text-sm">{item.title}</span>
              <div className={`p-2 rounded-xl border ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-display font-bold tracking-tight text-white block">
                {item.value}
              </span>
              <span className="text-xs text-slate-500">{item.desc}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Chart */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between"
        >
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" /> Топ-5 Рейтинга Эло
              </h2>
              <p className="text-xs text-slate-500">Сильнейшие действующие игроки клуба</p>
            </div>
          </div>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="nickname" stroke="#94a3b8" fontSize={11} />
                <YAxis domain={[1200, 1800]} stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                  labelStyle={{ color: "#f8fafc" }}
                  itemStyle={{ color: "#fda4af" }}
                />
                <Bar dataKey="elo" radius={[6, 6, 0, 0]}>
                  {chartData.map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index === 0 ? "#f43f5e" : index === 1 ? "#fb7185" : "#fda4af"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Right column - Quick Leaders & Achievements */}
        <div className="space-y-6">
          {/* Club Leader Badge */}
          {leader && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-gradient-to-br from-amber-950/30 to-slate-900 border border-amber-500/20 rounded-2xl p-5 relative overflow-hidden"
            >
              <div className="absolute right-3 top-3">
                <Crown className="w-12 h-12 text-amber-500/20 rotate-12" />
              </div>
              <h3 className="text-xs text-amber-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" /> Лидер сезона
              </h3>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">
                  👑
                </div>
                <div>
                  <h4 className="text-xl font-display font-bold text-white">{leader.nickname}</h4>
                  <p className="text-xs text-slate-400">{leader.full_name}</p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/60 flex justify-between text-center">
                <div>
                  <span className="text-xs text-slate-500 block">Рейтинг Эло</span>
                  <span className="text-lg font-mono font-bold text-amber-400">{leader.elo}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Побед / Игр</span>
                  <span className="text-sm font-medium text-slate-300">
                    {leader.games_won} / {leader.games_played}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Достижений</span>
                  <span className="text-sm font-medium text-slate-300 flex items-center justify-center gap-0.5">
                    <Award className="w-3.5 h-3.5 text-emerald-400" /> {leader.achievements.length}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Token Millionaires */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5"
          >
            <h3 className="text-sm font-display font-bold text-white mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-rose-500" /> Копилка жетонов 🪙
            </h3>
            <div className="space-y-3">
              {topSpenders.map((p, i) => (
                <div key={p.id} className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-slate-500 w-4">
                      #{i + 1}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-slate-200 block">{p.nickname}</span>
                      <span className="text-xs text-slate-500">@{p.username || "no_username"}</span>
                    </div>
                  </div>
                  <span className="text-sm font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                    {p.tokens} 🪙
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Game Protocols View */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <GameProtocolsView />
      </motion.div>
    </div>
  );
}
