import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User, Kanban, Play, Database, LayoutDashboard, ShieldCheck } from "lucide-react";
import Dashboard from "./components/Dashboard.tsx";
import PlayerWorkspace from "./components/PlayerWorkspace.tsx";
import OrganizerCRM from "./components/OrganizerCRM.tsx";
import GameWizard from "./components/GameWizard.tsx";
import DatabaseEditor from "./components/DatabaseEditor.tsx";

type Tab = "dashboard" | "player_workspace" | "organizer_crm" | "game_referee" | "admin_db";
type UserRoleMode = "PLAYER" | "ORGANIZER";

export default function App() {
  const [roleMode, setRoleMode] = useState<UserRoleMode>("ORGANIZER");
  const [activeTab, setActiveTab] = useState<Tab>("organizer_crm");

  // Navigation Items
  const allNavigationItems = [
    { id: "player_workspace", label: "1. Личный Кабинет & Протоколы", short: "Игрок", icon: User, roles: ["PLAYER", "ORGANIZER"] },
    { id: "organizer_crm", label: "2. CRM Организатора", short: "CRM", icon: Kanban, badge: "DND", roles: ["ORGANIZER"] },
    { id: "game_referee", label: "3. Проведение Игр", short: "Пульт", icon: Play, roles: ["ORGANIZER"] },
    { id: "admin_db", label: "4. Админ & БД", short: "Админ", icon: Database, roles: ["ORGANIZER"] },
    { id: "dashboard", label: "0. Обзор Клуба", short: "Обзор", icon: LayoutDashboard, roles: ["PLAYER", "ORGANIZER"] },
  ];

  const navigationItems = allNavigationItems.filter(item => item.roles.includes(roleMode));

  const handleRoleSwitch = (newRole: UserRoleMode) => {
    setRoleMode(newRole);
    if (newRole === "PLAYER" && !["player_workspace", "dashboard"].includes(activeTab)) {
      setActiveTab("player_workspace");
    } else if (newRole === "ORGANIZER" && activeTab === "player_workspace") {
      setActiveTab("organizer_crm");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between bg-slate-900/90 border-b border-slate-800/60 p-3 sticky top-0 z-30 backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center text-sm font-bold shadow-neu-flat text-white shrink-0">
            M
          </div>
          <div>
            <span className="font-display font-black text-xs text-white block uppercase tracking-wider">
              MAFIA CRM
            </span>
          </div>
        </div>

        {/* Mobile Role Switcher Pill */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => handleRoleSwitch("PLAYER")}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
              roleMode === "PLAYER" ? "bg-rose-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            👤 Игрок
          </button>
          <button
            onClick={() => handleRoleSwitch("ORGANIZER")}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
              roleMode === "ORGANIZER" ? "bg-rose-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            👑 Ведущий
          </button>
        </div>
      </header>

      {/* Sidebar Navigation (Desktop only) */}
      <aside className="hidden md:flex w-full md:w-64 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800/40 flex-col justify-between shrink-0 p-5 shadow-neu-flat z-10">
        <div>
          {/* Logo / Club Brand */}
          <div className="p-4 mb-4 bg-slate-950/40 border border-slate-800/60 rounded-3xl flex items-center gap-3.5 shadow-neu-inset">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 flex items-center justify-center text-xl font-bold shadow-neu-flat text-white shrink-0">
              M
            </div>
            <div>
              <span className="font-display font-black text-xs text-white block uppercase tracking-wider">
                MAFIA CLUB CRM
              </span>
              <span className="text-[9px] text-rose-500 font-mono font-bold uppercase tracking-wider block mt-0.5">
                Pro Manager v2.5
              </span>
            </div>
          </div>

          {/* Role Switcher Box */}
          <div className="mb-5 bg-slate-950/80 border border-slate-800 rounded-2xl p-2.5 space-y-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block px-1">
              Режим Интерфейса:
            </span>
            <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => handleRoleSwitch("PLAYER")}
                className={`py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  roleMode === "PLAYER"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                👤 Игрок
              </button>              <button
                onClick={() => handleRoleSwitch("ORGANIZER")}
                className={`py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  roleMode === "ORGANIZER"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                👑 Ведущий
              </button>
            </div>
          </div>

          {/* Nav List with 4 Main Panels */}
          <nav className="space-y-2.5">
            {navigationItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all relative cursor-pointer uppercase tracking-wider ${
                    isActive
                      ? "text-rose-400 bg-slate-950 border border-rose-500/20 shadow-neu-inset"
                      : "text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-900 shadow-neu-flat hover:shadow-neu-inset"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={`w-4 h-4 transition-colors ${isActive ? "text-rose-500" : "text-slate-500"}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded-md">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer info */}
        <div className="mt-8 md:mt-0 hidden md:block">
          <div className="bg-slate-950/40 p-4 rounded-3xl border border-slate-800/60 flex items-center gap-3 shadow-neu-inset">
            <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-300 block uppercase tracking-wider">4-Panel Workspace</span>
              <span className="text-[9px] font-mono text-slate-500 block truncate mt-0.5">Interactive CRM v2.0</span>
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
                {item.short}
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
            {activeTab === "organizer_crm" && <OrganizerCRM />}
            {activeTab === "player_workspace" && <PlayerWorkspace />}
            {activeTab === "game_referee" && <GameWizard />}
            {activeTab === "admin_db" && <DatabaseEditor />}
            {activeTab === "dashboard" && <Dashboard />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
