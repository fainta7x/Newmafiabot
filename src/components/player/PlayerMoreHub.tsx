import type { PlayerMeResponse } from '../../types/player.ts';

type Destination = 'club' | 'profile' | 'payments' | 'conduct';

export default function PlayerMoreHub({
  data,
  canOpenAdmin,
  onOpen,
}: {
  data: PlayerMeResponse;
  canOpenAdmin: boolean;
  onOpen: (destination: Destination) => void;
}) {
  const player = data.player;

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-2">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div>
          <h1 className="mt-1 text-2xl font-semibold">Ещё</h1>
          <p className="mt-1 text-sm text-white/45">Клуб, аккаунт и служебные функции</p>
        </header>

        <button
          type="button"
          onClick={() => onOpen('profile')}
          className="flex w-full items-center gap-3 rounded-[26px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4 text-left"
        >
          {player.avatar_url ? (
            <img src={player.avatar_url} alt={player.nickname} className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-white/15" />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl font-semibold text-white/70">{player.nickname.slice(0, 1).toUpperCase()}</div>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">{player.nickname}</span>
            <span className="mt-1 block text-xs text-white/35">{player.elo} ELO · профиль и настройки</span>
          </span>
          <span className="text-xl text-white/25">›</span>
        </button>

        <section className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onOpen('club')} className="min-h-[126px] rounded-[24px] border border-white/10 bg-white/[0.04] p-4 text-left active:bg-white/[0.07]">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/[0.06] text-lg text-white/65">◆</div>
            <div className="mt-3 text-sm font-semibold">Клуб</div>
            <div className="mt-1 text-xs leading-4 text-white/35">Люди, связи и жизнь 2LA Noire</div>
          </button>
          <button type="button" onClick={() => onOpen('payments')} className="min-h-[126px] rounded-[24px] border border-white/10 bg-white/[0.04] p-4 text-left active:bg-white/[0.07]">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/[0.06] text-lg text-white/65">₽</div>
            <div className="mt-3 text-sm font-semibold">Оплата</div>
            <div className="mt-1 text-xs leading-4 text-white/35">Баланс и история платежей</div>
          </button>
        </section>

        <section className="rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-2">
          <button type="button" onClick={() => onOpen('conduct')} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left active:bg-white/[0.06]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-200/[0.08] text-amber-100">▶</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Ведение игр</span><span className="mt-0.5 block text-xs text-white/30">Судейский режим и назначенные игры</span></span>
            <span className="text-lg text-white/20">›</span>
          </button>
          {canOpenAdmin && (
            <a href="/admin" className="mt-1 flex min-h-14 items-center gap-3 rounded-2xl px-3 text-left active:bg-white/[0.06]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-white/55">⚙</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Панель организатора</span><span className="mt-0.5 block text-xs text-white/30">Управление клубом и вечерами</span></span>
              <span className="text-lg text-white/20">›</span>
            </a>
          )}
        </section>
      </div>
    </main>
  );
}
