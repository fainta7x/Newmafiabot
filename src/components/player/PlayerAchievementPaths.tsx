import { useState } from 'react';
import { STORY_PATHS, STORY_IDS, type StoryEvidence } from '../../lib/achievementStories';
import { openPlayerGame } from './playerProfileNavigation';

export type PathAchievement = { id: string; name: string; description: string; icon: string; earned: boolean; earned_at: string | null;
  rarity_name?: string; progress?: { current: number; target: number } | null; evidence?: StoryEvidence | null; steps?: string[] };
export type AchievementPathsProfile = { earned: number; total: number; categories?: Array<{ achievements: PathAchievement[] }> };
export default function PlayerAchievementPaths({ profile, isSelf, preferences }: { profile: AchievementPathsProfile; isSelf: boolean;
  preferences?: { path_id: string; pins: string[] } | null }) {
  const all = profile.categories?.flatMap(c => c.achievements) || [];
  const stories = all.filter(a => STORY_IDS.has(a.id));
  const [path, setPath] = useState(preferences?.path_id || STORY_PATHS[0].id);
  const [pins, setPins] = useState<string[]>(preferences?.pins || []);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const current = STORY_PATHS.find(p => p.id === path) || STORY_PATHS[0];
  const pathItems = stories.filter(a => current.ids.includes(a.id));
  const save = async (nextPath: string, nextPins: string[]) => {
    if (!isSelf || busy) return;
    setBusy(true);setError('');
    try {
      const r = await fetch('/api/player/achievement-preferences', { method: 'PATCH', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({path_id:nextPath,pins:nextPins}) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error || 'Не удалось сохранить');
      setPath(nextPath);setPins(nextPins);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить'); } finally { setBusy(false); }
  };
  const card = (a: PathAchievement) => <article key={a.id} className={`rounded-2xl border p-4 ${a.earned ? 'border-amber-200/20 bg-amber-200/[.04]' : 'border-white/10 bg-black/20'}`}>
    <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{a.icon} {a.name}</h3><span className="shrink-0 text-xs text-white/50">{a.earned ? '✓ Получено' : a.rarity_name}</span></div>
    <p className="mt-2 text-sm leading-relaxed text-white/60">{a.description}</p>
    {!a.earned && a.progress && a.progress.target > 1 && <p className="mt-2 text-sm text-white/70">Прогресс: {a.progress.current} из {a.progress.target}</p>}
    {a.id === 'four_faces' && (isSelf || a.earned) && <div className="mt-2 flex flex-wrap gap-2">{[['citizen','Мирный'],['sheriff','Шериф'],['mafia','Мафия'],['don','Дон']].map(([id,label]) => <span key={id} className="rounded-lg bg-white/5 px-2 py-1 text-xs">{a.earned || a.steps?.includes(id) ? '✓' : '○'} {label}</span>)}</div>}
    {a.earned_at && <p className="mt-2 text-xs text-white/45">{new Date(a.earned_at).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'})}</p>}
    {isSelf && a.earned && a.evidence && <p className="mt-2 text-sm text-white/60">{a.evidence.detail}</p>}
    {isSelf && a.earned && a.evidence?.gameId && <a className="mt-2 flex min-h-11 items-center text-sm underline" href={`/player/games/${encodeURIComponent(a.evidence.gameId)}`} onClick={e => { e.preventDefault();openPlayerGame(a.evidence!.gameId!); }}>Открыть партию</a>}
    {isSelf && a.earned && STORY_IDS.has(a.id) && <button disabled={busy || (!pins.includes(a.id) && pins.length >= 3)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 px-3 text-sm disabled:opacity-40" onClick={() => void save(path,pins.includes(a.id) ? pins.filter(id => id !== a.id) : [...pins,a.id])}>{pins.includes(a.id) ? 'Убрать из закреплённых' : pins.length >= 3 ? 'Закреплено 3 достижения' : 'Закрепить достижение'}</button>}
  </article>;
  return <section data-testid="achievement-paths" className="rounded-3xl border border-white/10 bg-white/[.035] p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Истории и пути</h2><span className="text-sm text-white/60">{stories.filter(a => a.earned).length}/{stories.length}</span></div>
    <p className="mt-1 text-sm text-white/50">Цели в игре и жизни клуба. Истории открываются после завершения партии.</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}
    {pins.length > 0 && <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">Закреплённые истории</h3><div className="grid gap-3 sm:grid-cols-2">{stories.filter(a => a.earned && pins.includes(a.id)).map(card)}</div></div>}
    <label className="mt-4 block text-sm text-white/70">Путь<select aria-label="Путь достижений" disabled={busy} value={path} onChange={e => isSelf ? void save(e.target.value,pins) : setPath(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-[#090a0d] px-3 text-sm">{STORY_PATHS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{pathItems.length ? pathItems.map(card) : <p className="text-sm text-white/50">В этом пути пока нет доступных целей.</p>}</div>
    <details className="mt-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Все истории · {stories.length}</summary><div className="mt-2 grid gap-3 sm:grid-cols-2">{stories.map(card)}</div></details>
    <details className="mt-2 border-t border-white/10 pt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Коллекция опыта и обучения</summary><p className="mb-3 text-sm text-white/50">Прежние достижения и даты получения сохранены. Игры, победы, рейтинг и обучение.</p><div className="grid gap-3 sm:grid-cols-2">{all.filter(a => !STORY_IDS.has(a.id)).map(card)}</div></details>
    <p className="mt-4 text-xs leading-relaxed text-white/45">Для историй о ходе партии нужен полный журнал. Старые игры учитываются там, где сохранённых фактов достаточно.</p>
  </section>;
}
