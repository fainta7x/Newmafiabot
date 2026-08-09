import React from 'react';
import { PlayerDossierModal as PlayerDossierModalBase } from './PlayerDossierModalBase.tsx';

export type PlayerDossierModalProps = React.ComponentProps<typeof PlayerDossierModalBase>;

export const PlayerDossierModal: React.FC<PlayerDossierModalProps> = (props) => (
  <PlayerDossierModalBase
    {...props}
    onUpdateTokens={() => {
      window.alert('Прямая правка жетонов отключена. Используйте блок «Жетоны клуба» в актуальном Noir-профиле игрока — там изменение фиксируется в журнале и требует причину.');
    }}
  />
);

export default PlayerDossierModal;
