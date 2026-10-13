import type { ReactNode } from 'react';
import './roleLooks.css';

/** All prepared art shares one canvas; the immutable face is never recoloured or replaced by wardrobe controls. */
export default function RolePortrait({ baseUrl, background, hatUrl, jacketUrl, fallback }: { baseUrl?: string | null; background: string; hatUrl?: string | null; jacketUrl?: string | null; fallback?: ReactNode }) {
  return <span className={`role-portrait role-portrait-${background}`}>
    {baseUrl ? <>
      <img className="role-portrait-base" src={baseUrl} alt="Портрет игрока" />
      {jacketUrl && <img className="role-portrait-layer" src={jacketUrl} alt="Пиджак" />}
      {hatUrl && <img className="role-portrait-layer" src={hatUrl} alt="Головной убор" />}
    </> : fallback}
  </span>;
}
