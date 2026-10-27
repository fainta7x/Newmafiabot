export const PAGE_LEAVE_EVENT = '2la:before-page-leave';

export function confirmPageLeave(target?: string): boolean {
  return window.dispatchEvent(new CustomEvent(PAGE_LEAVE_EVENT, { cancelable: true, detail: { target } }));
}
