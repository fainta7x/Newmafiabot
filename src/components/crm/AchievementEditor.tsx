import { useState } from 'react';

export type Achievement = {
  id: string; name: string; description: string; icon: string; category: string; metric: string; threshold: number;
  role?: string | null; rarity: string; order: number; active: boolean;
};

const fieldClass = 'mobile-field min-h-[44px]';
const apiFetch = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Ошибка запроса');
  return body as T;
};

export function AchievementEditor({ item, onSaved }: { item: Achievement; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState({ ...item });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (key: keyof Achievement, value: any) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin-data/achievements/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(draft),
      });
      await onSaved();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{item.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold text-text-primary">{item.name}</div>
            <div className="mt-0.5 text-[11px] text-text-secondary">{item.active ? 'выдаётся' : 'выключена'} · порог {item.threshold}</div>
          </div>
        </div>
      </summary>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1 block text-[11px] text-text-muted">Название</span><input className={fieldClass} value={draft.name} onChange={(e) => update('name', e.target.value)} /></label>
        <label><span className="mb-1 block text-[11px] text-text-muted">Иконка</span><input className={fieldClass} value={draft.icon} onChange={(e) => update('icon', e.target.value)} /></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-[11px] text-text-muted">За что даётся</span><textarea className="mobile-field min-h-[82px]" value={draft.description} onChange={(e) => update('description', e.target.value)} /></label>
        <label><span className="mb-1 block text-[11px] text-text-muted">Условие</span><select className={fieldClass} value={draft.metric} disabled={item.metric === 'story'} onChange={(e) => update('metric', e.target.value)}><option value="story">История игры (условие фиксировано)</option><option value="organized">Проведённые вечера</option><option value="games">Количество игр</option><option value="wins">Победы</option><option value="rating">Elo</option><option value="judged">Отсуженные игры</option><option value="role">Победы на роли</option><option value="pu">ПУ</option><option value="perfect_game">Идеальные игры</option><option value="split_expert">Экзамен эксперта по попилу</option><option value="poker_wins">Победы в покерных турнирах</option></select></label>
        <label><span className="mb-1 block text-[11px] text-text-muted">Порог</span><input className={fieldClass} type="number" value={draft.threshold} disabled={item.metric === 'story'} onChange={(e) => update('threshold', Number(e.target.value))} /></label>
        {draft.metric === 'role' ? <label><span className="mb-1 block text-[11px] text-text-muted">Роль</span><select className={fieldClass} value={draft.role || ''} onChange={(e) => update('role', e.target.value)}><option value="sheriff">Шериф</option><option value="mafia">Мафия</option><option value="don">Дон</option></select></label> : null}
        <label><span className="mb-1 block text-[11px] text-text-muted">Редкость</span><select className={fieldClass} value={draft.rarity} onChange={(e) => update('rarity', e.target.value)}><option value="common">Обычная</option><option value="rare">Редкая</option><option value="epic">Эпическая</option><option value="legendary">Легендарная</option></select></label>
        <label><span className="mb-1 block text-[11px] text-text-muted">Категория</span><select className={fieldClass} value={draft.category} onChange={(e) => update('category', e.target.value)}><option value="games">Игровые</option><option value="wins">Победные</option><option value="rating">Рейтинговые</option><option value="roles">Ролевые</option><option value="judge">Судейские</option><option value="special">Особые</option><option value="learning">Обучение</option></select></label>
        <label><span className="mb-1 block text-[11px] text-text-muted">Порядок</span><input className={fieldClass} type="number" value={draft.order} onChange={(e) => update('order', Number(e.target.value))} /></label>
        <label className="flex items-center gap-2 pt-5 text-[12px]"><input type="checkbox" checked={draft.active} onChange={(e) => update('active', e.target.checked)} /> Показывать и автоматически выдавать</label>
      </div>

      {error ? <p className="mt-3 text-[12px] font-semibold text-danger">{error}</p> : null}
      <button type="button" disabled={saving} onClick={() => void save()} className="mt-4 min-h-11 w-full rounded-[12px] bg-accent text-[13px] font-bold text-white disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить ачивку'}</button>
    </details>
  );
}

