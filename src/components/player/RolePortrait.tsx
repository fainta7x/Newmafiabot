import type { ReactNode } from 'react';
import { PORTRAIT_BASE_ORDER, PORTRAIT_SLOT_LABELS, PORTRAIT_SLOT_ORDER, type PortraitLayer } from '../../lib/roleLooks.ts';
import './roleLooks.css';

/** Identical ordering for the in-profile editor, lab and spectator graphics. */
export default function RolePortrait({ baseUrl, bodyBaseUrl, background, hatUrl, jacketUrl, layers, fallback, showGuides=false }: {
  baseUrl?: string | null; bodyBaseUrl?: string | null; background: string; hatUrl?: string | null; jacketUrl?: string | null;
  layers?: PortraitLayer[]; fallback?: ReactNode; showGuides?: boolean;
}) {
  const equipped: PortraitLayer[] = layers ?? [
    ...(jacketUrl ? [{ slot: 'portrait_jacket' as const, itemId: 'legacy-jacket', url: jacketUrl }] : []),
    ...(hatUrl ? [{ slot: 'portrait_hat' as const, itemId: 'legacy-hat', url: hatUrl }] : []),
  ];
  const sorted = [...equipped].sort((a, b) => PORTRAIT_SLOT_ORDER[a.slot] - PORTRAIT_SLOT_ORDER[b.slot]);
  const layerImage = (item: PortraitLayer) => <img
    key={item.slot} className={`role-portrait-layer role-portrait-${item.slot}`}
    src={item.url} alt={item.slot === 'portrait_jacket' ? 'Пиджак' : PORTRAIT_SLOT_LABELS[item.slot]}
    style={{ zIndex: PORTRAIT_SLOT_ORDER[item.slot] + 1 }}
  />;
  return <span className={`role-portrait role-portrait-${background}`}>
    {baseUrl ? <>
      {/* An immutable baseline is not a removable owned wardrobe item. */}
      {bodyBaseUrl && <img className="role-portrait-body-base" src={bodyBaseUrl} alt="" aria-hidden="true" />}
      {sorted.filter(l => PORTRAIT_SLOT_ORDER[l.slot] < PORTRAIT_BASE_ORDER).map(layerImage)}
      <img className="role-portrait-base" style={{zIndex: PORTRAIT_BASE_ORDER + 1}} src={baseUrl} alt="Портрет игрока" />
      {sorted.filter(l => PORTRAIT_SLOT_ORDER[l.slot] > PORTRAIT_BASE_ORDER).map(layerImage)}
      {showGuides&&<span className="role-portrait-guides" aria-hidden="true"><span className="role-guide-hat"/><span className="role-guide-chin"/><span className="role-guide-shoulders"/><span className="role-guide-center"/></span>}
    </> : fallback}
  </span>;
}
