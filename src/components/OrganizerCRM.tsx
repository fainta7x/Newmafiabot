import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Kanban, Calendar, Wallet, UserCheck, Plus, CheckCircle, Clock, Trash2, 
  DollarSign, ArrowRight, ShieldCheck, AlertCircle, GripVertical, Check, Tag,
  Users, UserX, Search, MessageCircle, FileText, Filter, UserPlus, AlertTriangle, Sparkles
} from "lucide-react";
import { Player, Booking, GameEvening, OrganizerTask } from "../types.ts";
import Finance from "./Finance.tsx";
import Bookings from "./Bookings.tsx";

export default function OrganizerCRM() {
  const [subTab, setSubTab] = useState<"dnd_board" | "players_crm" | "evenings" | "tasks" | "finance">("dnd_board");
  
  // Data State
  const [players, setPlayers] = useState<Player[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [evenings, setEvenings] = useState<GameEvening[]>([]);
  const [tasks, setTasks] = useState<OrganizerTask[]>([]);
  const [loading, setLoading] = useState(true);

  // CRM Player Filter states
  const [crmFilter, setCrmFilter] = useState<"all" | "rookie_1game" | "regulars" | "debtors" | "inactive">("all");
  const [crmSearch, setCrmSearch] = useState("");
  const [editingNotePlayerId, setEditingNotePlayerId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");

  // Drag and Drop active states
  const [draggedPlayer, setDraggedPlayer] = useState<Player | Booking | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const [draggedTask, setDraggedTask] = useState<OrganizerTask | null>(null);
  const [dragOverTaskCol, setDragOverTaskCol] = useState<string | null>(null);

  // Modal states
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCategory, setTaskCategory] = useState<OrganizerTask["category"]>("Подготовка");
  const [taskPriority, setTaskPriority] = useState<OrganizerTask["priority"]>("medium");
  const [taskDueDate, setTaskDueDate] = useState("");

  const [showEveningModal, setShowEveningModal] = useState(false);
  const [eveningDate, setEveningDate] = useState("");
  const [eveningTitle, setEveningTitle] = useState("");
  const [eveningLocation, setEveningLocation] = useState("Зал #1 (Главный)");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, bRes, eRes, tRes] = await Promise.all([
        fetch("/api/players").then(r => r.json()),
        fetch("/api/bookings").then(r => r.json()),
        fetch("/api/evenings").then(r => r.json()),
        fetch("/api/tasks").then(r => r.json())
      ]);
      setPlayers(pRes);
      setBookings(bRes);
      setEvenings(eRes);
      setTasks(tRes);
    } catch (e) {
      console.error("Error fetching CRM data", e);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // PLAYER DRAG & DROP HANDLERS
  // ==========================================
  const handlePlayerDragStart = (e: React.DragEvent, item: Player | Booking, sourceCol: string) => {
    setDraggedPlayer(item);
    e.dataTransfer.setData("text/plain", JSON.stringify({ item, sourceCol }));
  };

  const handlePlayerDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverCol(colId);
  };

  const handlePlayerDragLeave = () => {
    setDragOverCol(null);
  };

  const movePlayerToColumn = async (playerNick: string, targetCol: "unbooked" | "ontime" | "late" | "paid" | "noshow") => {
    const p = players.find(pl => pl.nickname.toLowerCase() === playerNick.toLowerCase());
    if (!p) return;

    if (targetCol === "unbooked") {
      // Remove booking
      try {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: p.nickname, status: "Отмена" })
        });
        const updated = await res.json();
        setBookings(updated);
      } catch (e) {
        console.error("Error removing booking", e);
      }
    } else {
      const statusMap = {
        ontime: "Вовремя",
        late: "Позже",
        paid: "Вовремя",
        noshow: "Не пришел"
      } as const;

      const paymentStatusMap = {
        ontime: "В долг",
        late: "В долг",
        paid: "Оплачено",
        noshow: "Не пришел"
      } as const;

      try {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: p.user_id,
            nickname: p.nickname,
            status: statusMap[targetCol],
            payment_status: paymentStatusMap[targetCol],
            payment: targetCol === "noshow" ? 0 : 400
          })
        });
        const updated = await res.json();
        setBookings(updated);
      } catch (e) {
        console.error("Error updating booking status", e);
      }
    }
  };

  const handlePlayerDrop = async (e: React.DragEvent, targetCol: "unbooked" | "ontime" | "late" | "paid" | "noshow") => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggedPlayer) return;

    const nickname = "nickname" in draggedPlayer ? draggedPlayer.nickname : (draggedPlayer as Player).nickname;
    await movePlayerToColumn(nickname, targetCol);
    setDraggedPlayer(null);
  };

  // ==========================================
  // PLAYER CRM NOTES & ACTIONS
  // ==========================================
  const handleSavePlayerNote = async (playerId: number) => {
    try {
      const res = await fetch(`/api/players/${playerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteText })
      });
      const updated = await res.json();
      setPlayers(prev => prev.map(p => p.id === playerId ? updated : p));
      setEditingNotePlayerId(null);
      setNoteText("");
    } catch (e) {
      console.error("Error updating note", e);
    }
  };

  const handleChangePlayerTag = async (playerId: number, tag: string) => {
    try {
      const res = await fetch(`/api/players/${playerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag })
      });
      const updated = await res.json();
      setPlayers(prev => prev.map(p => p.id === playerId ? updated : p));
    } catch (e) {
      console.error("Error changing tag", e);
    }
  };

  // ==========================================
  // TASK KANBAN DRAG & DROP HANDLERS
  // ==========================================
  const handleTaskDragStart = (e: React.DragEvent, task: OrganizerTask) => {
    setDraggedTask(task);
  };

  const handleTaskDrop = async (e: React.DragEvent, targetStatus: "todo" | "in_progress" | "done") => {
    e.preventDefault();
    setDragOverTaskCol(null);
    if (!draggedTask) return;

    try {
      const res = await fetch(`/api/tasks/${draggedTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus })
      });
      const updated = await res.json();
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (e) {
      console.error("Error moving task", e);
    } finally {
      setDraggedTask(null);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle) return;

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          category: taskCategory,
          priority: taskPriority,
          due_date: taskDueDate,
          assigned_to: "Организатор"
        })
      });
      const newTask = await res.json();
      setTasks(prev => [newTask, ...prev]);
      setShowTaskModal(false);
      setTaskTitle("");
      setTaskDueDate("");
    } catch (e) {
      console.error("Error creating task", e);
    }
  };

  const handleCreateEvening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eveningDate) return;

    try {
      const res = await fetch("/api/evenings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: eveningDate,
          title: eveningTitle || `Пятничный мафия-вечер (${eveningDate})`,
          location: eveningLocation,
          status: "Запланирован"
        })
      });
      const newEve = await res.json();
      setEvenings(prev => [newEve, ...prev]);
      setShowEveningModal(false);
      setEveningDate("");
      setEveningTitle("");
    } catch (e) {
      console.error("Error creating evening", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  // Filter columns for Interactive Registration Board
  const bookedUserIds = bookings.map(b => b.user_id);
  const unbookedPlayers = players.filter(p => !bookedUserIds.includes(p.user_id));
  const onTimeBookings = bookings.filter(b => b.status === "Вовремя" && b.payment_status !== "Оплачено");
  const lateBookings = bookings.filter(b => b.status === "Позже" && b.payment_status !== "Оплачено");
  const paidBookings = bookings.filter(b => b.payment_status === "Оплачено");
  const noShowBookings = bookings.filter(b => b.status === "Не пришел");

  // CRM Player Directory Filtering
  const filteredCrmPlayers = players.filter(p => {
    const matchesSearch = p.nickname.toLowerCase().includes(crmSearch.toLowerCase()) || 
                          p.full_name.toLowerCase().includes(crmSearch.toLowerCase()) ||
                          p.username.toLowerCase().includes(crmSearch.toLowerCase());
    if (!matchesSearch) return false;

    if (crmFilter === "rookie_1game") {
      return p.games_played === 1 || p.tag === "Новичок";
    }
    if (crmFilter === "regulars") {
      return p.games_played >= 5 || p.tag === "Регуляр";
    }
    if (crmFilter === "debtors") {
      return p.debt < 0;
    }
    if (crmFilter === "inactive") {
      return p.games_played === 0;
    }
    return true;
  });

  const totalRookies = players.filter(p => p.games_played === 1 || p.tag === "Новичок").length;
  const totalRegulars = players.filter(p => p.games_played >= 5).length;
  const totalDebtorsCount = players.filter(p => p.debt < 0).length;

  return (
    <div className="space-y-6">
      {/* Top Overview Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Всего Игроков</span>
            <span className="text-xl font-black text-white font-mono mt-0.5">{players.length} чел</span>
          </div>
          <Users className="w-7 h-7 text-sky-500/80" />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Записаны сегодня</span>
            <span className="text-xl font-black text-white font-mono mt-0.5">{bookings.filter(b => b.status !== "Не пришел" && b.status !== "Отмена").length} чел</span>
          </div>
          <UserCheck className="w-7 h-7 text-rose-500/80" />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Новички (1 игра)</span>
            <span className="text-xl font-black text-amber-400 font-mono mt-0.5">{totalRookies} чел</span>
          </div>
          <Sparkles className="w-7 h-7 text-amber-500/80" />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Не пришли (Прогул)</span>
            <span className="text-xl font-black text-rose-400 font-mono mt-0.5">{noShowBookings.length} чел</span>
          </div>
          <UserX className="w-7 h-7 text-rose-500/80" />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between col-span-2 lg:col-span-1">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Должники Клуба</span>
            <span className="text-xl font-black text-rose-400 font-mono mt-0.5">{totalDebtorsCount} чел</span>
          </div>
          <AlertTriangle className="w-7 h-7 text-rose-500/80" />
        </div>
      </div>

      {/* CRM Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSubTab("dnd_board")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              subTab === "dnd_board"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <GripVertical className="w-4 h-4 text-rose-300" /> 1. Интерактивная Запись (Drag & Drop)
          </button>

          <button
            onClick={() => setSubTab("players_crm")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              subTab === "players_crm"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Users className="w-4 h-4 text-sky-400" /> 2. База Клиентов Клуба (CRM)
          </button>

          <button
            onClick={() => setSubTab("evenings")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              subTab === "evenings"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Calendar className="w-4 h-4" /> 3. Расписание Вечеров
          </button>

          <button
            onClick={() => setSubTab("tasks")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              subTab === "tasks"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Kanban className="w-4 h-4 text-amber-400" /> 4. Задачи Организатора
          </button>

          <button
            onClick={() => setSubTab("finance")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              subTab === "finance"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Wallet className="w-4 h-4 text-emerald-400" /> 5. Касса & Финансы
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: DRAG & DROP PLAYER REGISTRATION BOARD WITH 'НЕ ПРИШЕЛ' */}
      {subTab === "dnd_board" && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <h3 className="text-sm font-display font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-rose-500" /> Доска распределения и фиксации явок игроков
              </h3>
              <p className="text-xs text-slate-400">
                Перетаскивайте игроков мышкой. Включает колонку <strong className="text-rose-400">«Не пришел / Прогул»</strong> для учета неявок.
              </p>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Интерактивный DND активен
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* COLUMN 1: UNBOOKED PLAYERS */}
            <div
              onDragOver={(e) => handlePlayerDragOver(e, "unbooked")}
              onDragLeave={handlePlayerDragLeave}
              onDrop={(e) => handlePlayerDrop(e, "unbooked")}
              className={`bg-slate-900/30 border rounded-2xl p-3 flex flex-col min-h-[420px] transition-all ${
                dragOverCol === "unbooked" ? "border-rose-500 bg-rose-950/20 ring-2 ring-rose-500/30" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" /> Свободные
                </span>
                <span className="bg-slate-950 text-slate-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-800">
                  {unbookedPlayers.length}
                </span>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto max-h-[500px] pr-1">
                {unbookedPlayers.map(p => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(e) => handlePlayerDragStart(e, p, "unbooked")}
                    className="p-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl cursor-grab active:cursor-grabbing shadow-sm transition-all hover:border-slate-700 group flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="w-3.5 h-3.5 text-slate-600 group-hover:text-rose-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-white block truncate">{p.nickname}</span>
                        <span className="text-[9px] text-slate-500 block font-mono">{p.elo} ELO</span>
                      </div>
                    </div>

                    <button
                      onClick={() => movePlayerToColumn(p.nickname, "ontime")}
                      className="text-[9px] font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-1.5 py-0.5 rounded shrink-0 cursor-pointer"
                      title="Записать вовремя"
                    >
                      + Записать
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMN 2: BOOKED ON TIME */}
            <div
              onDragOver={(e) => handlePlayerDragOver(e, "ontime")}
              onDragLeave={handlePlayerDragLeave}
              onDrop={(e) => handlePlayerDrop(e, "ontime")}
              className={`bg-slate-900/30 border rounded-2xl p-3 flex flex-col min-h-[420px] transition-all ${
                dragOverCol === "ontime" ? "border-rose-500 bg-rose-950/20 ring-2 ring-rose-500/30" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-rose-500" /> Вовремя
                </span>
                <span className="bg-rose-950/60 text-rose-300 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/30">
                  {onTimeBookings.length}
                </span>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto max-h-[500px] pr-1">
                {onTimeBookings.map(b => (
                  <div
                    key={b.user_id}
                    draggable
                    onDragStart={(e) => handlePlayerDragStart(e, b, "ontime")}
                    className="p-2.5 bg-slate-950 hover:bg-slate-900 border border-rose-500/30 rounded-xl cursor-grab active:cursor-grabbing shadow-sm transition-all group space-y-1.5"
                  >
                    <div className="flex items-center justify-between min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <GripVertical className="w-3.5 h-3.5 text-rose-500/60 shrink-0" />
                        <span className="text-xs font-bold text-white truncate">{b.nickname}</span>
                      </div>
                      <span className="text-[9px] text-rose-400 font-mono font-bold">400 ₽</span>
                    </div>

                    <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-900">
                      <button
                        onClick={() => movePlayerToColumn(b.nickname, "paid")}
                        className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        Оплата✓
                      </button>
                      <button
                        onClick={() => movePlayerToColumn(b.nickname, "noshow")}
                        className="text-[9px] font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-1.5 py-0.5 rounded cursor-pointer"
                        title="Отметить прогул"
                      >
                        Не пришел
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMN 3: BOOKED LATE */}
            <div
              onDragOver={(e) => handlePlayerDragOver(e, "late")}
              onDragLeave={handlePlayerDragLeave}
              onDrop={(e) => handlePlayerDrop(e, "late")}
              className={`bg-slate-900/30 border rounded-2xl p-3 flex flex-col min-h-[420px] transition-all ${
                dragOverCol === "late" ? "border-amber-500 bg-amber-950/20 ring-2 ring-amber-500/30" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" /> Позже
                </span>
                <span className="bg-amber-950/60 text-amber-300 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  {lateBookings.length}
                </span>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto max-h-[500px] pr-1">
                {lateBookings.map(b => (
                  <div
                    key={b.user_id}
                    draggable
                    onDragStart={(e) => handlePlayerDragStart(e, b, "late")}
                    className="p-2.5 bg-slate-950 hover:bg-slate-900 border border-amber-500/30 rounded-xl cursor-grab active:cursor-grabbing shadow-sm transition-all group space-y-1.5"
                  >
                    <div className="flex items-center justify-between min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <GripVertical className="w-3.5 h-3.5 text-amber-500/60 shrink-0" />
                        <span className="text-xs font-bold text-white truncate">{b.nickname}</span>
                      </div>
                      <span className="text-[9px] text-amber-400 font-mono font-bold">300 ₽</span>
                    </div>

                    <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-900">
                      <button
                        onClick={() => movePlayerToColumn(b.nickname, "paid")}
                        className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        Оплата✓
                      </button>
                      <button
                        onClick={() => movePlayerToColumn(b.nickname, "noshow")}
                        className="text-[9px] font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        Не пришел
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMN 4: CONFIRMED & PAID */}
            <div
              onDragOver={(e) => handlePlayerDragOver(e, "paid")}
              onDragLeave={handlePlayerDragLeave}
              onDrop={(e) => handlePlayerDrop(e, "paid")}
              className={`bg-slate-900/30 border rounded-2xl p-3 flex flex-col min-h-[420px] transition-all ${
                dragOverCol === "paid" ? "border-emerald-500 bg-emerald-950/20 ring-2 ring-emerald-500/30" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Оплачено
                </span>
                <span className="bg-emerald-950/60 text-emerald-300 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {paidBookings.length}
                </span>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto max-h-[500px] pr-1">
                {paidBookings.map(b => (
                  <div
                    key={b.user_id}
                    draggable
                    onDragStart={(e) => handlePlayerDragStart(e, b, "paid")}
                    className="p-2.5 bg-slate-950 hover:bg-slate-900 border border-emerald-500/40 rounded-xl cursor-grab active:cursor-grabbing shadow-sm transition-all group flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="w-3.5 h-3.5 text-emerald-500/60 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-white block truncate">{b.nickname}</span>
                        <span className="text-[9px] text-emerald-400 block font-mono">Оплата✓</span>
                      </div>
                    </div>

                    <button
                      onClick={() => movePlayerToColumn(b.nickname, "unbooked")}
                      className="text-[10px] font-bold text-slate-500 hover:text-rose-400 px-1 py-0.5 rounded cursor-pointer"
                      title="Снять запись"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMN 5: NO-SHOW / НЕ ПРИШЕЛ */}
            <div
              onDragOver={(e) => handlePlayerDragOver(e, "noshow")}
              onDragLeave={handlePlayerDragLeave}
              onDrop={(e) => handlePlayerDrop(e, "noshow")}
              className={`bg-slate-900/30 border rounded-2xl p-3 flex flex-col min-h-[420px] transition-all ${
                dragOverCol === "noshow" ? "border-rose-600 bg-rose-950/40 ring-2 ring-rose-500/40" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UserX className="w-3.5 h-3.5 text-rose-500" /> Не пришел ❌
                </span>
                <span className="bg-rose-950 text-rose-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/40">
                  {noShowBookings.length}
                </span>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto max-h-[500px] pr-1">
                {noShowBookings.length === 0 ? (
                  <p className="text-[10px] text-slate-600 italic text-center py-8">Перетащите сюда тех, кто записался, но не пришел</p>
                ) : (
                  noShowBookings.map(b => (
                    <div
                      key={b.user_id}
                      draggable
                      onDragStart={(e) => handlePlayerDragStart(e, b, "noshow")}
                      className="p-2.5 bg-rose-950/20 border border-rose-500/40 rounded-xl cursor-grab active:cursor-grabbing shadow-sm transition-all group flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GripVertical className="w-3.5 h-3.5 text-rose-500/60 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-rose-200 block truncate">{b.nickname}</span>
                          <span className="text-[9px] text-rose-400/80 block font-mono">Прогул</span>
                        </div>
                      </div>

                      <button
                        onClick={() => movePlayerToColumn(b.nickname, "ontime")}
                        className="text-[9px] font-bold text-slate-400 hover:text-white bg-slate-900 px-1.5 py-0.5 rounded cursor-pointer"
                        title="Вернуть в запись"
                      >
                        Вернуть
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: FULL CLIENT CRM & PLAYER DIRECTORY */}
      {subTab === "players_crm" && (
        <div className="space-y-6">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-sky-400" /> База Клиентов Клуба (CRM)
                </h3>
                <p className="text-xs text-slate-400">
                  Управление контактами, отслеживание новичков (1 игра), постоянников, LTV дохода и личных заметок
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Поиск по нику или имени..."
                  value={crmSearch}
                  onChange={e => setCrmSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
              <button
                onClick={() => setCrmFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  crmFilter === "all"
                    ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                Все игроки ({players.length})
              </button>

              <button
                onClick={() => setCrmFilter("rookie_1game")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  crmFilter === "rookie_1game"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Новички (1 игра) ({totalRookies})
              </button>

              <button
                onClick={() => setCrmFilter("regulars")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  crmFilter === "regulars"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Постоянные клиенты ({totalRegulars})
              </button>

              <button
                onClick={() => setCrmFilter("debtors")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  crmFilter === "debtors"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/20"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Должники ({totalDebtorsCount})
              </button>
            </div>
          </div>

          {/* CRM Players List Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCrmPlayers.map(p => (
              <div key={p.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition-all shadow-lg">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-700 flex items-center justify-center font-black text-rose-400 text-lg shadow-inner">
                      {p.nickname.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-md font-bold text-white">{p.nickname}</h4>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          p.games_played === 1
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : p.tag === "Регуляр" || p.games_played >= 5
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-slate-950 text-slate-400 border-slate-800"
                        }`}>
                          {p.games_played === 1 ? "🐣 Новичок (1 игра)" : p.tag || "Игрок"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{p.full_name} {p.username && `• @${p.username}`}</p>
                    </div>
                  </div>

                  {/* ELO & Debt Tag */}
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-amber-400 block">{p.elo} ELO</span>
                    <span className={`text-[10px] font-bold font-mono mt-0.5 block ${
                      p.debt < 0 ? "text-rose-400" : "text-emerald-400"
                    }`}>
                      {p.debt < 0 ? `Долг: ${p.debt} ₽` : "Без долгов"}
                    </span>
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-850 text-center">
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Сыграно игр</span>
                    <span className="text-sm font-bold text-white font-mono mt-0.5 block">{p.games_played}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Победы / Винрейт</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5 block">
                      {p.games_won} ({p.games_played ? Math.round((p.games_won / p.games_played) * 100) : 0}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Выручка LTV</span>
                    <span className="text-sm font-bold text-sky-400 font-mono mt-0.5 block">{p.total_paid || 0} ₽</span>
                  </div>
                </div>

                {/* Organizer Note Section */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-amber-400" /> Заметка организатора:</span>
                    {editingNotePlayerId !== p.id && (
                      <button
                        onClick={() => { setEditingNotePlayerId(p.id); setNoteText(p.notes || ""); }}
                        className="text-sky-400 hover:underline cursor-pointer lowercase"
                      >
                        изменить
                      </button>
                    )}
                  </div>

                  {editingNotePlayerId === p.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Заметка про игрока..."
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                      />
                      <button
                        onClick={() => handleSavePlayerNote(p.id)}
                        className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-lg cursor-pointer"
                      >
                        ОК
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300 italic bg-slate-950/40 p-2 rounded-lg border border-slate-850">
                      {p.notes || "Нет заметок"}
                    </p>
                  )}
                </div>

                {/* Actions footer */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-850">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase mr-1">Тег:</span>
                    {["Регуляр", "Новичок", "VIP"].map(t => (
                      <button
                        key={t}
                        onClick={() => handleChangePlayerTag(p.id, t)}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded cursor-pointer ${
                          p.tag === t
                            ? "bg-rose-600 text-white"
                            : "bg-slate-950 text-slate-500 hover:text-slate-300 border border-slate-800"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {p.username && (
                    <a
                      href={`https://t.me/${p.username.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
                    >
                      <MessageCircle className="w-3 h-3" /> Написать в TG
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: EVENINGS & CALENDAR */}
      {subTab === "evenings" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-rose-500" /> Расписание Мафия-Вечеров
              </h3>
              <p className="text-xs text-slate-400">Управление игровыми сессиями и сборами</p>
            </div>

            <button
              onClick={() => setShowEveningModal(true)}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-4 py-2 rounded-xl uppercase tracking-wider flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Создать вечер
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {evenings.map(eve => (
              <div key={eve.id} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3 relative">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider block">
                      {eve.date}
                    </span>
                    <h4 className="text-md font-bold text-white mt-0.5">{eve.title}</h4>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                    eve.status === "Идет сейчас"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse"
                      : "bg-slate-950 text-slate-400 border-slate-800"
                  }`}>
                    {eve.status}
                  </span>
                </div>

                <p className="text-xs text-slate-400">Локация: {eve.location || "Зал #1"}</p>
                {eve.notes && <p className="text-xs text-slate-500 italic">📌 {eve.notes}</p>}
              </div>
            ))}
          </div>

          {/* Standard Bookings Component for deeper evening controls */}
          <Bookings />
        </div>
      )}

      {/* SUB-TAB 4: ORGANIZER TASK KANBAN */}
      {subTab === "tasks" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                <Kanban className="w-5 h-5 text-amber-500" /> Задачи Организатора Вечера
              </h3>
              <p className="text-xs text-slate-400">Планирование покупок, залов, инвентаря и взносов</p>
            </div>

            <button
              onClick={() => setShowTaskModal(true)}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-xl uppercase tracking-wider flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Добавить задачу
            </button>
          </div>

          {/* Task Kanban 3 Columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* TODO COLUMN */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverTaskCol("todo"); }}
              onDragLeave={() => setDragOverTaskCol(null)}
              onDrop={(e) => handleTaskDrop(e, "todo")}
              className={`bg-slate-900/30 border rounded-2xl p-4 flex flex-col min-h-[400px] transition-all ${
                dragOverTaskCol === "todo" ? "border-amber-500 bg-amber-950/20" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">К выполнению</span>
                <span className="bg-slate-950 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-800">
                  {tasks.filter(t => t.status === "todo").length}
                </span>
              </div>

              <div className="space-y-3 flex-1">
                {tasks.filter(t => t.status === "todo").map(t => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => handleTaskDragStart(e, t)}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-grab active:cursor-grabbing space-y-2 hover:border-slate-700 transition-all shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold text-white leading-snug">{t.title}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                        t.priority === "high" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-slate-900 text-slate-400 border-slate-800"
                      }`}>
                        {t.priority}
                      </span>
                    </div>
                    {t.description && <p className="text-[11px] text-slate-400 leading-tight">{t.description}</p>}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[10px] text-slate-500">
                      <span>🏷️ {t.category}</span>
                      <span>{t.due_date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* IN PROGRESS COLUMN */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverTaskCol("in_progress"); }}
              onDragLeave={() => setDragOverTaskCol(null)}
              onDrop={(e) => handleTaskDrop(e, "in_progress")}
              className={`bg-slate-900/30 border rounded-2xl p-4 flex flex-col min-h-[400px] transition-all ${
                dragOverTaskCol === "in_progress" ? "border-amber-500 bg-amber-950/20" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">В процессе</span>
                <span className="bg-amber-950/60 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  {tasks.filter(t => t.status === "in_progress").length}
                </span>
              </div>

              <div className="space-y-3 flex-1">
                {tasks.filter(t => t.status === "in_progress").map(t => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => handleTaskDragStart(e, t)}
                    className="p-3 bg-slate-950 border border-amber-500/30 rounded-xl cursor-grab active:cursor-grabbing space-y-2 hover:border-amber-500/50 transition-all shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold text-white leading-snug">{t.title}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 bg-amber-500/10 text-amber-400 border-amber-500/20">
                        {t.priority}
                      </span>
                    </div>
                    {t.description && <p className="text-[11px] text-slate-400 leading-tight">{t.description}</p>}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[10px] text-slate-500">
                      <span>🏷️ {t.category}</span>
                      <span>{t.due_date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* DONE COLUMN */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverTaskCol("done"); }}
              onDragLeave={() => setDragOverTaskCol(null)}
              onDrop={(e) => handleTaskDrop(e, "done")}
              className={`bg-slate-900/30 border rounded-2xl p-4 flex flex-col min-h-[400px] transition-all ${
                dragOverTaskCol === "done" ? "border-emerald-500 bg-emerald-950/20" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Завершено</span>
                <span className="bg-emerald-950/60 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {tasks.filter(t => t.status === "done").length}
                </span>
              </div>

              <div className="space-y-3 flex-1">
                {tasks.filter(t => t.status === "done").map(t => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => handleTaskDragStart(e, t)}
                    className="p-3 bg-slate-950 border border-emerald-500/30 rounded-xl cursor-grab active:cursor-grabbing space-y-2 opacity-80 transition-all shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold text-slate-300 line-through leading-snug">{t.title}</span>
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: CASHIER & FINANCE */}
      {subTab === "finance" && (
        <Finance />
      )}

      {/* CREATE TASK MODAL */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-md font-display font-bold text-white uppercase tracking-wider">Новая Задача Организатора</h3>
            
            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Название задачи</label>
                <input
                  type="text"
                  required
                  placeholder="Например: Заказать пиццу и воду"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Категория</label>
                  <select
                    value={taskCategory}
                    onChange={e => setTaskCategory(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="Подготовка">Подготовка</option>
                    <option value="Закупки">Закупки</option>
                    <option value="Оплата/Касса">Оплата/Касса</option>
                    <option value="Реквизит">Реквизит</option>
                    <option value="Прочее">Прочее</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Приоритет</label>
                  <select
                    value={taskPriority}
                    onChange={e => setTaskPriority(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий 🔥</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Срок выполнения</label>
                <input
                  type="text"
                  placeholder="Пятница 18:00"
                  value={taskDueDate}
                  onChange={e => setTaskDueDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="flex-1 bg-slate-800 text-slate-300 rounded-xl py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2 text-xs font-bold uppercase tracking-wider shadow-lg cursor-pointer"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE EVENING MODAL */}
      {showEveningModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-md font-display font-bold text-white uppercase tracking-wider">Новый Игровой Вечер</h3>

            <form onSubmit={handleCreateEvening} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Дата вечера</label>
                <input
                  type="text"
                  required
                  placeholder="01.08.2026"
                  value={eveningDate}
                  onChange={e => setEveningDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Название вечера</label>
                <input
                  type="text"
                  placeholder="Пятничный мафия-вечер"
                  value={eveningTitle}
                  onChange={e => setEveningTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Локация / Зал</label>
                <input
                  type="text"
                  value={eveningLocation}
                  onChange={e => setEveningLocation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEveningModal(false)}
                  className="flex-1 bg-slate-800 text-slate-300 rounded-xl py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white rounded-xl py-2 text-xs font-bold uppercase tracking-wider shadow-lg cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
