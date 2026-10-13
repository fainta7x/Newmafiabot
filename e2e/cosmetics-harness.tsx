import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import PlayerRoleLooksEditor from '../src/components/player/PlayerRoleLooksEditor.tsx';
import PlayerCosmeticsPreview from '../src/components/player/PlayerCosmeticsPreview.tsx';

createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-4"><p className="mb-4 text-sm text-white/55">2LA Noire · Оформление профиля</p><PlayerCosmeticsPreview nickname="Chagin" initialOpen /><div className="mt-4"><PlayerRoleLooksEditor playerId="preview-player" nickname="Chagin" initialOpen /></div></main>);
