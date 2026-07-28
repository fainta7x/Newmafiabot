import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, Search, Calendar, User, Trophy, Shield, Award, ChevronDown, ChevronUp, Eye, CheckCircle2, XCircle, AlertCircle, Sparkles, Filter, Copy, Check, Share2, Image, X } from "lucide-react";
import { Game, GameSlot } from "../types.ts";

interface GameProtocolsViewProps {
  filterPlayerNickname?: string;
}

export default function GameProtocolsView({ filterPlayerNickname }: GameProtocolsViewProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(filterPlayerNickname || "");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [winnerFilter, setWinnerFilter] = useState<"all" | "Красные" | "Чёрные">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const [selectedPosterGame, setSelectedPosterGame] = useState<Game | null>(null);
  const [copiedGameId, setCopiedGameId] = useState<number | null>(null);

  useEffect(() => {
    fetchGames();
  }, []);

  const generateTelegramPost = (game: Game) => {
    const winnerEmoji = game.winner_label === "Красные" ? "🟥" : "⬛️";
    let text = `🏆 *ПРОТОКОЛ ИГРЫ #${game.global_game_number}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `👑 *Результат:* ПОБЕДА ${game.winner_label.toUpperCase()} ${winnerEmoji}\n`;
    text += `📅 *Дата:* ${game.game_date} | 👨‍⚖️ *Судья:* ${game.judge_name || "Коллегия"}\n`;
    if (game.protocol_text) {
      text += `💬 *Описание:* _${game.protocol_text}_\n`;
    }
    text += `\n📊 *ИТОГОВАЯ ТАБЛИЦА И БАЛЛЫ:*\n`;

    (game.slots || []).forEach(s => {
      const roleEmoji = s.team === "Красные" ? "🟥" : "⬛️";
      const totalPts = (parseFloat(s.base_points as any) || 0) + 
                       (parseFloat(s.bonus_points as any) || 0) + 
                       (parseFloat(s.lh_points as any) || 0) + 
                       (parseFloat(s.will_protocol_points as any) || 0) + 
                       (parseFloat(s.will_opinion_points as any) || 0) + 
                       (parseFloat(s.dc_points as any) || 0);
      const eloTxt = s.elo_change !== undefined ? ` (Δ ELO: ${s.elo_change >= 0 ? "+" : ""}${s.elo_change})` : "";
      const bonusTxt = s.bonus_points > 0 ? ` [Доп: +${s.bonus_points}]` : "";
      const lhTxt = (s.lh_points || 0) + (s.will_protocol_points || 0) > 0 ? ` [ЛХ/ПП: +${(s.lh_points || 0) + (s.will_protocol_points || 0)}]` : "";
      const foulTxt = s.ppk ? " 🛑 [ППК]" : s.kick ? " ❌ [Удален]" : s.fouls > 0 ? ` [Фолы: ${s.fouls}]` : "";

      text += `${s.slot_num}. ${roleEmoji} *${s.nickname}* (${s.role}) — *${totalPts.toFixed(1)} б.*${eloTxt}${bonusTxt}${lhTxt}${foulTxt}\n`;
    });

    text += `\n#ФСМ #Мафия #ПротоколИгры #${game.winner_label === "Красные" ? "КрасныеПобедили" : "МафияПобедила"}`;
    return text;
  };

  const handleCopyTelegram = (game: Game) => {
    const postText = generateTelegramPost(game);
    navigator.clipboard.writeText(postText);
    setCopiedGameId(game.id);
    setTimeout(() => setCopiedGameId(null), 3000);
  };

  const fetchGames = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/games");
      const data = await res.json();
      setGames(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error loading game protocols", e);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique dates for filtering
  const availableDates = Array.from(new Set(games.map(g => g.game_date))).filter(Boolean);

  // Filter games based on criteria
  const filteredGames = games.filter(g => {
    // Winner filter
    if (winnerFilter !== "all" && g.winner_label !== winnerFilter) return false;

    // Date filter
    if (dateFilter !== "all" && g.game_date !== dateFilter) return false;

    // Role filter
    if (roleFilter !== "all") {
      const hasRole = g.slots?.some(s => s.role === roleFilter && (!search.trim() || s.nickname?.toLowerCase().includes(search.toLowerCase().trim())));
      if (!hasRole) return false;
    }

    // Search query (player nickname, judge, or game number)
    if (search.trim()) {
      const query = search.toLowerCase().trim();
      const matchGameNo = `игра #${g.global_game_number}`.includes(query) || `${g.global_game_number}`.includes(query);
      const matchJudge = g.judge_name?.toLowerCase().includes(query);
      const matchProtocol = g.protocol_text?.toLowerCase().includes(query);
      const matchPlayer = g.slots?.some(s => s.nickname?.toLowerCase().includes(query));

      if (!matchGameNo && !matchJudge && !matchProtocol && !matchPlayer) return false;
    }

    return true;
  });

  // Calculate personal stats if searching for a specific player
  const searchedPlayer = search.trim().toLowerCase();
  const playerGames = searchedPlayer
    ? games.filter(g => g.slots?.some(s => s.nickname?.toLowerCase().includes(searchedPlayer)))
    : [];

  const playerSlotEntries = searchedPlayer
    ? games.flatMap(g => (g.slots || []).map(s => ({ ...s, winner_label: g.winner_label }))).filter(s => s.nickname?.toLowerCase().includes(searchedPlayer))
    : [];

  const playerTotalGames = playerSlotEntries.length;
  const playerWins = playerSlotEntries.filter(s => s.team === s.winner_label).length;
  const playerRedWins = playerSlotEntries.filter(s => s.team === "Красные" && s.winner_label === "Красные").length;
  const playerRedGames = playerSlotEntries.filter(s => s.team === "Красные").length;
  const playerBlackWins = playerSlotEntries.filter(s => s.team === "Чёрные" && s.winner_label === "Чёрные").length;
  const playerBlackGames = playerSlotEntries.filter(s => s.team === "Чёрные").length;
  const playerTotalEloChange = playerSlotEntries.reduce((acc, curr) => acc + (curr.elo_change || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Search Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-rose-500" /> Итоговые Протоколы Игр
            </h2>
            <p className="text-xs text-slate-400">
              Открытая база результатов сыгранных партий, баллов игроков и изменений рейтинга ELO
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 px-3 py-1.5 rounded-xl font-mono font-bold">
            <Trophy className="w-4 h-4 text-rose-400" /> Всего игр: {games.length}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Поиск по игроку, судье, № игры..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Winner Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">Победители:</span>
            <select
              value={winnerFilter}
              onChange={(e) => setWinnerFilter(e.target.value as any)}
              className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer w-full"
            >
              <option value="all" className="bg-slate-900 text-white">Все команды</option>
              <option value="Красные" className="bg-slate-900 text-rose-400">Красные (Мирные/Шериф)</option>
              <option value="Чёрные" className="bg-slate-900 text-slate-300">Чёрные (Мафия/Дон)</option>
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">Роль:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer w-full"
            >
              <option value="all" className="bg-slate-900 text-white">Все роли</option>
              <option value="Мирный" className="bg-slate-900 text-rose-400">Мирный житель</option>
              <option value="Шериф" className="bg-slate-900 text-rose-300">Шериф</option>
              <option value="Мафия" className="bg-slate-900 text-slate-300">Мафия</option>
              <option value="Дон" className="bg-slate-900 text-amber-400">Дон мафии</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">Дата:</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer w-full"
            >
              <option value="all" className="bg-slate-900 text-white">За все время</option>
              {availableDates.map((d) => (
                <option key={d} value={d} className="bg-slate-900 text-white">{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* PERSONAL PLAYER PERFORMANCE SUMMARY BANNER */}
      {searchedPlayer && playerTotalGames > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/80 border border-rose-500/30 rounded-2xl p-4 shadow-xl space-y-3"
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Личная статистика игрока: <span className="text-rose-400">{search}</span>
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Сыграно в базе: <strong>{playerTotalGames}</strong> партий
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Общий Винрейт</span>
              <span className="text-lg font-black text-emerald-400 font-mono mt-0.5 block">
                {Math.round((playerWins / playerTotalGames) * 100)}% ({playerWins}/{playerTotalGames})
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-rose-400/90 font-bold uppercase block">За Красных (Мирные)</span>
              <span className="text-lg font-black text-rose-300 font-mono mt-0.5 block">
                {playerRedGames ? Math.round((playerRedWins / playerRedGames) * 100) : 0}% ({playerRedWins}/{playerRedGames})
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">За Чёрных (Мафия)</span>
              <span className="text-lg font-black text-slate-200 font-mono mt-0.5 block">
                {playerBlackGames ? Math.round((playerBlackWins / playerBlackGames) * 100) : 0}% ({playerBlackWins}/{playerBlackGames})
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-amber-400 font-bold uppercase block">Суммарный Δ ELO</span>
              <span className={`text-lg font-black font-mono mt-0.5 block ${playerTotalEloChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {playerTotalEloChange >= 0 ? `+${playerTotalEloChange}` : playerTotalEloChange}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Protocols List */}
      {filteredGames.length === 0 ? (
        <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <FileText className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">Протоколы игр не найдены</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Попробуйте изменить параметры поиска или фильтрации
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...filteredGames].reverse().map((game) => {
            const isExpanded = expandedGameId === game.id;
            
            // Calculate total points for each slot in game
            const slotsWithTotals = (game.slots || []).map(s => {
              const totalPts = (parseFloat(s.base_points as any) || 0) + 
                               (parseFloat(s.bonus_points as any) || 0) + 
                               (parseFloat(s.lh_points as any) || 0) + 
                               (parseFloat(s.will_protocol_points as any) || 0) + 
                               (parseFloat(s.will_opinion_points as any) || 0) + 
                               (parseFloat(s.dc_points as any) || 0);
              return { ...s, totalPts };
            });

            return (
              <div
                key={game.id}
                className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden transition-all shadow-lg"
              >
                {/* Protocol Card Top Bar */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-950/40">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-lg">
                        Игра #{game.global_game_number}
                      </span>

                      <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" /> {game.game_date}
                      </span>

                      <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-500" /> Судья: <strong className="text-white">{game.judge_name}</strong>
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 italic pt-1 line-clamp-2">
                      "{game.protocol_text || "Протокол игры сохранен судейской коллегией"}"
                    </p>
                  </div>

                  {/* Winner Label & Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0">
                    <span
                      className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider border flex items-center gap-1.5 shadow-sm ${
                        game.winner_label === "Красные"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-rose-500/10"
                          : "bg-slate-950 text-slate-200 border-slate-700"
                      }`}
                    >
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      {game.winner_label}
                    </span>

                    <button
                      onClick={() => handleCopyTelegram(game)}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="Скопировать протокол в формате Telegram"
                    >
                      {copiedGameId === game.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 text-[11px]">Скопировано</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-[11px]">Telegram</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedPosterGame(game)}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="Открыть карточку/постер игры для соцсетей"
                    >
                      <Image className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px]">Постер</span>
                    </button>

                    <button
                      onClick={() => setExpandedGameId(isExpanded ? null : game.id)}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* EXPANDABLE DETAILED PROTOCOL TABLE */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-slate-800/80 bg-slate-950/80 p-4 sm:p-5 space-y-4 overflow-x-auto"
                    >
                      <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <span>Детализация протокола (10 слотов)</span>
                        <span className="text-[10px] text-slate-500">Нажмите на протокол для подробностей</span>
                      </div>

                      {/* Protocol Table */}
                      <div className="overflow-x-auto rounded-xl border border-slate-800">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-mono text-[10px] uppercase">
                              <th className="p-2.5 text-center">Слот</th>
                              <th className="p-2.5">Игрок</th>
                              <th className="p-2.5">Роль</th>
                              <th className="p-2.5 text-center">Осн.</th>
                              <th className="p-2.5 text-center">Доп.</th>
                              <th className="p-2.5 text-center">ЛХ / ПП</th>
                              <th className="p-2.5 text-center font-bold text-amber-400">Итого баллов</th>
                              <th className="p-2.5 text-center">Δ ELO</th>
                              <th className="p-2.5 text-center">Фолы</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850">
                            {slotsWithTotals.map((slot) => {
                              const isWinner = slot.team === game.winner_label;
                              const isHighlighted = search.trim() && slot.nickname.toLowerCase().includes(search.toLowerCase().trim());

                              return (
                                <tr
                                  key={slot.slot_num}
                                  className={`hover:bg-slate-900/60 transition-colors ${
                                    isHighlighted ? "bg-rose-950/30 font-bold" : ""
                                  }`}
                                >
                                  <td className="p-2.5 text-center font-mono font-bold text-slate-400">
                                    #{slot.slot_num}
                                  </td>

                                  <td className="p-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-white">{slot.nickname}</span>
                                      {isHighlighted && <Sparkles className="w-3 h-3 text-amber-400" />}
                                    </div>
                                  </td>

                                  <td className="p-2.5">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                        slot.team === "Красные"
                                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                          : "bg-slate-900 text-slate-300 border-slate-700"
                                      }`}
                                    >
                                      {slot.role}
                                    </span>
                                  </td>

                                  <td className="p-2.5 text-center font-mono font-bold">
                                    <span className={isWinner ? "text-emerald-400" : "text-slate-500"}>
                                      {slot.base_points || (isWinner ? 1 : 0)}
                                    </span>
                                  </td>

                                  <td className="p-2.5 text-center font-mono text-slate-300">
                                    {slot.bonus_points > 0 ? `+${slot.bonus_points}` : "0"}
                                  </td>

                                  <td className="p-2.5 text-center font-mono text-slate-300">
                                    {(slot.lh_points || 0) + (slot.will_protocol_points || 0) > 0 ? (
                                      <span className="text-amber-400 font-bold">
                                        +{(slot.lh_points || 0) + (slot.will_protocol_points || 0)}
                                      </span>
                                    ) : (
                                      "0"
                                    )}
                                  </td>

                                  <td className="p-2.5 text-center font-mono font-black text-amber-400 bg-amber-500/5">
                                    {slot.totalPts > 0 ? `+${slot.totalPts.toFixed(1)}` : "0"}
                                  </td>

                                  <td className="p-2.5 text-center font-mono font-bold">
                                    <span
                                      className={
                                        (slot.elo_change || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                                      }
                                    >
                                      {(slot.elo_change || 0) >= 0 ? `+${slot.elo_change}` : slot.elo_change}
                                    </span>
                                  </td>

                                  <td className="p-2.5 text-center font-mono">
                                    {slot.kick || slot.ppk ? (
                                      <span className="text-rose-500 font-bold text-[10px] bg-rose-500/10 px-1.5 py-0.5 rounded">
                                        {slot.ppk ? "ППК" : "Удален"}
                                      </span>
                                    ) : (
                                      <span className={slot.fouls > 0 ? "text-amber-400 font-bold" : "text-slate-600"}>
                                        {slot.fouls || 0}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* GAME POSTER MODAL FOR SOCIAL MEDIA & TELEGRAM SHARING */}
      <AnimatePresence>
        {selectedPosterGame && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-950 border-2 border-rose-500/40 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative space-y-6 text-white my-8 overflow-hidden"
            >
              {/* Background ambient glow */}
              <div className="absolute -top-24 -right-24 w-60 h-60 bg-rose-600/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => setSelectedPosterGame(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-900 border border-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Poster Card Header */}
              <div className="text-center space-y-2 border-b border-slate-800 pb-4">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800 rounded-full text-[10px] font-mono text-rose-400 font-bold tracking-widest uppercase">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> FSM MAFIA CLUB OFFICIAL POSTER
                </div>

                <h2 className="text-2xl font-black font-display tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-200 to-rose-300 uppercase">
                  ИГРА №{selectedPosterGame.global_game_number}
                </h2>

                <div className="flex justify-center items-center gap-3 text-xs text-slate-400 font-mono">
                  <span>📅 {selectedPosterGame.game_date}</span>
                  <span>•</span>
                  <span>👨‍⚖️ Судья: <strong className="text-white">{selectedPosterGame.judge_name}</strong></span>
                </div>
              </div>

              {/* Winner Big Ribbon */}
              <div className={`p-4 rounded-2xl border text-center shadow-lg relative overflow-hidden ${
                selectedPosterGame.winner_label === "Красные"
                  ? "bg-gradient-to-r from-rose-950 via-rose-900 to-rose-950 border-rose-500/50 shadow-rose-900/30"
                  : "bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-600 shadow-slate-900/50"
              }`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest block text-amber-400/90">Победившая Команда</span>
                <span className="text-xl font-black uppercase tracking-wider block text-white mt-0.5">
                  {selectedPosterGame.winner_label === "Красные" ? "🔴 ПОБЕДА КРАСНЫХ" : "⬛ ПОБЕДА ЧЁРНЫХ"}
                </span>
                {selectedPosterGame.protocol_text && (
                  <p className="text-xs text-slate-300 italic mt-1 font-sans">
                    "{selectedPosterGame.protocol_text}"
                  </p>
                )}
              </div>

              {/* 10-Slot Results Matrix */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  <span>Состав и Итоги стола</span>
                  <span>Баллы / Δ ELO</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {(selectedPosterGame.slots || []).map((s) => {
                    const isWin = s.team === selectedPosterGame.winner_label;
                    const totalPts = (parseFloat(s.base_points as any) || 0) + 
                                     (parseFloat(s.bonus_points as any) || 0) + 
                                     (parseFloat(s.lh_points as any) || 0) + 
                                     (parseFloat(s.will_protocol_points as any) || 0) + 
                                     (parseFloat(s.will_opinion_points as any) || 0) + 
                                     (parseFloat(s.dc_points as any) || 0);

                    return (
                      <div
                        key={s.slot_num}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                          s.team === "Красные"
                            ? "bg-rose-950/20 border-rose-500/20"
                            : "bg-slate-900/60 border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-bold text-slate-400 shrink-0">
                            #{s.slot_num}
                          </span>
                          <div className="min-w-0">
                            <span className="font-bold text-white truncate block">
                              {s.nickname}
                            </span>
                            <span className={`text-[10px] font-bold block ${
                              s.team === "Красные" ? "text-rose-400" : "text-slate-400"
                            }`}>
                              {s.role}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-amber-400 text-xs block">
                            {totalPts.toFixed(1)} б.
                          </span>
                          <span className={`font-mono text-[10px] font-bold ${
                            (s.elo_change || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}>
                            {(s.elo_change || 0) >= 0 ? `+${s.elo_change}` : s.elo_change} ELO
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleCopyTelegram(selectedPosterGame)}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
                >
                  {copiedGameId === selectedPosterGame.id ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Скопировано в буфер!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Скопировать текст для TG/VK</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setSelectedPosterGame(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer border border-slate-700"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
