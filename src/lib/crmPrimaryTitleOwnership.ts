const titleAliases = new Map<string, Set<string>>([
  ['Сегодня', new Set(['Сегодня'])],
  ['События', new Set(['События'])],
  ['Игроки', new Set(['Игроки'])],
  ['Ещё', new Set(['Ещё'])],
  ['Все задачи', new Set(['Все задачи', 'Задачи'])],
  ['Аналитика', new Set(['Аналитика'])],
]);

const normalize = (value: string | null | undefined) => String(value || '').replace(/\s+/g, ' ').trim();

const applyOwnership = () => {
  const shell = document.querySelector<HTMLElement>('.crm-premium');
  if (!shell) return;
  const primary = shell.querySelector<HTMLElement>('header.crm-premium-header h1');
  const primaryText = normalize(primary?.textContent);
  const aliases = titleAliases.get(primaryText);

  for (const node of shell.querySelectorAll<HTMLElement>('[data-crm-duplicate-primary-title="true"]')) {
    node.removeAttribute('data-crm-duplicate-primary-title');
    node.removeAttribute('aria-hidden');
  }
  if (!aliases) return;

  const content = shell.querySelector('main');
  if (!content) return;
  for (const heading of content.querySelectorAll<HTMLElement>('h1, h2')) {
    if (!aliases.has(normalize(heading.textContent))) continue;
    heading.dataset.crmDuplicatePrimaryTitle = 'true';
    heading.setAttribute('aria-hidden', 'true');
  }
};

let cleanup: (() => void) | null = null;

/**
 * CRM root owns the only visible primary page title. Child views may keep their
 * descriptive copy/actions without repeating the active root title. This small
 * DOM bridge also covers legacy child screens while they migrate independently.
 */
export const initializeCrmPrimaryTitleOwnership = () => {
  if (typeof document === 'undefined' || cleanup) return cleanup || (() => {});
  const observer = new MutationObserver(() => applyOwnership());
  const start = () => {
    applyOwnership();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });

  cleanup = () => {
    observer.disconnect();
    document.removeEventListener('DOMContentLoaded', start);
    cleanup = null;
  };
  return cleanup;
};
