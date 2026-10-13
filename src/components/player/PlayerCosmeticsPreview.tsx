import { useState } from 'react';
import { COSMETIC_ASSETS } from '../../lib/cosmeticAssets.ts';
import './fieryAutumn.css';

type Surface = 'profile' | 'poker' | 'broadcast';
const surfaces: Array<[Surface, string]> = [['profile', 'Профиль'], ['poker', 'Покер'], ['broadcast', 'Эфир']];
const title: Record<Surface, string> = { profile: 'Багряный венец', poker: 'Тлеющая роща', broadcast: 'Янтарная кромка' };
const asset = { profile: COSMETIC_ASSETS['fiery-autumn-frame-v1'], poker: COSMETIC_ASSETS['fiery-autumn-table-v1'], broadcast: COSMETIC_ASSETS['fiery-autumn-broadcast-v1'] };

/** Local-only art preview, never an inventory grant, paid unlock or equipped state. */
export default function PlayerCosmeticsPreview({ nickname = 'Игрок', initialOpen = false }: { nickname?: string; initialOpen?: boolean }) {
  const [surface, setSurface] = useState<Surface>('profile');
  const initial = nickname.trim().slice(0, 1).toLocaleUpperCase('ru') || 'И';
  return <details open={initialOpen} className="autumn-collection" data-testid="autumn-cosmetics-preview">
    <summary className="autumn-summary"><span><strong>Оформление</strong><span>Огненная осень · эскизы коллекции</span></span><span aria-hidden="true">⌄</span></summary>
    <div className="autumn-body">
      <div className="autumn-heading"><p>СЕЗОННАЯ КОЛЛЕКЦИЯ</p><h2>Огненная осень</h2><span>Медь, багряные листья и последний свет уходящего солнца.</span></div>
      <div className="autumn-switch" role="group" aria-label="Где посмотреть оформление">{surfaces.map(([key, label]) => <button type="button" key={key} aria-pressed={surface === key} onClick={() => setSurface(key)}>{label}</button>)}</div>
      <div className={`autumn-scene autumn-scene-${surface}`} data-testid={`autumn-scene-${surface}`}>
        {surface === 'profile' && <div className="autumn-profile"><div className="autumn-avatar"><div aria-hidden="true">{initial}</div><img src={asset.profile.url} alt="Медная рамка с багряными листьями" /></div><p className="autumn-name">{nickname}</p><span className="autumn-small">2LA Noire</span></div>}
        {surface === 'poker' && <div className="autumn-table"><img src={asset.poker.url} alt="Тёмное сукно с медным кантом и осенними листьями" /><div className="autumn-poker-layout" aria-hidden="true"><span className="autumn-poker-label">2LA NOIRE</span><div className="autumn-cards"><i>♠</i><i>♥</i><i>♣</i></div><span className="autumn-poker-pot">ПОКЕРНЫЙ СТОЛ</span></div></div>}
        {surface === 'broadcast' && <div className="autumn-broadcast"><span className="autumn-live">ПРЕДПРОСМОТР ЭФИРА</span><div className="autumn-nameplate"><img src={asset.broadcast.url} alt="Янтарная подложка карточки трансляции" /><div><span className="autumn-broadcast-avatar" aria-hidden="true">{initial}</span><p><small>2LA NOIRE</small><strong>{nickname}</strong></p></div></div></div>}
        <span className="autumn-ember autumn-ember-one" aria-hidden="true"/><span className="autumn-ember autumn-ember-two" aria-hidden="true"/>
      </div>
      <div className="autumn-caption"><strong>{title[surface]}</strong><span>{surface === 'profile' ? 'Рамка профиля' : surface === 'poker' ? 'Оформление покерного стола' : 'Акцент карточки игрока в эфире'}</span></div>
      <p className="autumn-preview-note">Предпросмотр будущей коллекции. Предметы ещё не выпущены; выбор здесь не меняет ваше оформление.</p>
    </div>
  </details>;
}
