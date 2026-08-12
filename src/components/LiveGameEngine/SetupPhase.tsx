import React from "react";
import { Shield, Info, Heart, Star } from "lucide-react";
import { Player } from "../../types.js";
import PhysicalRoleDeal, { type PhysicalRole } from "../game/PhysicalRoleDeal.tsx";
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
  onRoleDealActiveChange?: (active: boolean) => void;
}

const protocolRoleToLiveRole = (value: string): "Мирный" | "Шериф" | "Мафия" | "Дон" | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'citizen' || normalized === 'мирный') return 'Мирный';
  if (normalized === 'sheriff' || normalized === 'шериф') return 'Шериф';
  if (normalized === 'mafia' || normalized === 'мафия') return 'Мафия';
  if (normalized === 'don' || normalized === 'дон') return 'Дон';
  return null;
};

const liveRoleToPhysical = (role: ActivePlayerState['role']): PhysicalRole => {
  if (role === 'Шериф') return 'sheriff';
  if (role === 'Мафия') return 'mafia';
  if (role === 'Дон') return 'don';
  return 'citizen';
};

const physicalRoleToLive = (role: PhysicalRole): ActivePlayerState['role'] => {
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return 'Мирный';
};

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
  onRoleDealActiveChange,
}: SetupPhaseProps) {
  const [showPhysicalDeal, setShowPhysicalDeal] = React.useState(false);
  const [showPassCardModal, setShowPassCardModal] = React.useState(false);
  const [passSlot, setPassSlot] = React.useState(1);
  const [isCardRevealed, setIsCardRevealed] = React.useState(false);
  const managedPrefillDone = React.useRef(false);
  const isClubEveningEngine = players.some((player) => player.notes === '__club_evening_engine_judge__');
  const isTournamentEngine = players.some((player) => player.notes === '__tournament_engine_judge__');
  const isManagedEngine = isClubEveningEngine || isTournamentEngine;

  React.useEffect(() => {
    if (!isManagedEngine || managedPrefillDone.current) return;
    if (!activePlayers.every((player) => !player.user_id)) return;
    managedPrefillDone.current = true;
    handleAutoFillSetupPlayers();

    if (isTournamentEngine) {
      players.slice(0, 10).forEach((player, index) => {
        const match = String(player.notes || '').match(/^__tournament_role__:(.+)$/);
        const role = match ? protocolRoleToLiveRole(match[1]) : null;
        if (role) handleSelectSetupRole(index + 1, role);
      });
    }
  }, [isManagedEngine, isTournamentEngine, activePlayers, players, handleAutoFillSetupPlayers, handleSelectSetupRole]);

  React.useEffect(() => () => onRoleDealActiveChange?.(false), [onRoleDealActiveChange]);

  const existingRoleAssignments = React.useMemo(() => {
    const counts = activePlayers.reduce<Record<string, number>>((acc, player) => {
      acc[player.role] = (acc[player.role] || 0) + 1;
      return acc;
    }, {});
    const alreadyValid = counts['Мирный'] === 6 && counts['Шериф'] === 1 && counts['Мафия'] === 2 && counts['Дон'] === 1;
    if (!alreadyValid) return {} as Record<number, PhysicalRole>;
    return Object.fromEntries(activePlayers.map((player) => [player.slot_num, liveRoleToPhysical(player.role)]));
  }, [activePlayers]);

  const openPhysicalDeal = () => {
    setShowPhysicalDeal(true);
    onRoleDealActiveChange?.(true);
  };

  const closePhysicalDeal = () => {
    setShowPhysicalDeal(false);
    onRoleDealActiveChange?.(false);
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 gap-2">
        <div>
          <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-rose-500" /> Живое Судейство ФСМ
          </h2>
          <p className="text-[10px] text-slate-500">{isTournamentEngine ? 'Состав, роли и судья уже взяты из турнирной игры.' : isClubEveningEngine ? 'Состав и ведущий уже взяты из игры вечера. Раздайте физические карты и зафиксируйте роли.' : 'Укажите рассадку игроков и роли для ведения лога'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isManagedEngine && (
            <button
              onClick={handleAutoFillSetupPlayers}
              className="bg-slate-880 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
            >
              👥 Авто-игроки
            </button>
          )}

          {isClubEveningEngine && (
            <button
              type="button"
              onClick={openPhysicalDeal}
              className="bg-violet-900/60 hover:bg-violet-800 border border-violet-500/50 text-violet-100 text-[10px] font-extrabold px-3 py-1.5 rounded cursor-pointer transition-all flex items-center gap-1.5 shadow"
            >
              🃏 Раздача физических карт
            </button>
          )}

          {!isManagedEngine && (
            <>
              <button
                onClick={handleAutoFillSetupRoles}
                className="bg-slate-880 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all"
              >
                🎭 Авто-роли ФСМ
              </button>
              <button
                onClick={() => {
                  handleAutoFillSetupRoles();
                  setShowPassCardModal(true);
                  setPassSlot(1);
                  setIsCardRevealed(false);
                }}
                className="bg-purple-900/60 hover:bg-purple-800 border border-purple-500/50 text-purple-200 text-[10px] font-extrabold px-3 py-1.5 rounded cursor-pointer transition-all flex items-center gap-1.5 shadow"
                title="Старый автономный режим с передачей устройства"
              >
                📱 Тайный показ ролей
              </button>
            </>
          )}
        </div>
      </div>

      {isClubEveningEngine && (
        <button
          type="button"
          onClick={openPhysicalDeal}
          className="w-full rounded-2xl border border-violet-300/15 bg-violet-300/[0.06] p-3 text-left transition hover:bg-violet-300/[0.09]"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black text-violet-100">🃏 Раздать роли</div>
              <div className="mt-1 text-[10px] leading-4 text-violet-100/45">10 закрытых физических карт → игрок тянет карту → ведущий отмечает роль. Музыка включается на время раздачи.</div>
            </div>
            <span className="text-lg text-violet-200/60">›</span>
          </div>
        </button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/40 border border-slate-850 rounded-lg">
        <div className="space-y-1">
          <label className="text-[9px] text-slate-500 font-bold uppercase block">Судья Вечера / Ведущий</label>
          <select
            value={isNaN(judgeId) || judgeId == null ? 0 : judgeId}
            onChange={(e) => setJudgeId(parseInt(e.target.value) || 0)}
            disabled={isManagedEngine}
            className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 disabled:opacity-70"
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
          {isTournamentEngine ? 'Результат движка будет сохранён в этот же турнирный протокол.' : isClubEveningEngine ? 'Игра сохранится обратно в этот вечер через общий протокол.' : 'Рассадите 10 игроков для ведения игрового протокола.'}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {activePlayers.map((s) => {
          const uids = activePlayers
            .filter((p) => p.slot_num !== s.slot_num && p.user_id > 0)
            .map((p) => p.user_id);
          if (judgeId > 0) uids.push(judgeId);
          const avail = players.filter((p) => !uids.includes(p.user_id) && p.notes !== '__club_evening_engine_judge__' && p.notes !== '__tournament_engine_judge__');

          const isMir = s.role === "Мирный";
          const isSheriff = s.role === "Шериф";
          const isMafia = s.role === "Мафия";
          const roleButtonClass = (active: boolean, activeClass: string) => `py-1.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${isTournamentEngine ? 'cursor-default' : 'cursor-pointer'} ${active ? activeClass : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400 hover:bg-slate-900"}`;

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
                  value={isNaN(s.user_id) || s.user_id == null ? 0 : s.user_id}
                  onChange={(e) => handleSelectSetupPlayer(s.slot_num, parseInt(e.target.value) || 0)}
                  disabled={isManagedEngine}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 disabled:opacity-80"
                >
                  <option value={0}>-- Выбрать игрока --</option>
                  {avail.map((p) => (
                    <option key={p.id} value={p.user_id}>
                      {p.nickname} (Рейтинг: {p.elo})
                    </option>
                  ))}
                  {s.user_id > 0 && !avail.some((p) => p.user_id === s.user_id) && (() => {
                    const selected = players.find((p) => p.user_id === s.user_id);
                    return selected ? <option value={selected.user_id}>{selected.nickname}</option> : null;
                  })()}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] text-slate-500 font-bold uppercase block">Роль игрока</label>
                <div className="grid grid-cols-4 gap-1">
                  <button disabled={isTournamentEngine} type="button" onClick={() => handleSelectSetupRole(s.slot_num, "Мирный")} className={roleButtonClass(s.role === "Мирный", "bg-rose-500/15 border-rose-500/50 text-rose-500 scale-105 shadow-md shadow-rose-500/5")} title="Красный (Мирный)"><Heart className={`w-4 h-4 ${s.role === "Мирный" ? "fill-current" : ""}`} /><span className="text-[8px] font-bold">Мир</span></button>
                  <button disabled={isTournamentEngine} type="button" onClick={() => handleSelectSetupRole(s.slot_num, "Шериф")} className={roleButtonClass(s.role === "Шериф", "bg-emerald-500/15 border-emerald-500/50 text-emerald-400 scale-105 shadow-md shadow-emerald-500/5")} title="Шериф (Красный)"><Star className={`w-4 h-4 ${s.role === "Шериф" ? "fill-current" : ""}`} /><span className="text-[8px] font-bold">Шер</span></button>
                  <button disabled={isTournamentEngine} type="button" onClick={() => handleSelectSetupRole(s.slot_num, "Мафия")} className={roleButtonClass(s.role === "Мафия", "bg-slate-200 border-slate-400 text-slate-950 scale-105 shadow-md shadow-slate-200/5")} title="Мафия (Чёрный)"><PistolIcon className="w-4 h-4" /><span className="text-[8px] font-bold">Маф</span></button>
                  <button disabled={isTournamentEngine} type="button" onClick={() => handleSelectSetupRole(s.slot_num, "Дон")} className={roleButtonClass(s.role === "Дон", "bg-purple-500/15 border-purple-500/50 text-purple-400 scale-105 shadow-md shadow-purple-500/5")} title="Дон (Чёрный)"><MafiaHatIcon className="w-4 h-4" /><span className="text-[8px] font-bold">Дон</span></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button onClick={onCancel} className="bg-slate-850 text-slate-300 rounded px-4 py-1.5 text-xs cursor-pointer">Назад</button>
        <button onClick={validateSetupAndStart} className="bg-rose-600 text-white font-bold rounded px-5 py-1.5 text-xs shadow-lg shadow-rose-600/10 cursor-pointer">Запустить Игру 🚀</button>
      </div>

      {showPhysicalDeal && (
        <PhysicalRoleDeal
          seats={activePlayers.map((player) => ({ seat_number: player.slot_num, nickname: player.nickname }))}
          initialAssignments={existingRoleAssignments}
          onCancel={closePhysicalDeal}
          onComplete={(assignments) => {
            Object.entries(assignments).forEach(([seat, role]) => handleSelectSetupRole(Number(seat), physicalRoleToLive(role)));
            closePhysicalDeal();
          }}
        />
      )}

      {showPassCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <span className="text-xs font-black text-purple-400 uppercase tracking-wider">📱 Раздача ролей • Место #{passSlot}/10</span>
              <button onClick={() => setShowPassCardModal(false)} className="text-slate-500 hover:text-white text-xs font-bold">✕ Закрыть</button>
            </div>

            {(() => {
              const currentP = activePlayers.find((p) => p.slot_num === passSlot);
              if (!currentP) return null;
              const roleText = currentP.role;
              const isRed = roleText === "Мирный" || roleText === "Шериф";

              return (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xl font-black text-white">Игрок #{passSlot}: {currentP.nickname || `Игрок ${passSlot}`}</h3>
                    <p className="text-xs text-slate-400 mt-1">{!isCardRevealed ? "Передайте устройство этому игроку. Убедитесь, что никто не подсматривает!" : "Ваша роль зафиксирована! Запомните её и не показывайте другим."}</p>
                  </div>

                  {!isCardRevealed ? (
                    <div className="py-8 bg-slate-950/80 rounded-2xl border border-slate-850 space-y-4">
                      <div className="text-4xl animate-bounce">📱</div>
                      <button type="button" onClick={() => setIsCardRevealed(true)} className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-lg border border-purple-400/40 cursor-pointer transition-all active:scale-95">👁️ Посмотреть мою карту</button>
                    </div>
                  ) : (
                    <div className={`p-6 rounded-2xl border-2 space-y-3 transition-all ${roleText === "Мирный" ? "bg-rose-950/40 border-rose-500 text-rose-200" : roleText === "Шериф" ? "bg-emerald-950/40 border-emerald-500 text-emerald-200" : roleText === "Дон" ? "bg-purple-950/40 border-purple-500 text-purple-200" : "bg-slate-950 border-slate-400 text-slate-100"}`}>
                      <div className="text-5xl">{roleText === "Мирный" && "❤️"}{roleText === "Шериф" && "⭐"}{roleText === "Дон" && "🎩"}{roleText === "Мафия" && "🕶️"}</div>
                      <h4 className="text-2xl font-black uppercase tracking-wide">{roleText}</h4>
                      <p className="text-xs font-medium opacity-90">Команда: <strong className={isRed ? "text-rose-400" : "text-slate-300"}>{isRed ? "КРАСНЫЕ" : "ЧЁРНЫЕ"}</strong></p>
                    </div>
                  )}

                  {isCardRevealed && (
                    <button type="button" onClick={() => { if (passSlot < 10) { setPassSlot((prev) => prev + 1); setIsCardRevealed(false); } else { setShowPassCardModal(false); validateSetupAndStart(); } }} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg border border-emerald-400/40 cursor-pointer transition-all active:scale-95">
                      {passSlot < 10 ? `Скрыть и передать Игроку #${passSlot + 1} ➡️` : "Готово! Начать игру 🚀"}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
