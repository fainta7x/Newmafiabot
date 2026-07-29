import React from 'react';
import { X, Check, Palette } from 'lucide-react';
import { THEMES, ThemeId, applyTheme } from '../../lib/theme.ts';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeId;
  onSelectTheme: (themeId: ThemeId) => void;
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
}) => {
  if (!isOpen) return null;

  const handleSelect = (id: ThemeId) => {
    applyTheme(id);
    onSelectTheme(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-surface-1 border border-border-strong rounded-[20px] max-w-md w-full p-6 space-y-5 text-text-primary shadow-2xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[10px] bg-accent-soft border border-accent/30 flex items-center justify-center text-accent">
              <Palette className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div>
              <h3 className="text-lg font-bold leading-tight">Тема интерфейса</h3>
              <p className="text-xs text-text-secondary">Выберите оформление CRM системы</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[10px] bg-surface-2 hover:bg-surface-hover border border-border-soft flex items-center justify-center text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[1.8]" />
          </button>
        </div>

        <div className="space-y-3">
          {THEMES.map((t) => {
            const isActive = currentTheme === t.id;
            return (
              <div
                key={t.id}
                onClick={() => handleSelect(t.id)}
                className={`p-3.5 rounded-[14px] border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isActive
                    ? 'bg-surface-2 border-accent shadow-md'
                    : 'bg-surface-1 hover:bg-surface-2 border-border-soft hover:border-border-strong'
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-text-primary">{t.name}</span>
                    {isActive && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-soft text-accent border border-accent/30 flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                        Активна
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary truncate">{t.tagline}</p>

                  {/* Swatch Previews */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <div
                      className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: t.bgHex }}
                      title="Фон"
                    />
                    <div
                      className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: t.surfaceHex }}
                      title="Поверхность"
                    />
                    <div
                      className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: t.accentHex }}
                      title="Акцент"
                    />
                    <div
                      className="w-5 h-5 rounded-full border border-white/20 shadow-sm flex items-center justify-center text-[10px] font-bold"
                      style={{ backgroundColor: t.surfaceHex, color: t.textHex }}
                      title="Текст"
                    >
                      Aa
                    </div>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    isActive ? 'border-accent bg-accent text-text-primary' : 'border-border-strong bg-surface-2'
                  }`}
                >
                  {isActive && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 bg-surface-2 hover:bg-surface-hover border border-border-soft rounded-[12px] text-xs font-semibold text-text-primary transition-all cursor-pointer"
        >
          Готово
        </button>
      </div>
    </div>
  );
};
