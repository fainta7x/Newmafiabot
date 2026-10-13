import type { ReactNode } from 'react';
import './roleLooks.css';

/** All prepared art shares one canvas; the immutable face is never recoloured or replaced by wardrobe controls. */
export default function RolePortrait({ baseUrl, background, hatUrl, jacketUrl, fallback, showGuides=false }: { baseUrl?: string | null; background: string; hatUrl?: string | null; jacketUrl?: string | null; fallback?: ReactNode; showGuides?: boolean }) {
  return <span className={`role-portrait role-portrait-${background}`}>
    {baseUrl ? <>
      {jacketUrl && <img className="role-portrait-layer role-portrait-jacket" src={jacketUrl} alt="Пиджак" />}
      <img className="role-portrait-base" src={baseUrl} alt="Портрет игрока" />
      {hatUrl && <img className="role-portrait-layer role-portrait-hat" src={hatUrl} alt="Головной убор" />}
      {showGuides&&<span className="role-portrait-guides" aria-hidden="true"><span className="role-guide-hat"/><span className="role-guide-chin"/><span className="role-guide-shoulders"/><span className="role-guide-center"/></span>}
    </> : fallback}
  </span>;
}
