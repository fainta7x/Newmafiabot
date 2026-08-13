import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from './PlayerCabinet.tsx';
import PlayerCabinetV2, { type PlayerTab } from './PlayerCabinetV2.tsx';
import JudgeGameLauncher from './JudgeGameLauncher.tsx';
import PlayerJudging from './PlayerJudging.tsx';
import PlayerCareerProfile from './PlayerCareerProfile.tsx';
import PlayerClubWorldPanel from './PlayerClubWorldPanel.tsx';
import PlayerEloJourney from './PlayerEloJourney.tsx';
import PlayerEveningSummaries from './PlayerEveningSummaries.tsx';
import PlayerSmartNotifications, { type PlayerNotificationDestination } from './PlayerSmartNotifications.tsx';

export type PlayerCabinetSection = PlayerTab | 'conduct' | 'more' | 'elo' | 'recaps' | 'career' | 'clubworld';

type Props = {
  data: PlayerMeResponse;
  canOpenAdmin?: boolean;
  initialSection?: PlayerCabinetSection;
  initialTarget?: string | null;
  onSectionChange?: (section: PlayerCabinetSection, target?: string | null) => void;
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

const EXPERIENCE_ITEMS: Array<{
  id: Extract<PlayerCabinetSection, 'elo' | 'recaps' | 'clubworld' | 'career'>;
  icon: string;
  title: string;
  description: string;
}> = [
  { id: 'elo', icon: '📈', title: 'Elo-карьера', description: 'График, объяснения изменений и прогноз следующей игры' },
  { id: 'recaps', icon: '🎬', title: 'Итоги вечеров', description: 'Счёт, твоя форма, Elo и лучшие моменты' },
  { id: 'clubworld', icon: '🏛', title: 'Сезоны и рекорды', description: 'Текущий сезон, архив и Зал славы клуба' },
  { id: 'career', icon: '🎭', title: 'Игровая карьера', description: 'Роли, серии, форма и история игрока' },
];

const SECONDARY_ITEMS: Array<{
  id: Extract<PlayerCabinetSection, 'stats' | 'club' | 'payments' | 'profile'>;
  icon: string;
  title: string;
  description: string;
}> = [
  { id: 'stats', icon: '▥', title: 'Статистика', description: 'Показатели, роли и турнирные награды' },
  { id: 'club', icon: '◆', title: 'Клуб', description: 'Форма, серии, связи и жизнь 2LA Noire' },
  { id: 'payments', icon: '₽', title: 'Оплата', description: 'Баланс и история платежей' },
  { id: 'profile', icon: '●', title: 'Профиль', description: 'Аккаунт, аватар и игроки клуба' },
];

const secondarySections = new Set<PlayerCabinetSection>(['stats', 'club', 'payments', 'profile']);
const experienceSections = new Set<PlayerCabinetSection>(['elo', 'recaps', 'career', 'clubworld']);

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
          <p className="mt-1 text-sm text-white/45">Твоя клубная история и дополнительные разделы</p>
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

        <section className="rounded-[26px] border border-amber-200/10 bg-gradient-to-br from-amber-200/[0.045] to-white/[0.02] p-3">
          <div className="px-1 pb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/40">Клубная история</div>
            <div className="mt-1 text-xs text-white/30">Не просто цифры — что происходило с тобой и клубом.</div>
          </div>
          <div className="space-y-1.5">
            {EXPERIENCE_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item.id)}
                className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl bg-black/20 px-3 py-2.5 text-left transition active:bg-white/[0.07]"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.055] text-xl">{item.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <div className="mt-0.5 text-[10px] leading-4 text-white/32">{item.description}</div>
                </div>
                <span className="text-lg text-white/20">›</span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          {SECONDARY_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              className="min-h-[122px] rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-left transition active:bg-white/[0.08]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.07] text-lg text-white/65">{item.icon}</div>
              <div className="mt-3 text-sm font-semibold text-white">{item.title}</div>
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

function ClubWorldPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px]">
        <div className="flex items-start gap-3 px-1 pt-1">
          <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/55">←</button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/40">Мир клуба</div>
            <h1 className="mt-1 text-2xl font-semibold">Сезоны и рекорды</h1>
            <p className="mt-1 text-xs leading-5 text-white/40">Кто ведёт сезон, кто вошёл в историю и какие рекорды ещё можно побить.</p>
          </div>
        </div>
        <PlayerClubWorldPanel />
      </div>
    </main>
  );
}

export default function PlayerCabinetShell({
  data,
  canOpenAdmin = false,
  initialSection = 'home',
  initialTarget = null,
  onSectionChange,
}: Props) {
  const [section, setSection] = useState<PlayerCabinetSection>(initialSection);
  const [experienceTarget, setExperienceTarget] = useState<string | null>(initialTarget);

  useEffect(() => {
    setSection(initialSection);
    setExperienceTarget(initialTarget);
  }, [initialSection, initialTarget]);

  const openSection = (next: PlayerCabinetSection, target: string | null = null) => {
    setSection(next);
    setExperienceTarget(target);
    onSectionChange?.(next, target);
  };

  const handleNotificationNavigation = (destination: PlayerNotificationDestination, target?: string | null) => {
    if (destination === 'elo') return openSection('elo', target || null);
    if (destination === 'recaps') return openSection('recaps', target || null);
    if (destination === 'club') return openSection('club', target || null);
    if (destination === 'games') return openSection('games', target || null);
    return openSection('home', target || null);
  };

  const legacyTab = section === 'home' || section === 'games' || section === 'rating' || secondarySections.has(section)
    ? section as PlayerTab
    : null;

  const moreActive = section === 'more' || secondarySections.has(section) || experienceSections.has(section);

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
        <MorePage data={data} canOpenAdmin={canOpenAdmin} onOpen={(next) => openSection(next)} />
      ) : section === 'elo' ? (
        <PlayerEloJourney onBack={() => openSection('more')} />
      ) : section === 'recaps' ? (
        <PlayerEveningSummaries onBack={() => openSection('more')} initialEveningId={experienceTarget} />
      ) : section === 'career' ? (
        <PlayerCareerProfile playerId={data.player.id} onBack={() => openSection('more')} />
      ) : section === 'clubworld' ? (
        <ClubWorldPage onBack={() => openSection('more')} />
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

      <PlayerSmartNotifications onNavigate={handleNotificationNavigation} />

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
