import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LayoutDashboard, Users, Play, CalendarRange, Coins, ShieldCheck, HelpCircle, Database } from "lucide-react";
import Dashboard from "./components/Dashboard.tsx";
import Players from "./components/Players.tsx";
import GameWizard from "./components/GameWizard.tsx";
import Bookings from "./components/Bookings.tsx";
import Shop from "./components/Shop.tsx";
import DatabaseEditor from "./components/DatabaseEditor.tsx";

type Tab = "dashboard" | "players" | "game" | "bookings" | "shop" | "db_editor";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const navigationItems = [
    { id: "dashboard", label: "Обзор Клуба", icon: LayoutDashboard },
    { id: "players", label: "Игроки & Рейтинги", icon: Users },
    { id: "game", label: "Судейский пульт", icon: Play },
    { id: "bookings", label: "Запись на игры", icon: CalendarRange },
    { id: "shop", label: "Магазин 🪙", icon: Coins },
    { id: "db_editor", label: "Редактор БД ⚙️", icon: Database },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between bg-slate-900/90 border-b border-slate-800/60 p-4 sticky top-0 z-30 backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center text-sm font-bold shadow-neu-flat text-white shrink-0">
            M
          </div>
          <span className="font-display font-black text-xs text-white block uppercase tracking-wider">
            MAFIA CLUB CRM
          </span>
        </div>
        <span className="text-[10px] text-rose-400 font-mono font-bold uppercase tracking-wider bg-slate-950 border border-slate-850 px-2.5 py-1 rounded">
          {navigationItems.find((item) => item.id === activeTab)?.label}
        </span>
      </header>

      {/* Sidebar Navigation (Desktop only) */}
      <aside className="hidden md:flex w-full md:w-64 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800/40 flex-col justify-between shrink-0 p-5 shadow-neu-flat z-10">
        <div>
          {/* Logo / Club Brand */}
          <div className="p-4 mb-6 bg-slate-950/40 border border-slate-800/60 rounded-3xl flex items-center gap-3.5 shadow-neu-inset">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 flex items-center justify-center text-xl font-bold shadow-neu-flat text-white shrink-0">
              M
            </div>
            <div>
              <span className="font-display font-black text-xs text-white block uppercase tracking-wider">
                MAFIA CLUB CRM
              </span>
              <span className="text-[9px] text-rose-500 font-mono font-bold uppercase tracking-wider block mt-0.5">
                Neumorph Portal
              </span>
            </div>
          </div>

          {/* Nav List with Neumorphic interaction */}
          <nav className="space-y-3">
            {navigationItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`w-full flex items-center gap-3.5 px-4.5 py-3.5 rounded-2xl text-xs font-bold transition-all relative cursor-pointer uppercase tracking-wider ${
                    isActive
                      ? "text-rose-400 bg-slate-900 border border-rose-500/10 shadow-neu-inset"
                      : "text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-900 shadow-neu-flat hover:shadow-neu-inset"
                  }`}
                >
                  <item.icon className={`w-4 h-4 transition-colors ${isActive ? "text-rose-500" : "text-slate-500"}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer/Developer info */}
        <div className="mt-8 md:mt-0 hidden md:block">
          <div className="bg-slate-950/40 p-4 rounded-3xl border border-slate-800/60 flex items-center gap-3 shadow-neu-inset">
            <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-300 block uppercase tracking-wider">Система CRM</span>
              <span className="text-[9px] font-mono text-slate-500 block truncate mt-0.5">NEUMORPH v1.5.0</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-800/60 flex justify-around p-2 z-30 pb-safe shadow-2xl backdrop-blur-md">
        {navigationItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as Tab)}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all rounded-xl gap-1 cursor-pointer ${
                isActive ? "text-rose-400 font-bold" : "text-slate-500 font-medium"
              }`}
            >
              <item.icon className={`w-4 h-4 transition-all ${isActive ? "text-rose-500 scale-110" : "text-slate-500 hover:text-slate-400"}`} />
              <span className="text-[8px] tracking-tight truncate max-w-[62px] uppercase font-bold font-mono">
                {item.id === "dashboard" ? "Обзор" : item.id === "players" ? "Игроки" : item.id === "game" ? "Пульт" : item.id === "bookings" ? "Запись" : item.id === "shop" ? "Магазин" : "БД"}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Main Content Pane */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto space-y-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "dashboard" && <Dashboard />}
            {activeTab === "players" && <Players />}
            {activeTab === "game" && <GameWizard />}
            {activeTab === "bookings" && <Bookings />}
            {activeTab === "shop" && <Shop />}
            {activeTab === "db_editor" && <DatabaseEditor />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
