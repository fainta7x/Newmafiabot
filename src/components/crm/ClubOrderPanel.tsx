import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react';
import type { EveningSection } from './EveningWorkspace.tsx';

type Category = 'evenings' | 'statuses' | 'profiles' | 'money';
type Action =
  | { type: 'evening'; evening_id: string; section: EveningSection }
  | { type: 'player'; player_id: string }
  | { type: 'create_evening' };
type Item = {
  id: string;
  category: Category;
  title: string;
  detail: string;
  action: Action;
  action_label: string;
  people?: Array<{ player_id: string; nickname: string; detail?: string }>;
  people_total?: number;
};
type Payload = { items: Item[]; count: number; categories: Record<Category, string> };

const ORDER: Category[] = ['evenings', 'money', 'statuses', 'profiles'];

/**
 * «Порядок в клубе» (user-approved 2026-09-24): what needs the organizer right now, grouped,
 * one button per item; an item disappears once the underlying problem is fixed.
 */
export default function ClubOrderPanel({ refreshKey = 0, onOpenEveningSection, onOpenPlayer, onCreateEvening }: {
  refreshKey?: number;
  onOpenEveningSection: (id: string, section: EveningSection) => void;
  onOpenPlayer: (id: string) => void;
  onCreateEvening: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/crm/club-order', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить «Порядок в клубе»');
      if (!Array.isArray(body?.items)) throw new Error('Не удалось загрузить «Порядок в клубе»');
      setData(body as Payload);
      setError('');
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить «Порядок в клубе»');
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  const run = (action: Action) => {
    if (action.type === 'evening') onOpenEveningSection(action.evening_id, action.section);
    else if (action.type === 'player') onOpenPlayer(action.player_id);
    else onCreateEvening();
  };

  return (
    <section data-testid="club-order" aria-label="Порядок в клубе" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent/10 text-accent"><ClipboardCheck className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-text-primary">Порядок в клубе{data?.count ? <span data-testid="club-order-count" className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 align-middle text-[12px] font-bold text-warning">{data.count}</span> : null}</h3>
          <p className="text-[12px] leading-4 text-text-muted">Что стоит поправить. Пункт исчезнет сам, когда всё будет сделано.</p>
        </div>
      </div>
      {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
      {!data && !error ? <div className="flex min-h-14 items-center justify-center"><RefreshCw className="h-4 w-4 animate-spin text-accent" /></div> : null}
      {data && !data.items.length ? (
        <div className="mt-3 flex min-h-11 items-center gap-2 rounded-[12px] bg-success-soft px-3 text-[13px] text-success"><CheckCircle2 className="h-4 w-4" /> Всё в порядке — делать ничего не нужно.</div>
      ) : null}
      {data?.items.length ? (
        <div className="mt-3 space-y-3">
          {ORDER.filter((category) => data.items.some((item) => item.category === category)).map((category) => (
            <div key={category}>
              <div className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-muted">{data.categories[category]}</div>
              <div className="mt-1.5 space-y-1.5">
                {data.items.filter((item) => item.category === category).map((item) => (
                  <div key={item.id} data-testid={`club-order-item-${item.id}`} className="rounded-[12px] bg-surface-2 p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <strong className="block text-[14px] leading-5 text-text-primary">{item.title}</strong>
                        <span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">{item.detail}</span>
                      </div>
                      {/* A list of players is fixed player by player, so the names are the buttons. */}
                      {item.action.type === 'player' && item.people?.length ? null : (
                        <button type="button" onClick={() => run(item.action)} className="flex min-h-10 shrink-0 items-center gap-1 rounded-[10px] bg-accent px-3 text-[12px] font-bold text-white">
                          {item.action_label}<ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {item.people?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.people.map((person) => (
                          <button key={`${item.id}:${person.player_id}`} type="button" onClick={() => onOpenPlayer(person.player_id)} className="min-h-9 max-w-full truncate rounded-full border border-border-soft bg-surface-1 px-3 text-[12px] font-semibold text-text-primary">
                            {person.nickname}{person.detail ? <span className="font-normal text-text-muted"> · {person.detail}</span> : null}
                          </button>
                        ))}
                        {(item.people_total || 0) > item.people.length ? <span className="flex min-h-9 items-center px-1 text-[12px] text-text-muted">и ещё {(item.people_total || 0) - item.people.length}</span> : null}
                      </div>
                    ) : null}
                    {item.action.type === 'player' && item.people?.length ? <p className="mt-1.5 text-[12px] text-text-muted">Нажми на игрока — откроется его профиль.</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
