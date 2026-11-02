import { createContext } from 'react';

/** Whether the numbers voting window opens by itself when a vote count starts (false in the judge training: its input gate would not let it be folded). */
export const NumbersAutoOpenContext = createContext<boolean>(true);
