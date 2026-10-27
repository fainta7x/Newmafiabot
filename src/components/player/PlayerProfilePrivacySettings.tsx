import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, sendJson } from '../../lib/requestJson.ts';
import PlayerSettingsLoadState from './PlayerSettingsLoadState.tsx';

type Visibility = { real_name:boolean; birthday_day_month:boolean; birth_year:boolean; telegram_username:boolean; phone:boolean; game_statistics:boolean; connections:boolean };
const LABELS: Array<[keyof Visibility,string,string]> = [
  ['real_name','Настоящее имя','Показывать другим игрокам'],
  ['birthday_day_month','День и месяц рождения','Год рождения остаётся отдельной настройкой'],
  ['birth_year','Год рождения / возраст','По умолчанию скрыто'],
  ['telegram_username','Telegram username','Контакт по умолчанию скрыт'],
  ['phone','Телефон','Контакт по умолчанию скрыт'],
  ['game_statistics','Игровая статистика','Игры, роли и Elo'],
  ['connections','Игровые связи','С кем чаще играешь и совместная статистика'],
];
export default function PlayerProfilePrivacySettings() {
  const [v, setV] = useState<Visibility | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    setLoadError('');
    try {
      const body = await getJson<{ visibility: Visibility }>('/api/player/privacy-settings', 'Не удалось загрузить настройки приватности');
      if (!body.visibility) throw new Error('Не удалось загрузить настройки приватности');
      setV(body.visibility);
    } catch (e: any) { setLoadError(e?.message || 'Не удалось загрузить настройки приватности'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!v) return <PlayerSettingsLoadState title="Приватность профиля" loading="Загрузка приватности…" error={loadError} onRetry={() => void load()} />;
  const save = async (next: Visibility) => {
    if (savingRef.current) return;
    savingRef.current = true;
    const previous = v;
    setV(next); setSaving(true); setMessage(''); setSaveError('');
    try {
      const body = await sendJson<{ visibility: Visibility }>('/api/player/privacy-settings', 'PATCH', { visibility: next }, 'Не удалось сохранить');
      if (!body.visibility) throw new Error('Не удалось подтвердить сохранение');
      setV(body.visibility); setMessage('Сохранено');
    } catch (e: any) { setV(previous); setSaveError(e?.message || 'Не удалось сохранить'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4" aria-busy={saving}>
    <h2 className="font-semibold">Приватность профиля</h2>
    <p className="mt-1 text-xs text-white/50">Организатор видит контакты и дату рождения целиком. Для других игроков видимость настраивается отдельно.</p>
    <div className="mt-4 divide-y divide-white/10">{LABELS.map(([key, title, desc]) => <label key={key} className="flex items-center gap-3 py-3">
      <span className="min-w-0 flex-1"><span className="block text-sm">{title}</span><span className="block text-[11px] text-white/45">{desc}</span></span>
      <input type="checkbox" aria-label={title} checked={v[key]} disabled={saving} onChange={(e) => void save({ ...v, [key]: e.target.checked })} className="h-5 w-5 disabled:opacity-40" />
    </label>)}</div>
    {(saving || message) && <div role="status" className="pt-2 text-xs text-white/45">{saving ? 'Сохранение…' : message}</div>}
    {saveError && <div role="alert" className="pt-2 text-xs text-rose-300">{saveError}</div>}
  </section>;
}
