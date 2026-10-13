import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.ts';
import { PORTRAIT_EQUIPMENT_SLOTS, PORTRAIT_SLOT_LABELS, type DraftSet, type DraftWearableItem, type PortraitEquipmentSlot } from '../../lib/roleLooks.ts';
import RolePortrait from './RolePortrait.tsx';
import './cosmeticSetStudio.css';

export type CosmeticSetStudioClient = Pick<typeof api,
  'getCosmeticDraftSets' | 'getCosmeticDraftItems' | 'createCosmeticDraftSet' | 'saveCosmeticDraftSetItems'>;

const rarityLabels: Record<string, string> = {
  common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий',
  epic: 'Эпический', legendary: 'Легендарный', mythic: 'Мифический',
};
type Selection = Partial<Record<PortraitEquipmentSlot, string>>;
const fromSet = (set: DraftSet): Selection => Object.fromEntries(
  set.items.map(item => [item.slot, item.id]),
) as Selection;
const itemIds = (s: Selection): string[] => PORTRAIT_EQUIPMENT_SLOTS.flatMap(slot => s[slot] ? [s[slot]] : []);
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

/** Explicit author-only draft workbench. Neither a player shop nor an asset publisher. */
export default function CosmeticSetStudio({
  client = api, portraitUrl, initialOpen = false, allowCreate = true,
}: {
  client?: CosmeticSetStudioClient; portraitUrl?: string | null; initialOpen?: boolean; allowCreate?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [sets, setSets] = useState<DraftSet[]>([]);
  const [catalog, setCatalog] = useState<DraftWearableItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [selection, setSelection] = useState<Selection>({});
  const [newName, setNewName] = useState('');
  const [newRarity, setNewRarity] = useState<'common' | 'rare' | 'legendary'>('common');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(false); setError('');
    Promise.all([client.getCosmeticDraftSets(), client.getCosmeticDraftItems()]).then(([foundSets, foundItems]) => {
      if (cancelled) return;
      setSets(foundSets); setCatalog(foundItems);
      setActiveId(previous => foundSets.some(set => set.id === previous) ? previous : foundSets[0]?.id || '');
      setLoaded(true);
    }).catch(() => { if (!cancelled) { setLoaded(true); setError('Не удалось загрузить мастерскую. Проверьте права владельца и повторите.'); } });
    return () => { cancelled = true; };
  }, [client, open, reload]);

  const active = sets.find(set => set.id === activeId);
  useEffect(() => { setSelection(active ? fromSet(active) : {}); setNotice(''); }, [active]);
  const eligible = useMemo(() => catalog.filter(item =>
    !active || !item.seasonId || item.seasonId === active.seasonId,
  ), [catalog, active]);
  const selected = itemIds(selection);
  const changed = Boolean(active && !sameIds(selected, active.items.map(item => item.id)));
  const chosenLayers = PORTRAIT_EQUIPMENT_SLOTS.flatMap(slot => {
    const item = eligible.find(item => item.id === selection[slot] && item.slot === slot);
    return item ? [{ slot, itemId: item.id, url: item.url }] : [];
  });

  const chooseSet = (id: string) => {
    if (busy) return;
    if (changed && !window.confirm('Есть несохранённые изменения состава. Переключить сет без сохранения?')) return;
    setActiveId(id); setError(''); setNotice('');
  };
  const updateSlot = (slot: PortraitEquipmentSlot, itemId: string | null) => {
    setError(''); setNotice('');
    setSelection(previous => {
      const next = { ...previous };
      if (itemId) next[slot] = itemId;
      else delete next[slot];
      return next;
    });
  };
  const persist = async () => {
    if (!active || !changed || busy || active.published) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await client.saveCosmeticDraftSetItems(active.id, selected);
      const foundSets = await client.getCosmeticDraftSets();
      setSets(foundSets);
      setNotice('Состав черновика сохранён. Предметы не опубликованы и никому не выданы.');
    } catch {
      setError('Не получилось сохранить состав. Проверьте слот, сезон и наличие предметов. Изменения оставлены в черновике.');
    } finally { setBusy(false); }
  };
  const create = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      // The technical key has no design semantics; title and rarity come from owner.
      const id = `wardrobe-set-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      await client.createCosmeticDraftSet({ id, name: newName.trim(), rarity: newRarity, seasonId: null });
      const foundSets = await client.getCosmeticDraftSets();
      setSets(foundSets); setActiveId(id); setNewName('');
      setNotice('Новый черновик создан. Он не опубликован; сезон ещё не назначен.');
    } catch {
      setError('Не удалось создать черновик. Название и выбранная редкость сохранены в форме.');
    } finally { setBusy(false); }
  };

  return <details className="cosmetic-set-studio" open={initialOpen} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>Мастерская сетов · черновики <span>Раздельные вещи, независимые слоты, предварительная примерка</span></summary>
    {open && <div className="cosmetic-set-studio-body">
      <p className="cosmetic-set-studio-muted">Только для владельца. Здесь можно собрать коллекцию из существующих предметов, не публикуя её и не меняя инвентарь. В «Огненной осени» согласованы две обычные, две редкие и одна легендарная коллекции. Их состав пока не утверждён.</p>
      {error && <p role="alert">{error}</p>}
      {!loaded && <p role="status">Загрузка черновиков…</p>}
      {loaded && <>
        <nav className="cosmetic-set-studio-tabs" role="group" aria-label="Черновики сетов">
          {sets.length ? sets.map(set =>
            <button key={set.id} type="button" disabled={busy} aria-pressed={activeId === set.id} onClick={() => chooseSet(set.id)}>
              <strong>{set.name}</strong><span>{rarityLabels[set.rarity] || set.rarity} · {set.items.length} шт.</span>
            </button>,
          ) : <p className="cosmetic-set-studio-muted">Черновиков ещё нет. Сначала задайте название и редкость, либо используйте локальный тестовый стенд.</p>}
        </nav>
        {allowCreate && <section className="cosmetic-set-studio-create" aria-label="Новый черновик">
          <label>Название будущего сета<input value={newName} maxLength={120} disabled={busy} placeholder="Пока без художественных названий" onChange={e => setNewName(e.target.value)} /></label>
          <label>Редкость коллекции<select value={newRarity} disabled={busy} onChange={e => setNewRarity(e.target.value as typeof newRarity)}>
            <option value="common">Обычный</option><option value="rare">Редкий</option><option value="legendary">Легендарный</option>
          </select></label>
          <button type="button" disabled={!newName.trim() || busy} onClick={() => void create()}>Создать черновик</button>
          <small>Черновик создаётся без сезона; выдача и публикация недоступны.</small>
        </section>}
        {active && <section className="cosmetic-set-studio-editor" aria-label="Состав выбранного сета">
          <div className="cosmetic-set-studio-preview">
            {portraitUrl ? <RolePortrait baseUrl={portraitUrl} background="autumn" layers={chosenLayers} /> :
              <div className="cosmetic-set-studio-no-base">Для общей примерки нужно подготовить портрет. Предметы доступны по отдельности ниже.</div>}
            <strong>{active.name}</strong>
            <small>{rarityLabels[active.rarity] || active.rarity} · {selected.length} отдельных вещей</small>
            {chosenLayers.some(l => eligible.find(item => item.id === l.itemId)?.draft) && <small className="cosmetic-set-studio-draft-label">В композиции есть неутверждённые эскизы</small>}
          </div>
          <div className="cosmetic-set-studio-slots">
            {PORTRAIT_EQUIPMENT_SLOTS.filter(slot => eligible.some(item => item.slot === slot) || selection[slot]).map(slot => {
              const options = eligible.filter(item => item.slot === slot);
              return <fieldset key={slot} disabled={busy || active.published}>
                <legend>{PORTRAIT_SLOT_LABELS[slot]}</legend>
                <div className="cosmetic-set-studio-items">
                  <button type="button" aria-pressed={!selection[slot]} onClick={() => updateSlot(slot, null)}>Без вещи</button>
                  {options.map(item => <button type="button" key={item.id} aria-pressed={selection[slot] === item.id} title={item.name}
                    onClick={() => updateSlot(slot, item.id)}>
                    <img src={item.url} alt="" loading="lazy" />
                    <strong>{item.name}</strong><small>{rarityLabels[item.rarity] || item.rarity}</small>
                    {item.draft && <small>Эскиз</small>}
                  </button>)}
                </div>
              </fieldset>;
            })}
            {!eligible.length && <p className="cosmetic-set-studio-muted">В каталоге пока нет черновых предметов для этих слотов. Ничего не добавлено автоматически.</p>}
          </div>
          <div className="cosmetic-set-studio-actions">
            <button type="button" disabled={!changed || busy || active.published} onClick={() => void persist()}>
              {busy ? 'Сохраняем…' : 'Сохранить состав черновика'}
            </button>
            <button type="button" disabled={!changed || busy} onClick={() => setSelection(fromSet(active))}>Отменить изменения</button>
            {active.published && <small>Опубликованные определения нельзя изменять через мастерскую.</small>}
          </div>
        </section>}
        {notice && <p role="status">{notice}</p>}
        <button type="button" className="cosmetic-set-studio-refresh" onClick={() => setReload(n => n + 1)} disabled={busy}>Обновить список</button>
      </>}
    </div>}
  </details>;
}
