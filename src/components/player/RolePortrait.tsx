import type { ReactNode } from 'react';
import { PORTRAIT_BASE_ORDER, PORTRAIT_SLOT_LABELS, PORTRAIT_SLOT_ORDER, type PortraitLayer } from '../../lib/roleLooks.ts';
import './roleLooks.css';
import MeshGarment from './MeshGarment.tsx';
import { createGarmentMesh, isMeshGarment, type PortraitFit } from '../../lib/portraitMesh.ts';

/** Identical ordering for the in-profile editor, lab and spectator graphics. */
export default function RolePortrait({ baseUrl, bodyBaseUrl, background, hatUrl, jacketUrl, layers, fallback, showGuides=false, fit, showMesh=false }: {
  baseUrl?: string | null; bodyBaseUrl?: string | null; background: string; hatUrl?: string | null; jacketUrl?: string | null;
  layers?: PortraitLayer[]; fallback?: ReactNode; showGuides?: boolean;
  fit?:PortraitFit; showMesh?:boolean;
}) {
  const equipped: PortraitLayer[] = layers ?? [
    ...(jacketUrl ? [{ slot: 'portrait_jacket' as const, itemId: 'legacy-jacket', url: jacketUrl }] : []),
    ...(hatUrl ? [{ slot: 'portrait_hat' as const, itemId: 'legacy-hat', url: hatUrl }] : []),
  ];
  const sorted = [...equipped].sort((a, b) => PORTRAIT_SLOT_ORDER[a.slot] - PORTRAIT_SLOT_ORDER[b.slot]);
  const layerImage = (item: PortraitLayer) => fit&&isMeshGarment(item.slot)?<MeshGarment key={item.slot}
    url={item.url} label={item.slot==='portrait_jacket'?'Пиджак':PORTRAIT_SLOT_LABELS[item.slot]}
    slot={item.slot} order={PORTRAIT_SLOT_ORDER[item.slot]+1} fit={fit.body} shirtUnderJacket={item.slot==='portrait_shirt'&&sorted.some(l=>l.slot==='portrait_jacket'&&l.shirtCoverage==='front-only')}/>:<img
    key={item.slot} className={`role-portrait-layer role-portrait-${item.slot}`}
    src={item.url} alt={item.slot === 'portrait_jacket' ? 'Пиджак' : PORTRAIT_SLOT_LABELS[item.slot]}
    style={{ zIndex: PORTRAIT_SLOT_ORDER[item.slot] + 1, ...(fit&&item.slot==='portrait_hat'?{transform:`scaleX(${fit.hatScale})`,transformOrigin:'50% 20%'}:{}) }}
  />;
  return <span className={`role-portrait role-portrait-${background}`}>
    {baseUrl ? <>
      {/* An immutable baseline is not a removable owned wardrobe item. */}
      {bodyBaseUrl && <img className="role-portrait-body-base" src={bodyBaseUrl} alt="" aria-hidden="true" />}
      {sorted.filter(l => PORTRAIT_SLOT_ORDER[l.slot] < PORTRAIT_BASE_ORDER).map(layerImage)}
      <img className="role-portrait-base" style={{zIndex: PORTRAIT_BASE_ORDER + 1}} src={baseUrl} alt="Портрет игрока" />
      {sorted.filter(l => PORTRAIT_SLOT_ORDER[l.slot] > PORTRAIT_BASE_ORDER).map(layerImage)}
      {showGuides&&<span className="role-portrait-guides" aria-hidden="true"><span className="role-guide-hat"/><span className="role-guide-chin"/><span className="role-guide-shoulders"/><span className="role-guide-center"/></span>}
      {showMesh&&fit&&<svg className="role-portrait-mesh" viewBox="0 0 512 640" aria-label="Сетка посадки одежды" role="img">
        {createGarmentMesh(fit.body).map((t,i)=><path key={i} d={`M${t.target[0].x},${t.target[0].y} L${t.target[1].x},${t.target[1].y} L${t.target[2].x},${t.target[2].y} Z`}/>)}
      </svg>}
    </> : fallback}
  </span>;
}
