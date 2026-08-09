from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str) -> str:
    result, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return result


def apply_theme_tokens(text: str) -> str:
    replacements = [
        ('bg-slate-950', 'bg-app-bg'),
        ('bg-slate-900', 'bg-surface-1'),
        ('bg-slate-800', 'bg-surface-2'),
        ('hover:bg-slate-700', 'hover:bg-surface-hover'),
        ('hover:bg-slate-800', 'hover:bg-surface-hover'),
        ('active:bg-slate-600', 'active:bg-surface-hover'),
        ('text-slate-100', 'text-text-primary'),
        ('text-slate-200', 'text-text-primary'),
        ('text-slate-300', 'text-text-secondary'),
        ('text-slate-400', 'text-text-secondary'),
        ('text-slate-500', 'text-text-muted'),
        ('border-slate-500', 'border-border-strong'),
        ('border-slate-600', 'border-border-strong'),
        ('border-slate-700', 'border-border-soft'),
        ('border-slate-800', 'border-border-soft'),
        ('ring-slate-400', 'ring-border-strong'),
        ('bg-purple-500', 'bg-accent'),
        ('bg-purple-950', 'bg-accent-soft'),
        ('text-purple-400', 'text-accent'),
        ('text-purple-300', 'text-accent'),
        ('border-purple-500', 'border-accent'),
        ('bg-indigo-600', 'bg-accent'),
        ('bg-indigo-500', 'bg-accent'),
        ('text-indigo-400', 'text-accent'),
        ('text-indigo-300', 'text-accent'),
        ('border-indigo-500', 'border-accent'),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text


# Shared scoped Noir protocol styles.
css_path = Path('src/index.css')
css = css_path.read_text(encoding='utf-8')
marker = '/* 2LA NOIRE protocol UI */'
if marker in css:
    raise SystemExit('protocol css marker already present')
css += r'''

/* 2LA NOIRE protocol UI */
.protocol-noir-root {
  --protocol-gold: var(--warning);
  color: var(--text-primary);
}

.protocol-noir-shell {
  background: var(--app-bg);
  border: 1px solid var(--border-soft);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.48);
}

.protocol-noir-header,
.protocol-noir-footer {
  background: var(--surface-1);
  border-color: var(--border-soft);
}

.protocol-noir-tabs {
  background: var(--app-bg);
  border-color: var(--border-soft);
}

.protocol-noir-tab {
  min-height: 44px;
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  border-radius: 10px 10px 0 0;
}

.protocol-noir-tab:hover,
.protocol-noir-tab:focus-visible {
  color: var(--text-primary);
  background: var(--surface-1);
  outline: none;
}

.protocol-noir-tab:focus-visible {
  box-shadow: inset 0 0 0 1px var(--accent);
}

.protocol-noir-tab-active {
  min-height: 44px;
  color: var(--text-primary);
  background: var(--accent-soft);
  border-bottom: 2px solid var(--accent);
  border-radius: 10px 10px 0 0;
}

.protocol-player-list {
  border-top: 1px solid var(--border-soft);
  border-bottom: 1px solid var(--border-soft);
}

.protocol-player-row {
  background: transparent;
  border-bottom: 1px solid var(--border-soft);
}

.protocol-player-row:last-child {
  border-bottom: 0;
}

.protocol-player-row[data-expanded="true"] {
  background: var(--surface-1);
  box-shadow: inset 3px 0 0 var(--accent);
}

.protocol-player-trigger:hover,
.protocol-player-trigger:focus-visible {
  background: var(--surface-1);
  outline: none;
}

.protocol-player-trigger:focus-visible {
  box-shadow: inset 0 0 0 1px var(--accent);
}

.protocol-inline-section {
  padding: 0.75rem 0;
  border-top: 1px solid var(--border-soft);
}

.protocol-control-block {
  min-width: 0;
  padding: 0.65rem 0;
  border-top: 1px solid var(--border-soft);
}

.protocol-noir-section {
  background: var(--surface-1);
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  padding: 0.9rem;
}

.protocol-noir-subsection {
  background: transparent;
  border-top: 1px solid var(--border-soft);
  padding-top: 0.75rem;
}

.protocol-noir-field {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--border-soft);
  border-radius: 11px;
  background: var(--surface-2);
  color: var(--text-primary);
  padding: 0.6rem 0.75rem;
  outline: none;
}

.protocol-noir-field:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.protocol-noir-field:disabled {
  opacity: 0.52;
}

.protocol-inline-field {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-bottom: 1px solid var(--border-soft);
  color: var(--text-secondary);
}

.protocol-seat-button {
  min-height: 44px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--surface-1);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.protocol-seat-button:hover:not(:disabled),
.protocol-seat-button:focus-visible:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-strong);
  background: var(--surface-hover);
  outline: none;
}

.protocol-seat-button[data-selected="true"] {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}

.protocol-action-primary {
  min-height: 44px;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font-weight: 750;
  transition: background-color 0.18s ease, transform 0.18s ease;
}

.protocol-action-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.protocol-action-secondary {
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border-soft);
  background: var(--surface-2);
  color: var(--text-primary);
  font-weight: 650;
}

.protocol-action-secondary:hover:not(:disabled) {
  background: var(--surface-hover);
}

.protocol-action-danger {
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
  background: var(--danger-soft);
  color: var(--danger);
  font-weight: 700;
}

.protocol-action-primary:focus-visible,
.protocol-action-secondary:focus-visible,
.protocol-action-danger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.protocol-action-primary:disabled,
.protocol-action-secondary:disabled,
.protocol-action-danger:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.protocol-vote-stage {
  background: var(--surface-1);
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  padding: 0.9rem;
}

.protocol-vote-stage--nested {
  background: color-mix(in srgb, var(--accent-soft) 48%, var(--surface-1));
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
}

.protocol-vote-stage--error {
  border-color: var(--danger);
  box-shadow: 0 0 0 2px var(--danger-soft);
}

.protocol-save-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 36px;
  color: var(--text-secondary);
}

.protocol-summary-mobile-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 0.55rem;
  padding: 0.75rem 0;
  border-top: 1px solid var(--border-soft);
}

.protocol-summary-mobile-row:first-child {
  border-top: 0;
}

@media (min-width: 640px) {
  .protocol-control-block {
    padding: 0.7rem;
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    background: var(--surface-1);
  }
}

@media (max-width: 639px) {
  .protocol-noir-shell {
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .protocol-noir-section {
    border-left: 0;
    border-right: 0;
    border-radius: 0;
    margin-left: -0.75rem;
    margin-right: -0.75rem;
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  .protocol-noir-footer {
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  }
}
'''
css_path.write_text(css, encoding='utf-8')


# Main protocol shell and player rows.
p = Path('src/components/crm/tournaments/GameProtocolModal.tsx')
s = p.read_text(encoding='utf-8')

s = replace_once(
    s,
    'className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto overflow-x-hidden"',
    'className="protocol-noir-root fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 overflow-hidden"',
    'modal overlay',
)
s = replace_once(
    s,
    'className="bg-slate-900 text-slate-100 rounded-none sm:rounded-2xl w-full max-w-4xl max-h-[100dvh] h-[100dvh] sm:h-auto sm:max-h-[92vh] flex flex-col shadow-2xl border-0 sm:border sm:border-slate-800 overflow-hidden min-w-0"',
    'className="protocol-noir-shell text-text-primary rounded-none sm:rounded-2xl w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden min-w-0"',
    'modal shell',
)
s = replace_once(
    s,
    'className="bg-slate-800/90 px-3 py-2 sm:px-4 sm:py-3 border-b border-slate-700/80 flex items-center justify-between shrink-0 min-h-[56px] sm:min-h-[64px] min-w-0 protocol-modal-header"',
    'className="protocol-noir-header px-3 py-2.5 sm:px-4 sm:py-3 border-b flex items-center justify-between shrink-0 min-h-[58px] sm:min-h-[64px] min-w-0 protocol-modal-header"',
    'header',
)
s = replace_once(
    s,
    'className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-base sm:text-lg shrink-0"',
    'className="min-w-[34px] text-warning flex items-center justify-center font-black text-base sm:text-lg tabular-nums shrink-0"',
    'game number',
)
s = replace_once(
    s,
    'className="text-[11px] sm:text-xs flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700"',
    'className="protocol-save-status text-[11px] sm:text-xs"',
    'save status',
)
s = replace_once(
    s,
    'className="bg-slate-800/40 border-b border-slate-800 p-1.5 sm:px-3 sm:py-2 shrink-0 protocol-modal-tabs"',
    'className="protocol-noir-tabs border-b px-2 pt-1 sm:px-3 shrink-0 protocol-modal-tabs"',
    'tabs container',
)
old_active = "? 'bg-amber-500 text-slate-950 font-bold shadow-md'\n                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'"
new_active = "? 'protocol-noir-tab-active font-bold'\n                  : 'protocol-noir-tab'"
if s.count(old_active) != 4:
    raise SystemExit(f'tab state count={s.count(old_active)}')
s = s.replace(old_active, new_active)
s = s.replace('className={`py-2 sm:py-1.5 px-1 sm:px-3 rounded-xl text-xs sm:text-sm font-medium transition flex items-center justify-center space-x-1 sm:space-x-2 min-w-0 ${', 'className={`px-1 sm:px-3 text-[11px] min-[390px]:text-xs sm:text-sm font-medium transition flex items-center justify-center gap-1 sm:gap-2 min-w-0 ${')
s = replace_once(
    s,
    'className="flex-1 overflow-y-auto p-3 sm:p-5 pb-24 sm:pb-6 max-w-full"',
    'className="protocol-noir-content flex-1 min-h-0 overflow-y-auto overscroll-contain overflow-x-hidden p-3 sm:p-5 max-w-full"',
    'content scroller',
)
s = replace_once(s, 'className="space-y-3"', 'className="protocol-player-list"', 'player list')

player_header = r'''                          {/* Compact Row Header */}
                          <button
                            type="button"
                            data-testid={`player-row-${player.participant_id}`}
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedPlayerId((prev) => (prev === player.participant_id ? null : player.participant_id))
                            }
                            className="protocol-player-trigger w-full grid grid-cols-[34px_32px_minmax(0,1fr)_32px] sm:grid-cols-[38px_36px_minmax(0,1fr)_36px] items-start gap-2 sm:gap-3 px-3 py-3 sm:px-4 sm:py-3.5 text-left min-h-[64px] transition-colors"
                          >
                            <span className="text-warning font-black text-sm sm:text-base tabular-nums pt-1">
                              {String(player.seat_number).padStart(2, '0')}
                            </span>
                            <PlayerAvatar nickname={player.display_name} size="xs" />
                            <span className="min-w-0 space-y-1.5">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                                <span className="font-semibold text-sm text-text-primary break-words min-w-0 max-w-full">
                                  {player.display_name}
                                </span>
                                <span className={`text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${roleClass}`}>
                                  {roleLabel}
                                </span>
                                {statusLabel && (
                                  <span className={`text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${statusClass}`}>
                                    {statusLabel}
                                  </span>
                                )}
                              </span>
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                                {briefBadges.length > 0 ? (
                                  briefBadges.map((badge) => (
                                    <span
                                      key={badge.key}
                                      className={`text-[10px] sm:text-[11px] leading-4 whitespace-normal tabular-nums ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] sm:text-[11px] text-text-muted">Без отметок</span>
                                )}
                              </span>
                            </span>
                            <span className="w-8 h-8 flex items-center justify-center text-text-secondary shrink-0">
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-accent" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </span>
                          </button>

                          {/* Expanded Player Form */}'''
s = sub_once(
    s,
    r'\s*\{/\* Compact Row Header \*/\}.*?\{/\* Expanded Player Form \*/\}',
    '\n' + player_header,
    'player compact rows',
)

s = replace_once(
    s,
    "className={`bg-slate-800/60 rounded-xl border transition overflow-hidden ${\n                            isExpanded ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-slate-700/80 hover:border-slate-600'\n                          }`}",
    'className="protocol-player-row" data-expanded={isExpanded}',
    'player row shell',
)
s = replace_once(
    s,
    'className="border-t border-slate-700/60 p-3 sm:p-4 space-y-3 bg-slate-900/40"',
    'className="border-t border-border-soft px-3 pb-3 sm:px-4 sm:pb-4 space-y-3"',
    'expanded player shell',
)
s = replace_once(
    s,
    'className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60"',
    'className="protocol-inline-section flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"',
    'status row',
)
s = replace_once(
    s,
    'className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 mt-3"',
    'className="mt-2"',
    'foul bonus outer',
)
s = s.replace('className="bg-slate-900/60 p-2 rounded-lg border border-slate-800"', 'className="protocol-control-block"')
s = s.replace('className="bg-slate-900/60 p-2 rounded-lg border border-slate-800 flex flex-col items-center"', 'className="protocol-control-block flex flex-col items-center"')
s = s.replace('className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:border-amber-500 focus:outline-none disabled:opacity-60"', 'className="protocol-noir-field !w-auto text-xs disabled:opacity-60"')
s = s.replace('className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none disabled:opacity-50"', 'className="protocol-noir-field text-xs disabled:opacity-50"')

# Responsive footer: never clip actions.
footer_pattern = r'''        \{/\* Footer Action Bar \*/\}\n        <div className="bg-slate-900 border-t border-slate-800 px-3 py-2\.5 sm:px-4 sm:py-4 flex items-center justify-between shrink-0 gap-2 min-w-0 protocol-modal-footer">.*?        </div>\n\n      </div>'''
footer_replacement = r'''        {/* Footer Action Bar */}
        <div className="protocol-noir-footer protocol-modal-footer border-t px-3 py-2.5 sm:px-4 sm:py-3 shrink-0 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="text-[11px] sm:text-xs text-text-secondary min-w-0">
              {protocol.status === 'completed' ? (
                <span className="text-success font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Протокол завершён</span>
                </span>
              ) : (
                <span>Черновик сохраняется автоматически</span>
              )}
            </div>

            {protocol.status === 'draft' ? (
              <button
                type="button"
                onClick={() => {
                  const valErr = validateBeforeComplete();
                  if (valErr) {
                    setError(valErr);
                  } else {
                    setError(null);
                    setShowCompleteConfirm(true);
                  }
                }}
                className="protocol-action-primary w-full sm:w-auto px-4 py-2 text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-normal"
              >
                <FileCheck className="w-4 h-4 shrink-0" />
                <span>Завершить протокол</span>
              </button>
            ) : (
              <div className="grid grid-cols-1 min-[430px]:grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  id={`btn-protocol-${game?.game_number || 'export'}-png-results-trigger`}
                  onClick={() => setIsExportModalOpen(true)}
                  className="protocol-action-secondary px-3 py-2 text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-normal"
                >
                  <ImageIcon className="w-4 h-4 shrink-0 text-success" />
                  <span>Результаты PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRevertConfirm(true)}
                  className="protocol-action-danger px-3 py-2 text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-normal"
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span>Вернуть в черновик</span>
                </button>
              </div>
            )}
          </div>
        </div>

      </div>'''
s = sub_once(s, footer_pattern, footer_replacement, 'footer')

# Theme migration for remaining dialog/form surfaces in the protocol only.
s = apply_theme_tokens(s)
s = s.replace('focus:border-amber-500', 'focus:border-accent')
s = s.replace('focus:ring-amber-500', 'focus:ring-accent')
s = s.replace('bg-amber-500 hover:bg-amber-400 text-slate-950', 'bg-accent hover:bg-accent-hover text-white')
s = s.replace('bg-amber-500 hover:bg-amber-600 text-slate-950', 'bg-accent hover:bg-accent-hover text-white')
s = s.replace('bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950', 'bg-accent hover:bg-accent-hover text-white')
p.write_text(s, encoding='utf-8')


# Voting tab: flatten stage hierarchy and use canonical accent.
p = Path('src/components/crm/tournaments/protocol/ProtocolVotingTab.tsx')
s = p.read_text(encoding='utf-8')
s = sub_once(
    s,
    r'''className=\{`rounded-xl border transition-all \$\{isNested \? 'bg-slate-900/40 p-3\.5 space-y-3 border-purple-500/20' : 'bg-slate-800/60 p-4 space-y-4'\} \$\{\n          isErrorHighlighted\n            \? 'border-rose-500/80 ring-2 ring-rose-500/20 bg-rose-950/10'\n            : isNested \? 'border-purple-500/20' : 'border-slate-700/80'\n        \}`\}''',
    "className={`protocol-vote-stage space-y-4 ${isNested ? 'protocol-vote-stage--nested' : ''} ${isErrorHighlighted ? 'protocol-vote-stage--error' : ''}`}",
    'vote stage shell',
)
s = s.replace("? 'bg-amber-500 text-slate-950 border-amber-400 shadow'\n                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'", "? 'bg-accent text-white border-accent'\n                      : 'bg-surface-1 text-text-secondary border-border-soft hover:bg-surface-hover hover:text-text-primary'")
s = s.replace('className={`w-full h-11 sm:w-8 sm:h-8 rounded-lg text-sm font-bold border transition ${', 'className={`protocol-seat-button w-full sm:w-9 text-sm font-bold transition ${')
s = s.replace("isNominated\n                      ? 'bg-accent text-white border-accent'", "isNominated\n                      ? 'bg-accent text-white border-accent'")
s = s.replace('className="w-full h-11 bg-slate-800 border border-slate-700 rounded px-2 text-center font-bold text-lg text-amber-400 focus:border-amber-500 focus:outline-none', 'className="protocol-noir-field text-center font-bold text-lg text-warning tabular-nums')
s = s.replace('className="w-16 h-10 bg-slate-800 border border-slate-700 rounded text-center font-bold text-md text-amber-400 focus:border-amber-500 focus:outline-none"', 'className="protocol-noir-field !w-20 text-center font-bold text-md text-warning tabular-nums"')
s = s.replace('className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1"', 'className="protocol-action-primary px-3 py-1.5 text-xs flex items-center gap-1"')
s = s.replace('className="bg-slate-800/40 rounded-xl p-8 text-center text-slate-400 text-xs border border-slate-800"', 'className="protocol-noir-section text-center text-text-secondary text-xs py-8"')
s = apply_theme_tokens(s)
s = s.replace('text-purple-400', 'text-accent').replace('border-purple-500', 'border-accent')
s = s.replace('bg-amber-500', 'bg-accent').replace('border-amber-400', 'border-accent')
s = s.replace('focus:border-amber-500', 'focus:border-accent')
p.write_text(s, encoding='utf-8')


# Nights/Best move.
p = Path('src/components/crm/tournaments/protocol/ProtocolNightsTab.tsx')
s = p.read_text(encoding='utf-8')
for old in [
    'bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 flex flex-col space-y-3',
    'bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/80 space-y-2',
    'bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-3',
]:
    s = s.replace(f'className="{old}"', 'className="protocol-noir-section space-y-3"')
s = s.replace("? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'\n                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'", "? 'bg-accent text-white border-accent'\n                      : 'bg-surface-1 text-text-secondary border-border-soft hover:bg-surface-hover hover:text-text-primary'")
s = s.replace('className={`min-h-[44px] flex items-center justify-center rounded-xl text-sm font-bold border transition ${', 'className={`protocol-seat-button text-sm font-bold transition ${')
s = s.replace('className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"', 'className="protocol-noir-field text-xs"')
s = s.replace('className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1"', 'className="protocol-action-primary px-2.5 py-1 text-xs flex items-center gap-1"')
s = s.replace('className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs"', 'className="border-t border-border-soft py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"')
s = apply_theme_tokens(s)
s = s.replace('focus:border-amber-500', 'focus:border-accent')
p.write_text(s, encoding='utf-8')


# Summary tab + mobile alternative to horizontal table.
p = Path('src/components/crm/tournaments/protocol/ProtocolSummaryTab.tsx')
s = p.read_text(encoding='utf-8')
for old in [
    'bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 space-y-3',
    'bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-3',
    'bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-2',
]:
    s = s.replace(f'className="{old}"', 'className="protocol-noir-section space-y-3"')
mobile_rows = r'''        <div className="sm:hidden">
          {playerResults.map((p) => {
            const discPenalty = calculateDisciplinaryPenalty(
              p.minor_technical_fouls || 0,
              p.major_technical_fouls || 0,
              p.exit_type === 'removed',
              protocol.ppk_culprit_participant_id === p.participant_id
            );
            const isRedRole = p.role === 'citizen' || p.role === 'sheriff';
            const isWinner = protocol.winner_team
              ? (protocol.winner_team === 'red' && isRedRole) || (protocol.winner_team === 'black' && !isRedRole)
              : false;
            return (
              <div key={p.participant_id} className="protocol-summary-mobile-row">
                <span className="text-warning font-black tabular-nums">{String(p.seat_number).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary break-words">{p.display_name}</span>
                  <span className="block text-[11px] text-text-secondary mt-0.5">
                    {p.role === 'citizen' && 'Мирный'}
                    {p.role === 'sheriff' && 'Шериф'}
                    {p.role === 'mafia' && 'Мафия'}
                    {p.role === 'don' && 'Дон'}
                    {' · '}
                    {p.exit_type === 'alive' ? 'Жив' : p.exit_type === 'killed' ? 'Убит' : p.exit_type === 'removed' ? 'Снят' : 'Заголосован'}
                  </span>
                  <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] mt-1.5 tabular-nums">
                    <span className="text-warning">Ф {p.regular_fouls}</span>
                    <span className="text-danger">мТ {p.minor_technical_fouls || 0}</span>
                    <span className="text-danger">БТ {p.major_technical_fouls || 0}</span>
                    <span className="text-danger">Дисц. −{discPenalty || 0}</span>
                    <span className="text-accent">Судья {p.judge_bonus || 0}</span>
                    <span className={(p.protocol_bonus || 0) < 0 ? 'text-danger' : 'text-success'}>Прот. {p.protocol_bonus || 0}</span>
                  </span>
                </span>
                <span className={isWinner ? 'text-success font-bold text-xs' : 'text-text-muted text-xs'}>{protocol.winner_team ? (isWinner ? '+1' : '0') : '—'}</span>
              </div>
            );
          })}
        </div>
        <div className="hidden sm:block overflow-x-auto">'''
s = replace_once(s, '<div className="overflow-x-auto">', mobile_rows, 'summary mobile list')
s = apply_theme_tokens(s)
s = s.replace('focus:border-amber-500', 'focus:border-accent').replace('focus:ring-amber-500', 'focus:ring-accent')
p.write_text(s, encoding='utf-8')


# Color protocol editor.
p = Path('src/components/crm/tournaments/protocol/PlayerColorProtocolEditor.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    'className="bg-slate-900/80 rounded-lg p-2.5 border border-slate-700/60 space-y-2"',
    'className="protocol-noir-subsection space-y-2"',
    'color editor shell',
)
s = s.replace("? 'bg-amber-500 text-slate-950 border-amber-400'\n                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'", "? 'bg-accent text-white border-accent'\n                              : 'bg-surface-1 text-text-secondary border-border-soft hover:bg-surface-hover'")
s = s.replace("? 'bg-amber-500 text-slate-950 border-amber-400'\n                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'", "? 'bg-accent text-white border-accent'\n                      : 'bg-surface-2 text-text-secondary border-border-soft hover:bg-surface-hover'")
s = apply_theme_tokens(s)
s = s.replace('bg-amber-500 hover:bg-amber-600 text-slate-950', 'bg-accent hover:bg-accent-hover text-white')
s = s.replace('bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950', 'bg-accent hover:bg-accent-hover disabled:opacity-40 text-white')
p.write_text(s, encoding='utf-8')


# Stepper.
p = Path('src/components/crm/tournaments/protocol/PointStepper.tsx')
s = apply_theme_tokens(p.read_text(encoding='utf-8'))
p.write_text(s, encoding='utf-8')


# Presentation helpers: semantic category colors using canonical theme tokens.
p = Path('src/components/crm/tournaments/protocol/protocolPlayerPresentationUtils.ts')
s = p.read_text(encoding='utf-8')
class_map = {
    'bg-sky-500/10 text-sky-400 border-sky-500/30': 'bg-transparent text-text-secondary border-border-soft',
    'bg-amber-500/10 text-amber-400 border-amber-500/30': 'bg-warning-soft text-warning border-warning/30',
    'bg-rose-500/10 text-rose-400 border-rose-500/30': 'bg-danger-soft text-danger border-danger/30',
    'bg-purple-500/10 text-purple-400 border-purple-500/30': 'bg-accent-soft text-accent border-accent/30',
    'bg-slate-800 text-slate-400 border-slate-700': 'bg-transparent text-text-secondary border-border-soft',
    'bg-rose-500/20 text-rose-400 border-rose-500/30': 'bg-danger-soft text-danger border-danger/30',
    'bg-amber-500/20 text-amber-400 border-amber-500/30': 'bg-warning-soft text-warning border-warning/30',
    'bg-purple-500/20 text-purple-300 border-purple-500/30': 'bg-accent-soft text-accent border-accent/30',
    'bg-rose-600/10 text-rose-400 border-rose-600/30': 'bg-danger-soft text-danger border-danger/30',
    'bg-purple-500/10 text-purple-300 border-purple-500/30': 'bg-danger-soft text-danger border-danger/30',
    'bg-emerald-500/10 text-emerald-300 border-emerald-500/30': 'bg-accent-soft text-accent border-accent/30',
    'bg-rose-500/10 text-rose-300 border-rose-500/30': 'bg-accent-soft text-accent border-accent/30',
    'bg-cyan-500/10 text-cyan-300 border-cyan-500/30': 'bg-success-soft text-success border-success/30',
    'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold': 'bg-warning-soft text-warning border-warning/40 font-bold',
    'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold': 'bg-danger-soft text-danger border-danger/40 font-bold',
    'bg-indigo-500/10 text-indigo-300 border-indigo-500/30': 'bg-transparent text-text-secondary border-border-soft',
}
for old, new in class_map.items():
    s = s.replace(old, new)
p.write_text(s, encoding='utf-8')


# Focused static regression: source must use Noir shell and not legacy active tab/navy shell.
test_path = Path('src/tests/protocolNoirUi.test.ts')
test_path.write_text(r'''import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('2LA NOIRE protocol presentation', () => {
  it('uses the canonical shell, one content scroller, stable player rows and wrapping footer', () => {
    const source = read('src/components/crm/tournaments/GameProtocolModal.tsx');
    expect(source).toContain('protocol-noir-root');
    expect(source).toContain('protocol-noir-shell');
    expect(source).toContain('protocol-noir-content flex-1 min-h-0 overflow-y-auto');
    expect(source).toContain('grid-cols-[34px_32px_minmax(0,1fr)_32px]');
    expect(source).toContain('min-[430px]:grid-cols-2');
    expect(source).not.toContain("? 'bg-amber-500 text-slate-950 font-bold shadow-md'");
    expect(source).not.toContain('overflow-y-auto overflow-x-hidden');
  });

  it('styles all protocol tabs with the same Noir primitives and no purple/indigo legacy stages', () => {
    const voting = read('src/components/crm/tournaments/protocol/ProtocolVotingTab.tsx');
    const nights = read('src/components/crm/tournaments/protocol/ProtocolNightsTab.tsx');
    const summary = read('src/components/crm/tournaments/protocol/ProtocolSummaryTab.tsx');
    expect(voting).toContain('protocol-vote-stage');
    expect(voting).not.toContain('border-purple-500');
    expect(nights).toContain('protocol-noir-section');
    expect(nights).not.toContain('bg-indigo-600');
    expect(summary).toContain('protocol-summary-mobile-row');
    expect(summary).toContain('hidden sm:block overflow-x-auto');
  });

  it('keeps score/status presentation on shared theme tokens instead of a second protocol palette', () => {
    const presentation = read('src/components/crm/tournaments/protocol/protocolPlayerPresentationUtils.ts');
    expect(presentation).toContain('text-accent');
    expect(presentation).toContain('text-success');
    expect(presentation).toContain('text-danger');
    expect(presentation).toContain('text-warning');
    expect(presentation).not.toContain('text-indigo-300');
    expect(presentation).not.toContain('text-purple-300');
  });
});
''', encoding='utf-8')

print('protocol Noir UI patch applied')
