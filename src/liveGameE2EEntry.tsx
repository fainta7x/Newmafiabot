import React from 'react';
import { createRoot } from 'react-dom/client';
import LiveGameE2EHarness from './components/LiveGameEngine/LiveGameE2EHarness.js';
import './index.css';

const root = document.getElementById('live-game-e2e-root');
if (!root) throw new Error('Live Game E2E root not found');

createRoot(root).render(
  <React.StrictMode>
    <LiveGameE2EHarness />
  </React.StrictMode>,
);
