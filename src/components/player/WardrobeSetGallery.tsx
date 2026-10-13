import { PORTRAIT_SLOT_LABELS, roleEquippedItems, type EquippedItems, type LookLayer, type RoleLook, type WardrobeSet } from '../../lib/roleLooks.ts';
import './wardrobeSetGallery.css';

const rarityLabels: Record<string, string> = {
  common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий',
  epic: 'Эпический', legendary: 'Легендарный', mythic: 'Мифический',
};

/** A set's itemIds never bypass inventory checks or the approved asset allowlist. */
export function tryOnOwnedSet(look: RoleLook, set: WardrobeSet, ownedLayers: LookLayer[]): EquippedItems {
  const next = roleEquippedItems(look);
  for (const item of set.items) {
    if (!item.owned || !ownedLayers.some(owned => owned.itemId === item.itemId && owned.slot === item.slot)) continue;
    next[item.slot] = item.itemId;
  }
  return next;
}

export default function WardrobeSetGallery({
  sets, layers, look, disabled, onTrySet, onTryItem,
}: {
  sets: WardrobeSet[]; layers: LookLayer[]; look: RoleLook; disabled: boolean;
  onTrySet: (set: WardrobeSet) => void; onTryItem: (slot: LookLayer['slot'], itemId: string) => void;
}) {
  if (!sets.length) return null;
  const equipped = roleEquippedItems(look);
  return <section className="wardrobe-set-gallery" aria-label="Коллекции одежды">
    <h3>Коллекции одежды</h3>
    <p>Вещи из разных комплектов можно сочетать. Примерка меняет только черновик выбранной роли; для применения нажмите «Сохранить».</p>
    {sets.map(set => {
      const available = set.items.filter(item => item.owned && layers.some(layer => layer.itemId === item.itemId && layer.slot === item.slot));
      const equippedCount = set.items.filter(item => equipped[item.slot] === item.itemId).length;
      return <details key={set.id} className="wardrobe-set-card">
        <summary><span className="wardrobe-set-summary"><strong>{set.name}</strong><small>{rarityLabels[set.rarity] || set.rarity} · В инвентаре {available.length} из {set.items.length} · Надето {equippedCount}</small></span></summary>
        <div className="wardrobe-set-items">
          {set.items.map(item => {
            const canUse = item.owned && layers.some(l => l.itemId === item.itemId && l.slot === item.slot);
            return <div key={item.itemId} className="wardrobe-set-piece">
              <img src={item.url} alt="" loading="lazy" />
              <strong>{item.name}</strong>
              <span>{PORTRAIT_SLOT_LABELS[item.slot]} · {rarityLabels[item.rarity] || item.rarity}</span>
              <button type="button" aria-pressed={equipped[item.slot] === item.itemId}
                disabled={disabled || !canUse} onClick={() => onTryItem(item.slot, item.itemId)}>
                {!canUse ? 'Нет в инвентаре' : equipped[item.slot] === item.itemId ? 'Уже надето' : 'Примерить вещь'}
              </button>
            </div>;
          })}
        </div>
        <button className="wardrobe-set-all" type="button" disabled={disabled || available.length === 0}
          onClick={() => onTrySet(set)}>
          {available.length === set.items.length ? 'Примерить весь комплект' : `Примерить доступные: ${available.length} из ${set.items.length}`}
        </button>
      </details>;
    })}
  </section>;
}
