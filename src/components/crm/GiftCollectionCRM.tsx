import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getJson, sendJson } from '../../lib/requestJson.ts';

type Recipient = { id: string; nickname: string; channel: 'telegram' | 'vk_manual' | 'none'; attendance_count: number | null; last_visit: string | null };
type Contribution = { player_id: string; nickname: string; contact_url: string | null; status: 'invited' | 'pledged' | 'declined' | 'paid'; channel: Recipient['channel']; pledged_amount: number; paid_amount: number };
type CollectionView = { collection: { id: string; honoree_nickname: string; status: string }; contributions: Contribution[]; totals: { pledged: number; paid: number } };
type CollectionRow = { id: string; honoree_nickname: string; status: string; created_at: string };

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const CHANNEL: Record<Recipient['channel'], string> = { telegram: 'Telegram', vk_manual: 'ВК — написать вручную', none: 'нет канала связи' };
const STATUS: Record<Contribution['status'], string> = { invited: 'ждём ответ', pledged: 'готов(а) внести', declined: 'не участвует', paid: 'перевод получен' };

/** «Сбор на подарок»: the organizer opens a birthday collection, sees who pledged and confirms received transfers. Players never see these numbers. */
export function GiftCollectionCRM() {
  const [players, setPlayers] = useState<Array<{ id: string; nickname: string }>>([]);
  const [honoree, setHonoree] = useState('');
  const [preview, setPreview] = useState<Recipient[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [view, setView] = useState<CollectionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [birthdayDraft, setBirthdayDraft] = useState<{ text: string; card_png_base64: string; has_avatar: boolean; evening_id: string | null } | null>(null);
  const [postPlayerId, setPostPlayerId] = useState('');
  const [editedBirthdayText, setEditedBirthdayText] = useState('');

  const fail = (e: any, fallback: string) => setError(e?.message || fallback);
  const loadList = useCallback(async () => {
    try { setRows(await getJson<CollectionRow[]>('/api/gift-collections', 'Не удалось загрузить сборы')); } catch (e) { fail(e, 'Не удалось загрузить сборы'); }
  }, []);
  const loadOne = useCallback(async (id: string) => {
    try { setView(await getJson<CollectionView>(`/api/gift-collections/${encodeURIComponent(id)}`, 'Не удалось открыть сбор')); } catch (e) { fail(e, 'Не удалось открыть сбор'); }
  }, []);
  useEffect(() => {
    // Links from the organizer's Telegram message: ?honoree=<player> opens the setup, ?collection=<id> opens the card.
    try {
      const params = new URLSearchParams(window.location.search);
      const collectionId = params.get('collection');
      const honoreeId = params.get('honoree');
      const birthdayId = params.get('birthday_post');
      if (birthdayId) { setHonoree(birthdayId); setPostPlayerId(birthdayId); void getJson<any>(`/api/birthday-posts/${encodeURIComponent(birthdayId)}/preview`, 'Не удалось подготовить поздравление').then((draft) => { setBirthdayDraft(draft); setEditedBirthdayText(draft.text); }).catch(e => fail(e, 'Не удалось подготовить поздравление')); }
      if (collectionId) void loadOne(collectionId);
      else if (honoreeId) { setHonoree(honoreeId); void getJson<{ recipients: Recipient[] }>(`/api/gift-collections/preview/${encodeURIComponent(honoreeId)}`, 'Не удалось собрать список').then((body) => { setPreview(body.recipients); setExcluded(new Set()); }).catch((e) => fail(e, 'Не удалось собрать список')); }
    } catch { /* an unreadable address just opens the empty screen */ }
    void loadList();
    getJson<any[]>('/api/players', 'Не удалось загрузить игроков').then((list) => setPlayers(list.map((p) => ({ id: String(p.id), nickname: String(p.nickname) })).sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru')))).catch((e) => fail(e, 'Не удалось загрузить игроков'));
  }, [loadList, loadOne]);

  const previewBirthday = async () => {
    if (!honoree) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const result = await getJson<any>(`/api/birthday-posts/${encodeURIComponent(honoree)}/preview`, 'Не удалось подготовить поздравление');
      setBirthdayDraft(result); setEditedBirthdayText(result.text); setPostPlayerId(honoree);
    } catch (e) { fail(e, 'Не удалось подготовить поздравление'); }
    finally { setBusy(false); }
  };
  const publishBirthday = async () => {
    if (!postPlayerId || !editedBirthdayText.trim() || !window.confirm('Опубликовать поздравление во всех активных Telegram-каналах и на стене ВК?')) return;
    setBusy(true); setError('');
    try {
      const result = await sendJson<any>(`/api/birthday-posts/${encodeURIComponent(postPlayerId)}/publish`, 'POST', { evening_id: birthdayDraft?.evening_id || null, text: editedBirthdayText }, 'Не удалось опубликовать поздравление');
      setNotice(`Публикация обработана. Telegram: ${result.telegram?.filter((item: any) => item.ok).length || 0}, ВК: ${result.vk?.status || 'неизвестно'}.`);
    } catch (e) { fail(e, 'Не удалось опубликовать поздравление'); }
    finally { setBusy(false); }
  };
  const showPreview = async () => {
    if (!honoree) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const body = await getJson<{ recipients: Recipient[] }>(`/api/gift-collections/preview/${encodeURIComponent(honoree)}`, 'Не удалось собрать список');
      setPreview(body.recipients); setExcluded(new Set());
    } catch (e) { fail(e, 'Не удалось собрать список'); } finally { setBusy(false); }
  };
  const open = async () => {
    setError(''); setBusy(true);
    try {
      const r = await sendJson<any>('/api/gift-collections', 'POST', { honoree_player_id: honoree, exclude_player_ids: [...excluded] }, 'Не удалось открыть сбор');
      setNotice(`Сбор открыт. Telegram: ${r.telegram}, ВК вручную: ${r.vk_manual}, без канала: ${r.none}.`);
      setPreview(null); await loadList(); await loadOne(r.id);
    } catch (e) { fail(e, 'Не удалось открыть сбор'); } finally { setBusy(false); }
  };
  const patch = async (playerId: string, body: Record<string, unknown>) => {
    if (!view) return;
    setError('');
    try { await sendJson(`/api/gift-collections/${encodeURIComponent(view.collection.id)}/contributions/${encodeURIComponent(playerId)}`, 'PATCH', body, 'Не удалось сохранить'); await loadOne(view.collection.id); }
    catch (e) { fail(e, 'Не удалось сохранить'); }
  };
  const closeCollection = async () => {
    if (!view || !window.confirm('Закрыть сбор? Игроки больше не смогут менять сумму.')) return;
    setError('');
    try { await sendJson(`/api/gift-collections/${encodeURIComponent(view.collection.id)}/close`, 'POST', {}, 'Не удалось закрыть сбор'); await loadOne(view.collection.id); await loadList(); }
    catch (e) { fail(e, 'Не удалось закрыть сбор'); }
  };
  const askAmount = (c: Contribution, key: 'pledged_amount' | 'paid_amount') => {
    const value = window.prompt(key === 'paid_amount' ? 'Сколько получено, ₽ (от 100)?' : 'Сумма, ₽ (от 100)?', String(c.pledged_amount || 100));
    if (value === null) return;
    void patch(c.player_id, key === 'paid_amount' ? { status: 'paid', paid_amount: Number(value) } : { pledged_amount: Number(value) });
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4" data-testid="gift-collection-crm">
      <p className="text-[13px] leading-5 text-text-secondary">Сбор на подарок ко дню рождения: игрокам уходит опрос с суммой, у вас — список «кто сколько». Игроки видят только свой взнос. Жетоны клуба: 1 ₽ = 1 жетон после подтверждения перевода.</p>
      {error ? <p role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
      {notice ? <p role="status" className="rounded-[12px] bg-surface-2 px-3 py-2 text-[13px] text-text-primary">{notice}</p> : null}

      {!view ? <section className="space-y-3 rounded-[16px] border border-border-soft bg-surface-1 p-3">
        <label className="block"><span className="mobile-label">Именинник</span>
          <select className="mobile-field mt-1" value={honoree} onChange={(e) => { setHonoree(e.target.value); setPreview(null); }}>
            <option value="">Выберите игрока</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select></label>
        <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3">
          <h2 className="text-[14px] font-bold">Поздравительный пост</h2>
          <p className="mt-1 text-[12px] text-text-secondary">Сначала проверьте текст и аватарку. Ничего не публикуется автоматически.</p>
          <button type="button" disabled={!honoree || busy} onClick={() => void previewBirthday()} className="mt-2 min-h-11 w-full rounded-xl border border-border-soft px-3 text-[13px] font-semibold">Подготовить поздравление</button>
          {birthdayDraft && postPlayerId === honoree ? <div className="mt-3 space-y-3">
            <img src={`data:image/png;base64,${birthdayDraft.card_png_base64}`} alt="Карточка поздравления" className="w-full rounded-xl" />
            <label className="block text-[13px] font-semibold">Текст поздравления — можно изменить перед публикацией<textarea aria-label="Текст поздравления" className="mobile-field mt-2 min-h-48 w-full whitespace-pre-wrap" rows={10} maxLength={3500} value={editedBirthdayText} onChange={(event) => setEditedBirthdayText(event.target.value)} /></label>
            {!birthdayDraft.evening_id ? <p role="status" className="text-[12px] text-text-secondary">Игрок не записан на будущий вечер. Сначала пригласите его лично — публикация с приглашением пока недоступна.</p> : null}
            <button type="button" disabled={busy || !editedBirthdayText.trim()} onClick={() => void publishBirthday()} className="min-h-12 w-full rounded-xl bg-accent px-3 text-[13px] font-bold text-white disabled:opacity-40">Подтвердить и опубликовать</button>
          </div> : null}
        </section>
        <button type="button" disabled={!honoree || busy} onClick={() => void showPreview()} className="min-h-12 w-full rounded-[14px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">Показать, кому уйдёт опрос</button>
        {preview ? <div className="space-y-2">
          <p className="text-[13px] text-text-secondary">Без именинника, «Из другого города» и «Перестал ходить». Уберите галочку, чтобы не звать человека.</p>
          {preview.map((r) => <label key={r.id} className="flex min-h-12 items-center gap-3 rounded-[12px] bg-surface-2 px-3 text-[14px]">
            <input type="checkbox" checked={!excluded.has(r.id)} onChange={(e) => setExcluded((prev) => { const next = new Set(prev); if (e.target.checked) next.delete(r.id); else next.add(r.id); return next; })} />
            <span className="min-w-0 flex-1"><strong className="block truncate">{r.nickname}</strong><span className="block text-[12px] text-text-secondary">{CHANNEL[r.channel]} · игр: {r.attendance_count ?? 0}</span></span>
          </label>)}
          <button type="button" disabled={busy || preview.length === excluded.size} onClick={() => void open()} className="min-h-12 w-full rounded-[14px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">Открыть сбор и отправить ({preview.length - excluded.size})</button>
        </div> : null}
      </section> : null}

      {view ? <section className="space-y-3" data-testid="gift-collection-detail">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setView(null); setNotice(''); void loadList(); }} className="min-h-11 rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold">← Сборы</button>
          <button type="button" aria-label="Обновить" onClick={() => void loadOne(view.collection.id)} className="grid h-11 w-11 place-items-center rounded-[12px] border border-border-soft text-text-secondary"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-[14px] bg-surface-1 p-3"><div className="text-[12px] text-text-secondary">Цель: готовы внести</div><strong className="text-[18px]">{rub(view.totals.pledged)}</strong></div>
          <div className="rounded-[14px] bg-surface-1 p-3"><div className="text-[12px] text-text-secondary">Сбор: получено</div><strong className="text-[18px]">{rub(view.totals.paid)}</strong></div>
        </div>
        <h2 className="text-[15px] font-bold">Подарок для {view.collection.honoree_nickname}</h2>
        {view.contributions.some((c) => c.status === 'invited') ? <p className="rounded-[12px] bg-surface-2 px-3 py-2 text-[13px] text-text-primary" data-testid="gift-silent">Не ответили: {view.contributions.filter((c) => c.status === 'invited').map((c) => c.nickname).join(', ')}. Игрокам повторно ничего не отправляется — напишите им кнопкой «Написать».</p> : null}
        {[...view.contributions].sort((a, b) => Number(b.status === 'invited') - Number(a.status === 'invited')).map((c) => <div key={c.player_id} className="rounded-[16px] border border-border-soft bg-surface-1 p-3" data-testid="gift-contribution-row">
          <div className="flex items-start justify-between gap-2"><strong className="min-w-0 truncate text-[14px]">{c.nickname}</strong><span className="shrink-0 text-[13px] text-text-secondary">{c.status === 'paid' ? rub(c.paid_amount) : c.pledged_amount ? rub(c.pledged_amount) : ''}</span></div>
          <p className="text-[12px] text-text-secondary">{STATUS[c.status]} · {CHANNEL[c.channel]}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {c.status === 'paid'
              ? <button type="button" onClick={() => void patch(c.player_id, { status: 'unpaid' })} className="min-h-11 flex-1 rounded-[12px] border border-border-soft text-[13px] font-semibold">Не получил(а)</button>
              : <button type="button" disabled={!c.pledged_amount} onClick={() => void patch(c.player_id, { status: 'paid' })} className="min-h-11 flex-1 rounded-[12px] bg-accent text-[13px] font-bold text-white disabled:opacity-30">Перевёл(а) — получено</button>}
            <button type="button" onClick={() => askAmount(c, c.status === 'paid' ? 'paid_amount' : 'pledged_amount')} className="min-h-11 rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold">Сумма</button>
            {c.contact_url ? <a href={c.contact_url} target="_blank" rel="noreferrer" className="grid min-h-11 place-items-center rounded-[12px] border border-border-soft px-3 text-[13px] font-semibold">Написать</a> : null}
          </div>
        </div>)}
        {view.collection.status === 'open' ? <button type="button" onClick={() => void closeCollection()} className="min-h-12 w-full rounded-[14px] border border-border-soft text-[14px] font-semibold text-text-secondary">Закрыть сбор</button> : <p className="text-center text-[13px] text-text-secondary">Сбор закрыт</p>}
      </section> : null}

      {!view && rows.length ? <section className="space-y-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-text-secondary">Сборы</h2>
        {rows.map((r) => <button key={r.id} type="button" onClick={() => void loadOne(r.id)} className="flex min-h-12 w-full items-center justify-between rounded-[14px] border border-border-soft bg-surface-1 px-3 text-left text-[14px]"><strong>{r.honoree_nickname}</strong><span className="text-[12px] text-text-secondary">{r.status === 'open' ? 'открыт' : 'закрыт'}</span></button>)}
      </section> : null}
    </div>
  );
}

export default GiftCollectionCRM;
