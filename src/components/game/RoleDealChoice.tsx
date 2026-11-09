// (no React import needed: the automatic JSX runtime)

/**
 * The one choice of how the roles of a game are dealt, the same for a club game and a tournament game (owner, 2026-11-09):
 * virtual cards (the main way, on top) or physical cards. There is no manual picker: a mistake in a physical deal is
 * fixed by dealing again. The reason why dealing is not possible yet is ONE line above the buttons, not a note inside a button.
 */
export function RoleDealChoice({
  onVirtual, onPhysical, blockedReason, busy = false, virtualAvailable = true, virtualTestId = 'role-deal-virtual', physicalTestId = 'role-deal-physical',
}: {
  onVirtual: () => void;
  onPhysical: () => void;
  blockedReason?: string | null;
  busy?: boolean;
  virtualAvailable?: boolean;
  virtualTestId?: string;
  physicalTestId?: string;
}) {
  const blocked = Boolean(blockedReason) || busy;
  return (
    <div className="space-y-2" data-testid="role-deal-choice">
      {blockedReason ? <p role="status" data-testid="role-deal-blocked" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-4 text-amber-200">{blockedReason}</p> : null}
      {virtualAvailable ? (
        <button type="button" data-testid={virtualTestId} disabled={blocked} onClick={onVirtual}
          className="min-h-[52px] w-full rounded-2xl border border-white/25 bg-white/10 px-4 text-left text-[13px] font-black text-white transition-all hover:bg-white/15 disabled:opacity-50">
          Раздать виртуальные карты
          <span className="mt-0.5 block text-[10px] font-medium leading-4 text-white/55">Приложение раздаёт роли само; после раздачи игра запускается.</span>
        </button>
      ) : null}
      <button type="button" data-testid={physicalTestId} disabled={blocked} onClick={onPhysical}
        className="min-h-[52px] w-full rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 text-left text-[13px] font-black text-violet-100 transition-all hover:bg-violet-500/15 disabled:opacity-50">
        Раздать физические карты
        <span className="mt-0.5 block text-[10px] font-medium leading-4 text-violet-100/50">Игроки тянут настоящие карты вслепую, вы отмечаете выпавшие роли.</span>
      </button>
    </div>
  );
}
