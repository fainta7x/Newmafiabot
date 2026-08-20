import ReactDOM from 'react-dom/client';
import PlayerMoreHub from '../src/components/player/PlayerMoreHub.tsx';
import type { PlayerMeResponse } from '../src/types/player.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const data = {
  player: {
    id: 'p1',
    nickname: 'Чагин',
    elo: 1542,
    avatar_url: null,
  },
} as unknown as PlayerMeResponse;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <PlayerMoreHub
    data={data}
    canOpenAdmin
    onOpen={(destination) => {
      document.body.dataset.lastDestination = destination;
    }}
  />,
);
