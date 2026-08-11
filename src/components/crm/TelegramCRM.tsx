import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Send, TestTube2 } from 'lucide-react';

type DestinationId = 'public' | 'novice' | 'club' | 'rating';

type Destination = {
  id: DestinationId;
  name: string;
  description: string;
  chat_id: string | null;
  topic_id: number | null;
  invite_url: string | null;
  active: boolean;
  configured: boolean;
  router_message_id: number | null;
  updated_at: string;
};

type Draft = {
  chat_id: string;
  topic_id: string;
  invite_url: string;
  active: boolean;
};

const meta: Record<DestinationId, { eyebrow: string; route: string; topic: boolean }> = {
  public: { eyebrow: 'Вход', route: 'NOVICE + CASUAL · только публичная витрина двух путей', topic: false },
  novice: { eyebrow: 'Новички', route: 'NOVICE → тема «Анонсы игр»', topic: true },
  club: { eyebrow: 'Основной клуб', route: 'CASUAL → тема «Запись на игровой вечер»', topic: true },
  rating: { eyebrow: 'Закрытый доступ', route: 'RATING + TOURNAMENT', topic: false },
};

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
  return body;
};

export const TelegramCRM: React.FC = () => {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const body = await request('/api/telegram-settings');
      const rows = (body?.destinations || []) as Destination[];
      setDestinations(rows);
      setDrafts(Object.fromEntries(rows.map((item) => [item.id, {
        chat_id: item.chat_id || '',
        topic_id: item.topic_id ? String(item.topic_id) : '',
        invite_url: item.invite_url || '',
        active: Boolean(item.active),
      }])));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить Telegram-настройки');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const configuredCount = useMemo(() => destinations.filter((item) => item.active && item.configured).length, [destinations]);

  const patchDraft = (id: DestinationId, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || { chat_id: '', topic_id: '', invite_url: '', active: false }), ...patch } }));
  };

  const save = async (id: DestinationId) => {
    const draft = drafts[id];
    if (!draft || busy) return;
    setBusy(`save:${id}`); setMessage(null); setError(null);
    try {
      const updated = await request(`/api/telegram-settings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          chat_id: draft.chat_id.trim() || null,
          topic_id: meta[id].topic ? (draft.topic_id.trim() || null) : null,
          invite_url: draft.invite_url.trim() || null,
          active: draft.active,
        }),
      });
      setDestinations((current) => current.map((item) => item.id === id ? updated : item));
      setMessage(`«${updated.name}» сохранено.`);
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить направление');
    } finally { setBusy(null); }
  };

  const test = async (id: DestinationId) => {
    if (busy) return;
    setBusy(`test:${id}`); setMessage(null); setError(null);
    try {
      await request(`/api/telegram-settings/${id}/test`, { method: 'POST' });
      setMessage(`Тест отправлен в «${destinations.find((item) => item.id === id)?.name || id}». Проверь Telegram.`);
    } catch (err: any) {
      setError(err?.message || 'Тестовая отправка не удалась');
    } finally { setBusy(null); }
  };

  const syncPublic = async () => {
    if (busy) return;
    setBusy('sync-public'); setMessage(null); setError(null);
    try {
      const result = await request('/api/telegram-settings/actions/sync-public', { method: 'POST' });
      setMessage(result?.skipped ? 'Публичный канал пока выключен.' : 'Публичный маршрутизатор обновлён.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Не удалось обновить публичный маршрутизатор');
    } finally { setBusy(null); }
  };

  if (loading) return <div className="flex min-h-[45vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-accent" /></div>;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Telegram</div>
        <h2 className="mt-1 text-[24px] font-black tracking-tight text-text-primary">Публикации клуба</h2>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">
          Событие само выбирает нужное место по формату. Никаких Chat ID в коде: здесь хранится реальная структура клуба.
        </p>
      </div>

      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <strong className="text-[14px] text-text-primary">Готовность</strong>
            <p className="mt-1 text-[11px] text-text-secondary">Активно настроено {configuredCount} из 4 направлений.</p>
          </div>
          <span className="rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-secondary">{configuredCount}/4</span>
        </div>
        <div className="mt-3 grid gap-1.5 text-[11px] text-text-secondary sm:grid-cols-2">
          <div>🌱 NOVICE → публичный + Школа</div>
          <div>🎭 CASUAL → публичный + основной клуб</div>
          <div>🏆 RATING → закрытый канал</div>
          <div>🏆 TOURNAMENT → закрытый канал</div>
        </div>
      </section>

      {message ? <div className="rounded-[14px] bg-success-soft px-4 py-3 text-[12px] text-success">{message}</div> : null}
      {error ? <div className="rounded-[14px] bg-danger-soft px-4 py-3 text-[12px] text-danger">{error}</div> : null}

      {destinations.map((destination) => {
        const id = destination.id;
        const draft = drafts[id] || { chat_id: '', topic_id: '', invite_url: '', active: false };
        return (
          <section key={id} className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">{meta[id].eyebrow}</div>
                <h3 className="mt-1 text-[17px] font-black text-text-primary">{destination.name}</h3>
                <p className="mt-1 text-[11px] leading-5 text-text-secondary">{destination.description}</p>
                <p className="mt-1 text-[10px] font-bold text-accent">{meta[id].route}</p>
              </div>
              <button
                type="button"
                onClick={() => patchDraft(id, { active: !draft.active })}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${draft.active ? 'bg-success-soft text-success' : 'bg-surface-2 text-text-muted'}`}
              >
                {draft.active ? 'Включено' : 'Выключено'}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Chat ID</span>
                <input
                  value={draft.chat_id}
                  onChange={(event) => patchDraft(id, { chat_id: event.target.value })}
                  placeholder="-100… или @username"
                  className="mt-1.5 min-h-11 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[12px] text-text-primary outline-none focus:border-accent/50"
                />
              </label>
              {meta[id].topic ? (
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Topic ID</span>
                  <input
                    value={draft.topic_id}
                    onChange={(event) => patchDraft(id, { topic_id: event.target.value.replace(/\D/g, '') })}
                    placeholder="ID нужной темы форума"
                    inputMode="numeric"
                    className="mt-1.5 min-h-11 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[12px] text-text-primary outline-none focus:border-accent/50"
                  />
                </label>
              ) : (
                <div className="rounded-[12px] border border-border-soft bg-surface-2 px-3 py-2.5 text-[10px] leading-4 text-text-muted">Это канал — Topic ID не нужен.</div>
              )}
            </div>

            <label className="mt-3 block">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Ссылка для входа</span>
              <input
                value={draft.invite_url}
                onChange={(event) => patchDraft(id, { invite_url: event.target.value })}
                placeholder="https://t.me/..."
                className="mt-1.5 min-h-11 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[12px] text-text-primary outline-none focus:border-accent/50"
              />
              {id === 'rating' ? <span className="mt-1 block text-[10px] text-text-muted">Ссылка хранится для внутреннего доступа. В публичный канал она не попадёт.</span> : null}
            </label>

            {id === 'public' && destination.router_message_id ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-[10px] font-bold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Живой закреп: сообщение #{destination.router_message_id}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void save(id)}
                className="min-h-11 rounded-[12px] bg-accent px-3 text-[11px] font-bold text-white disabled:opacity-50"
              >
                {busy === `save:${id}` ? 'Сохраняем…' : 'Сохранить'}
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || !destination.configured}
                onClick={() => void test(id)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[11px] font-bold text-text-primary disabled:opacity-40"
              >
                <TestTube2 className="h-4 w-4" /> Тест
              </button>
            </div>
          </section>
        );
      })}

      <section className="rounded-[18px] border border-accent/20 bg-accent-soft p-4">
        <div className="flex gap-3">
          <Send className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <h3 className="text-[13px] font-black text-text-primary">Публичный живой маршрутизатор</h3>
            <p className="mt-1 text-[11px] leading-5 text-text-secondary">Показывает только ближайшую игру новичков и ближайший обычный клубный вечер. Рейтинг и турниры в него не попадают.</p>
          </div>
        </div>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void syncPublic()}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-accent text-[11px] font-bold text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${busy === 'sync-public' ? 'animate-spin' : ''}`} /> Обновить закреп сейчас
        </button>
      </section>
    </div>
  );
};

export default TelegramCRM;
