from pathlib import Path

root = Path('.')
workspace_path = root / 'src/components/crm/EveningWorkspace.tsx'
detail_path = root / 'src/components/crm/EveningDetailView.tsx'

workspace_path.write_text("""import React, { useState } from 'react';
import { Gamepad2, Sliders, Users } from 'lucide-react';
import { EveningDetailView } from './EveningDetailView';
import { EveningGamesView } from './EveningGamesView';

interface EveningWorkspaceProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
}

type EveningSection = 'participants' | 'tables' | 'games';

export const EveningWorkspace: React.FC<EveningWorkspaceProps> = ({ eveningId, onBack, onOpenPlayerCard }) => {
  const [section, setSection] = useState<EveningSection>('participants');

  const tabs: Array<{ id: EveningSection; label: string; icon: React.ReactNode }> = [
    { id: 'participants', label: 'Состав', icon: <Users className=\"w-4 h-4\" /> },
    { id: 'tables', label: 'Столы', icon: <Sliders className=\"w-4 h-4\" /> },
    { id: 'games', label: 'Игры', icon: <Gamepad2 className=\"w-4 h-4\" /> },
  ];

  return (
    <div className=\"space-y-3\">
      <div className=\"sticky top-[62px] z-30 px-1\">
        <div className=\"grid grid-cols-3 gap-1 rounded-2xl border border-slate-800 bg-slate-950/95 p-1 shadow-xl backdrop-blur-xl\">
          {tabs.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type=\"button\"
                onClick={() => setSection(tab.id)}
                className={`min-h-[42px] rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-black transition-all ${
                  active
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {section === 'games' ? (
        <EveningGamesView eveningId={eveningId} onBack={onBack} />
      ) : (
        <EveningDetailView
          eveningId={eveningId}
          onBack={onBack}
          onOpenPlayerCard={onOpenPlayerCard}
          view={section}
        />
      )}
    </div>
  );
};
""", encoding='utf-8')

text = detail_path.read_text(encoding='utf-8')

def replace_once(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f'missing expected snippet:\n{old[:180]}')
    text = text.replace(old, new, 1)

replace_once(
"""interface EveningDetailViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
}""",
"""interface EveningDetailViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  view?: 'participants' | 'tables';
}"""
)

replace_once(
"""export const EveningDetailView: React.FC<EveningDetailViewProps> = ({
  eveningId,
  onBack,
  onOpenPlayerCard,
}) => {""",
"""export const EveningDetailView: React.FC<EveningDetailViewProps> = ({
  eveningId,
  onBack,
  onOpenPlayerCard,
  view = 'participants',
}) => {"""
)

top_marker = '      {/* Top Header & Core Evening Information */}'
mode_marker = '      {/* 2. Management Mode Switcher */}'
tables_marker = '      {/* 3. Table UI: Display cards for each table */}'
participants_marker = '      {/* 4. Filter Tabs per Table & Participant List Selection */}'
modal_marker = '      {/* MODAL 1: Bulk Add Players Modal */}'

start = text.index(top_marker)
end = text.index(mode_marker)
new_top = '''      {/* Compact mobile-first evening summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={onBack}
            className="w-10 h-10 shrink-0 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 hover:text-white flex items-center justify-center"
            aria-label="Назад к вечерам"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-white truncate">{evening.title}</h2>
              {isReadonly && (
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Закрыт
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              {new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
              {evening.venue && ` · ${evening.venue}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Запись</span>
            <strong className="text-[13px] text-white">{registeredCount}/{evening.capacity}</strong>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Подтв.</span>
            <strong className="text-[13px] text-emerald-400">{confirmedCount}</strong>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Пришли</span>
            <strong className="text-[13px] text-amber-400">{attendedCount}</strong>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Оплач.</span>
            <strong className="text-[13px] text-emerald-400">{totalRevenue}₽</strong>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-850 px-1 py-2 text-center min-w-0">
            <span className="text-[8px] uppercase text-slate-500 font-bold block truncate">Долг</span>
            <strong className="text-[13px] text-rose-400">{Math.max(0, totalDue - totalRevenue)}₽</strong>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => {
              const joinUrl = `${window.location.origin}/join/${evening.id}`;
              navigator.clipboard.writeText(joinUrl);
              alert(`Ссылка для записи скопирована:\\n${joinUrl}`);
            }}
            className="min-h-[58px] rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 flex flex-col items-center justify-center gap-1"
          >
            <span className="text-lg leading-none">🔗</span>
            <span className="text-[9px] font-bold">Ссылка</span>
          </button>

          {!isReadonly && (
            <button
              onClick={() => setShowBulkAddModal(true)}
              className="min-h-[58px] rounded-xl bg-rose-600 text-white flex flex-col items-center justify-center gap-1 shadow-lg shadow-rose-600/15"
            >
              <UserPlus className="w-4 h-4" />
              <span className="text-[9px] font-black">Игроки</span>
            </button>
          )}

          {!isReadonly && (
            <button
              onClick={() => setShowQuickGuestModal(true)}
              className="min-h-[58px] rounded-xl bg-slate-800 border border-slate-700 text-slate-200 flex flex-col items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span className="text-[9px] font-bold">Гость</span>
            </button>
          )}

          {!isReadonly && !evening.settled_at ? (
            <button
              onClick={() => setShowSettleModal(true)}
              className="min-h-[58px] rounded-xl bg-emerald-600 text-white flex flex-col items-center justify-center gap-1 shadow-lg shadow-emerald-600/15"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-[9px] font-black">Расчёт</span>
            </button>
          ) : (
            <div className="min-h-[58px] rounded-xl bg-slate-950 border border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-1">
              <Lock className="w-4 h-4" />
              <span className="text-[9px] font-bold">Закрыт</span>
            </div>
          )}
        </div>
      </div>

'''
text = text[:start] + new_top + text[end:]

