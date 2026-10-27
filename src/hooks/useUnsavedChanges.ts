import { useEffect, useRef } from 'react';
import { PAGE_LEAVE_EVENT } from '../lib/pageLeave.ts';

/** Protect explicit-save forms when leaving through the app or reloading the page. */
export function useUnsavedChanges(dirty: boolean, message: string) {
  const state = useRef({ dirty, message });
  state.current = { dirty, message };
  useEffect(() => {
    const source = `${window.location.pathname}${window.location.search}`;
    let approved = false;
    let reset: ReturnType<typeof setTimeout> | undefined;
    const leave = (event: Event) => {
      if (!state.current.dirty || approved || (event as CustomEvent<{ target?: string }>).detail?.target?.split('#')[0] === source) return;
      if (!window.confirm(state.current.message)) event.preventDefault();
      else {
        // Shell and router may both check the same synchronous transition.
        approved = true;
        reset = setTimeout(() => { approved = false; }, 0);
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (state.current.dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener(PAGE_LEAVE_EVENT, leave);
    window.addEventListener('beforeunload', unload);
    return () => {
      clearTimeout(reset);
      window.removeEventListener(PAGE_LEAVE_EVENT, leave);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);
}
