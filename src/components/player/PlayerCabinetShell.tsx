import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from './PlayerCabinet.tsx';
import PlayerCabinetV2, { type PlayerTab } from './PlayerCabinetV2.tsx';
import JudgeGameLauncher from './JudgeGameLauncher.tsx';
import PlayerJudging from './PlayerJudging.tsx';

export type PlayerCabinetSection = PlayerTab | 'conduct' | 'more';

type Props = {
  data: PlayerMeResponse;
  canOpenAdmin?: boolean;
  initialSection?: PlayerCabinetSection;
  onSectionChange?: (section: PlayerCabinetSection) => void;
};

type PrimaryItem = {
  id: 'home' | 'games' | 'conduct' | 'rating' | 'more';
  icon: string;
  label: string;
};

const PRIMARY_ITEMS: PrimaryItem[] = [
  { id: 'home', icon: '⌂', label: 'Главная' },
  { id: 'games', icon: '◫', label: 'Игры' },
  { id: 'conduct', icon: '▶', label: 'Создать игру' },
  { id: 'rating', icon: '★', label: 'Рейтинг' },
  { id: 'more', icon: '•••', label: 'Ещё' },
];

const SECONDARY_ITEMS: Array<{
  id: Extract<PlayerCabinetSection, 'stats' | 'club' | 'payments' | 'profile'>;
  icon: string;
  title: string;
  description: string;
}> = [
  { id: 'stats', icon: '▥', title: 'Статистика', description: 'Показатели, роли и турнирные награды' },
  { id: 'club', icon: '◆', title: 'Клуб', description: 'Форма, серии и жизнь 2LA Noire' },
  { id: 'payments', icon: '₽', title: 'Оплата', description: 'Баланс и история платежей' },
  { id: 'profile', icon: '●', title: 'Профиль', description: 'Аккаунт, аватар и игроки клуба' },
];

const secondarySections = new Set<PlayerCabinetSection>(['stats', 'club', 'payments', 'profile']);

function MorePage({
  data,
  canOpenAdmin,
  onOpen,
}: {
  data: PlayerMeResponse;
  canOpenAdmin: boolean;
  onOpen: (section: PlayerCabinetSection) => void;
}) {
  const player = data.player;

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <div className="px-1 pb-1 pt-2">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Ещё</h1>
          <p className="mt-1 text-sm text-white/45">Профиль, клуб и дополнительные разделы</p>
        </div>

        <section className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
          <div className="flex items-center gap-3">
            {player.avatar_url ? (
              <img
                src={player.avatar_url}
                alt={player.nickname}
                className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-white/15"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl font-semibold text-white/70">
                {player.nickname.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold text-white">{player.nickname}</div>
              <div className="mt-1 text-xs text-white/35">{player.elo} ELO · {Number(player.tokens || 0).toLocaleString('ru-RU')} 🪙</div>
            </div>
            <button
              type="button"
              onClick={() => onOpen('profile')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-lg text-white/50"
              aria-label="Открыть профиль"
            >
              ›
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          {SECONDARY_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              className="min-h-[132px] rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-left transition active:bg-white/[0.08]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.07] text-lg text-white/65">{item.icon}</div>
              <div className="mt-4 text-sm font-semibold text-white">{item.title}</div>
              <div className="mt-1 text-xs leading-4 text-white/35">{item.description}</div>
            </button>
          ))}
        </section>

        {canOpenAdmin && (
          <a
            href="/admin"
            className="flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm font-medium text-white/65"
          >
            <span>Панель организатора</span>
            <span className="text-white/30">›</span>
          </a>
        )}
      </div>
    </main>
  );
}

function ConductPage({
  data,
  onBack,
}: {
  data: PlayerMeResponse;
  onBack: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <div className="px-1 pb-1 pt-2">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-100/40">Игровой центр</div>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-white">Ведение игр</h1>
              <p className="mt-1 text-sm leading-5 text-white/45">Запуск движка и все назначенные вам игры — в одном месте.</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/15 bg-amber-200/[0.08] text-xl text-amber-100">▶</div>
          </div>
        </div>

        <JudgeGameLauncher
          judge={{ id: data.player.id, nickname: data.player.nickname }}
          evenings={[]}
          allowClubGame={false}
          onCreated={() => undefined}
        />

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-xs leading-5 text-white/35">
          Боевые клубные и турнирные игры появляются ниже после назначения организатором. Тестовая игра не сохраняется в статистику.
        </div>

        <PlayerJudging onBack={onBack} />
      </div>
    </main>
  );
}

export default function PlayerCabinetShell({
  data,
  canOpenAdmin = false,
  initialSection = 'home',
  onSectionChange,
}: Props) {
  const [section, setSection] = useState<PlayerCabinetSection>(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const openSection = (next: PlayerCabinetSection) => {
    setSection(next);
    onSectionChange?.(next);
  };

  const legacyTab = section === 'home' || section === 'games' || section === 'rating' || secondarySections.has(section)
    ? section as PlayerTab
    : null;

  const moreActive = section === 'more' || secondarySections.has(section);

  return (
    <div className="player-cabinet-shell bg-[#090a0d] text-white">
      <style>{`
        .player-cabinet-shell .player-cabinet-legacy > main > nav.fixed {
          display: none !important;
        }
      `}</style>

      {section === 'conduct' ? (
        <ConductPage data={data} onBack={() => openSection('home')} />
      ) : section === 'more' ? (
        <MorePage data={data} canOpenAdmin={canOpenAdmin} onOpen={openSection} />
      ) : legacyTab ? (
        <div className="player-cabinet-legacy">
          <PlayerCabinetV2
            key={legacyTab}
            data={data}
            canOpenAdmin={canOpenAdmin}
            initialTab={legacyTab}
            onTabChange={(tab) => openSection(tab)}
          />
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-[90] border-t border-white/10 bg-[#0b0c10]/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl">
        <div className="mx-auto grid w-full max-w-[430px] grid-cols-5 items-end gap-1">
          {PRIMARY_ITEMS.map((item) => {
            const active = item.id === 'more' ? moreActive : section === item.id;
            const conduct = item.id === 'conduct';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openSection(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center rounded-2xl px-1 text-[10px] font-medium transition ${
                  conduct
                    ? active
                      ? 'bg-amber-200 text-[#14110a] shadow-[0_8px_26px_rgba(253,230,138,0.2)]'
                      : 'border border-amber-200/20 bg-amber-200/[0.09] text-amber-100'
                    : active
                      ? 'bg-white/[0.09] text-white'
                      : 'text-white/40 active:bg-white/[0.05]'
                }`}
              >
                <span className={`${conduct ? 'text-lg' : 'text-base'} leading-none`}>{item.icon}</span>
                <span className="mt-1 max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