start = text.index(mode_marker)
end = text.index(tables_marker)
new_mode = '''      {/* Compact participant workflow switch */}
      {view === 'participants' && !isReadonly && (
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
          <button
            onClick={() => setMode('rsvp')}
            className={`min-h-[38px] rounded-lg text-[11px] font-black transition-all ${
              mode === 'rsvp' ? 'bg-rose-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-900'
            }`}
          >
            Запись
          </button>
          <button
            onClick={() => setMode('active')}
            className={`min-h-[38px] rounded-lg text-[11px] font-black transition-all ${
              mode === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-900'
            }`}
          >
            Вечер идёт
          </button>
        </div>
      )}

'''
text = text[:start] + new_mode + text[end:]

# Isolate table management into its own workspace tab.
start = text.index(tables_marker)
end = text.index(participants_marker)
segment = text[start:end]
marker_end = segment.index('\n') + 1
segment = segment[:marker_end] + "      {view === 'tables' && (\n        <>\n" + segment[marker_end:] + "        </>\n      )}\n\n"
text = text[:start] + segment + text[end:]

# Isolate participant/cash management into its own workspace tab.
start = text.index(participants_marker)
end = text.index(modal_marker)
segment = text[start:end]
marker_end = segment.index('\n') + 1
segment = segment[:marker_end] + "      {view === 'participants' && (\n        <>\n" + segment[marker_end:] + "        </>\n      )}\n\n"
text = text[:start] + segment + text[end:]

# Mobile density refinements in the participant/table content.
text = text.replace('className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4"', 'className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-3 sm:space-y-4"')
text = text.replace('className={`p-4 bg-slate-950 border rounded-2xl space-y-3.5 transition-all relative ${', 'className={`p-3 sm:p-4 bg-slate-950 border rounded-2xl space-y-3 transition-all relative ${')

# All CRM modals behave as mobile bottom sheets, desktop centered dialogs.
text = text.replace(
    'className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"',
    'className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"'
)
text = text.replace(
    'className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 relative text-white max-h-[90vh] flex flex-col"',
    'className="bg-slate-900 border border-slate-800 rounded-t-[28px] sm:rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-3 sm:space-y-5 relative text-white max-h-[92dvh] flex flex-col"'
)
text = text.replace(
    'className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"',
    'className="grid grid-cols-2 gap-2 sm:gap-3"',
    1
)
text = text.replace(
    'className="relative col-span-1 sm:col-span-2 lg:col-span-1"',
    'className="relative col-span-2"',
    1
)
text = text.replace(
    'className="flex-1 overflow-y-auto border border-slate-800 rounded-2xl bg-slate-950 p-3 space-y-2"',
    'className="min-h-0 flex-1 overflow-y-auto overscroll-contain border border-slate-800 rounded-2xl bg-slate-950 p-2 space-y-1.5"',
    1
)
text = text.replace(
    'className="flex items-center justify-between gap-3 pt-2"',
    'className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800"',
    1
)
text = text.replace(
    'className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"',
    'className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black px-3 min-h-[44px] rounded-xl text-[10px] cursor-pointer flex-1"',
    1
)
text = text.replace(
    'className="bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"',
    'className="bg-slate-800 text-slate-300 font-bold px-3 min-h-[44px] rounded-xl text-[10px] cursor-pointer"',
    1
)

# Other dialog shells: keep forms scrollable and thumb-friendly on mobile.
text = text.replace(
    'className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 relative text-white"',
    'className="bg-slate-900 border border-slate-800 rounded-t-[28px] sm:rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 relative text-white max-h-[92dvh] overflow-y-auto"'
)
text = text.replace(
    'className="bg-slate-900 border border-emerald-500/40 rounded-3xl max-w-lg w-full p-6 space-y-5 relative text-white"',
    'className="bg-slate-900 border border-emerald-500/40 rounded-t-[28px] sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-5 relative text-white max-h-[92dvh] overflow-y-auto"'
)

# Validate that the new workspace split actually exists.
for needle in [
    "view === 'participants'",
    "view === 'tables'",
    'Массовое добавление игроков',
    'grid grid-cols-5 gap-1.5',
]:
    if needle not in text:
        raise SystemExit(f'expected redesigned UI marker missing: {needle}')

detail_path.write_text(text, encoding='utf-8')
print('evening UX redesign applied')
