import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getJson, sendJson } from '../../lib/requestJson.ts';

type Person = { player_id: string; nickname: string; telegram_url: string | null; vk_url: string | null };
type Category = { key: string; label: string; hint: string; total: number; hidden: number; people: Person[] };
type Hygiene = { categories: Category[]; checked: number; quiet_days: number };

/**
 * «Гигиена клуба» (owner, 2026-10-29): the roster checked by category — no avatar, no birthday and so on — to be walked through
 * like tasks. A category is a filter; «Написал» sends the person out of every category for the quiet period.
 */
export default function ClubHygieneCRM({ onOpenPlayer }: { onOpenPlayer: (playerId: string) => void }) {
  const [data, setData] = useState<Hygiene | null>(null);
  const [active, setActive] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const body = await getJson<Hygiene>('/api/crm/hygiene', 'Не удалось проверить клуб', { cache: 'no-store' });
      setData(body); setError('');
      setActive((current) => current && body.categories.some((c) => c.key === current) ? current : (body.categories.find((c) => c.total > 0)?.key || body.categories[0]?.key || ''));
    } catch (e: any) { setError(e?.message || 'Не удалось проверить клуб'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const wrote = async (person: Person) => {
    if (busy) return;
    setBusy(person.player_id); setError('');
    try { await sendJson('/api/crm/agenda/contacted', 'POST', { player_id: person.player_id, reason: 'profile' }, 'Не удалось отметить'); await load(); }
    catch (e: any) { setError(e?.message || 'Не удалось отметить'); } finally { setBusy(''); }
  };

  const category = data?.categories.find((c) => c.key === active);
  return (
    <section data-testid="club-hygiene" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-text-primary">Гигиена клуба</h3>
          <p className="text-[12px] leading-4 text-text-muted">Проверка списка игроков по категориям{data ? ` · проверено ${data.checked}` : ''}. Выберите категорию и пройдите по людям.</p>
        </div>
        <button type="button" onClick={() => void load()} aria-label="Обновить" className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-text-muted"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {error ? <p role="alert" className="mt-2 rounded-[10px] bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</p> : null}
      {data ? <>
        <div role="tablist" aria-label="Категории гигиены" className="mt-3 flex flex-wrap gap-1.5">
          {data.categories.map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={c.key === active} onClick={() => setActive(c.key)}
              className={`min-h-11 rounded-[12px] border px-3 text-[13px] font-semibold ${c.key === active ? 'border-accent bg-accent/10 text-accent' : 'border-border-soft text-text-secondary'}`}>
              {c.label} · {c.total}
            </button>
          ))}
        </div>
        {category ? <div className="mt-3">
          <p className="text-[12px] leading-4 text-text-muted">{category.hint}</p>
          <p className="mt-1 text-[11px] leading-4 text-text-muted">«Написал» — вы уже связались: человек уйдёт из всех категорий на {data.quiet_days} дн. и вернётся, если ничего не изменится. Имя — открыть карточку игрока и поправить самому.{category.hidden ? ` Сейчас скрыто после «Написал»: ${category.hidden}.` : ''}</p>
          {!category.people.length ? <p className="mt-2 rounded-[12px] bg-success-soft px-3 py-2 text-[13px] text-success">В этой категории всё в порядке.</p> : <div className="mt-2 space-y-1.5">
            {category.people.map((person) => (
              <div key={person.player_id} data-testid="hygiene-person" className="rounded-[11px] bg-surface-2 px-2.5 py-2">
                <button type="button" onClick={() => onOpenPlayer(person.player_id)} className="block min-h-9 w-full text-left"><strong className="block truncate text-[13px] text-text-primary">{person.nickname}</strong></button>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {person.telegram_url ? <a href={person.telegram_url} target="_blank" rel="noreferrer" className="flex min-h-9 items-center rounded-[9px] border border-border-soft px-2.5 text-[12px] font-semibold text-text-primary">Telegram</a> : null}
                  {person.vk_url ? <a href={person.vk_url} target="_blank" rel="noreferrer" className="flex min-h-9 items-center rounded-[9px] border border-border-soft px-2.5 text-[12px] font-semibold text-text-primary">VK</a> : null}
                  <button type="button" disabled={Boolean(busy)} onClick={() => void wrote(person)} className="flex min-h-9 items-center rounded-[9px] bg-success-soft px-2.5 text-[12px] font-bold text-success disabled:opacity-50">{busy === person.player_id ? '…' : 'Написал'}</button>
                </div>
              </div>
            ))}
          </div>}
        </div> : null}
      </> : !error ? <p className="mt-3 text-[12px] text-text-muted">Проверяем…</p> : null}
    </section>
  );
}
