import React from "react";
import { Shield, Info, Heart, Star } from "lucide-react";
import { Player } from "../../types.js";
import { ActivePlayerState } from "./types.js";
import { PistolIcon, MafiaHatIcon } from "./Icons.js";

interface SetupPhaseProps {
  players: Player[];
  judgeId: number;
  setJudgeId: (id: number) => void;
  activePlayers: ActivePlayerState[];
  handleAutoFillSetupPlayers: () => void;
  handleAutoFillSetupRoles: () => void;
  handleSelectSetupPlayer: (slotNum: number, userId: number) => void;
  handleSelectSetupRole: (slotNum: number, role: "Мирный" | "Шериф" | "Мафия" | "Дон") => void;
  onCancel: () => void;
  validateSetupAndStart: () => void;
}

export default function SetupPhase({
  players,
  judgeId,
  setJudgeId,
  activePlayers,
  handleAutoFillSetupPlayers,
  handleAutoFillSetupRoles,
  handleSelectSetupPlayer,
  handleSelectSetupRole,
  onCancel,
  validateSetupAndStart,
}: SetupPhaseProps) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 gap-2">
        <div>
          <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-rose-500" /> Живое Судейство ФСМ
          </h2>
          <p className="text-[10px] text-slate-500">Укажите рассадку игроков и роли для ведения лога</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAutoFillSetupPlayers}
            className="bg-slate-880 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
          >
            👥 Авто-игроки
          </button>
          <button
            onClick={handleAutoFillSetupRoles}
            className="bg-slate-880 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
          >
            🎭 Авто-роли ФСМ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/40 border border-slate-850 rounded-lg">
        <div className="space-y-1">
          <label className="text-[9px] text-slate-500 font-bold uppercase block">Судья Вечера / Ведущий</label>
          <select
            value={judgeId}
            onChange={(e) => setJudgeId(parseInt(e.target.value))}
            className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
          >
            <option value={0}>-- Выбрать судью --</option>
            {players.map((p) => (
              <option key={p.id} value={p.user_id}>
                {p.nickname} ({p.full_name})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center text-[10px] text-slate-500 leading-snug pl-1">
          <Info className="w-3.5 h-3.5 text-rose-500 mr-1.5 flex-shrink-0" />
          Рассадите 10 игроков для авто-расчета Эло и ачивок.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {activePlayers.map((s) => {
          const uids = activePlayers
            .filter((p) => p.slot_num !== s.slot_num && p.user_id > 0)
            .map((p) => p.user_id);
          if (judgeId > 0) uids.push(judgeId);
          const avail = players.filter((p) => !uids.includes(p.user_id));

          const isMir = s.role === "Мирный";
          const isSheriff = s.role === "Шериф";
          const isMafia = s.role === "Мафия";

          return (
            <div
              key={s.slot_num}
              className={`p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3 ${
                isMir
                  ? "bg-rose-950/5 border-rose-900/25 hover:border-rose-800/60"
                  : isSheriff
                  ? "bg-emerald-950/5 border-emerald-900/25 hover:border-emerald-800/60"
                  : isMafia
                  ? "bg-slate-900/10 border-slate-800/55 hover:border-slate-600"
                  : "bg-purple-950/5 border-purple-900/25 hover:border-purple-800/60"
              }`}
            >
              <div className="flex justify-between items-center">
                <span
                  className={`w-6 h-6 rounded-lg font-mono font-black text-xs flex items-center justify-center border transition-all ${
                    isMir
                      ? "bg-rose-950 border-rose-800 text-rose-400"
                      : isSheriff
                      ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                      : isMafia
                      ? "bg-slate-200 border-slate-400 text-slate-950 shadow-inner"
                      : "bg-purple-950 border-purple-800 text-purple-400"
                  }`}
                >
                  {s.slot_num}
                </span>
                <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">Место №{s.slot_num}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] text-slate-500 font-bold uppercase block">Никнейм игрока</label>
                <select
                  value={s.user_id}
                  onChange={(e) => handleSelectSetupPlayer(s.slot_num, parseInt(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value={0}>-- Выбрать игрока --</option>
                  {avail.map((p) => (
                    <option key={p.id} value={p.user_id}>
                      {p.nickname} (Рейтинг: {p.elo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] text-slate-500 font-bold uppercase block">Роль игрока</label>
                <div className="grid grid-cols-4 gap-1">
                  <button
                    type="button"
                    onClick={() => handleSelectSetupRole(s.slot_num, "Мирный")}
                    className={`py-1.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      s.role === "Мирный"
                        ? "bg-rose-500/15 border-rose-500/50 text-rose-500 scale-105 shadow-md shadow-rose-500/5"
                        : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400 hover:bg-slate-900"
                    }`}
                    title="Красный (Мирный)"
                  >
                    <Heart className={`w-4 h-4 ${s.role === "Мирный" ? "fill-current" : ""}`} />
                    <span className="text-[8px] font-bold">Мир</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectSetupRole(s.slot_num, "Шериф")}
                    className={`py-1.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      s.role === "Шериф"
                        ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400 scale-105 shadow-md shadow-emerald-500/5"
                        : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400 hover:bg-slate-900"
                    }`}
                    title="Шериф (Красный)"
                  >
                    <Star className={`w-4 h-4 ${s.role === "Шериф" ? "fill-current" : ""}`} />
                    <span className="text-[8px] font-bold">Шер</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectSetupRole(s.slot_num, "Мафия")}
                    className={`py-1.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      s.role === "Мафия"
                        ? "bg-slate-200 border-slate-400 text-slate-950 scale-105 shadow-md shadow-slate-200/5"
                        : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400 hover:bg-slate-900"
                    }`}
                    title="Мафия (Чёрный)"
                  >
                    <PistolIcon className="w-4 h-4" />
                    <span className="text-[8px] font-bold">Маф</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectSetupRole(s.slot_num, "Дон")}
                    className={`py-1.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      s.role === "Дон"
                        ? "bg-purple-500/15 border-purple-500/50 text-purple-400 scale-105 shadow-md shadow-purple-500/5"
                        : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400 hover:bg-slate-900"
                    }`}
                    title="Дон (Чёрный)"
                  >
                    <MafiaHatIcon className="w-4 h-4" />
                    <span className="text-[8px] font-bold">Дон</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button onClick={onCancel} className="bg-slate-850 text-slate-300 rounded px-4 py-1.5 text-xs cursor-pointer">
          Назад
        </button>
        <button
          onClick={validateSetupAndStart}
          className="bg-rose-600 text-white font-bold rounded px-5 py-1.5 text-xs shadow-lg shadow-rose-600/10 cursor-pointer"
        >
          Запустить Игру 🚀
        </button>
      </div>
    </div>
  );
}
