import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import RevealPanel from '../src/components/LiveGameEngine/RevealPanel.tsx';
import { createEmptyActivePlayer } from '../src/components/LiveGameEngine/engineStateModel.ts';
import { addReveal, removeAnnouncedCheck, removeReveal, setAnnouncedCheck, type LiveReveal } from '../src/lib/liveReveals.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const names = ['Богданчик', 'Алоэ', 'Дина', 'Знак с очень длинным ником', 'Дон Эль', 'Тень', 'Маша', 'Игорь', 'Вера', 'Чагин'];
const players = names.map((nickname, index) => ({ ...createEmptyActivePlayer(index + 1), nickname, role: index === 4 ? ('Дон' as const) : ('Мирный' as const), alive: index !== 5 }));

function Harness() {
  const [reveals, setReveals] = useState<LiveReveal[]>([{ seat: 5, checks: [{ target: 8, color: 'red' }, { target: 2, color: 'black' }] }]);
  return (
    <RevealPanel
      players={players}
      reveals={reveals}
      rolesVisible
      onAddReveal={(seat) => setReveals((value) => addReveal(value, seat))}
      onRemoveReveal={(seat) => setReveals((value) => removeReveal(value, seat))}
      onSetCheck={(seat, target, color) => setReveals((value) => setAnnouncedCheck(value, seat, target, color))}
      onRemoveCheck={(seat, target) => setReveals((value) => removeAnnouncedCheck(value, seat, target))}
      onClose={() => undefined}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
