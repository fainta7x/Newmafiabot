export type DirectContact = { vk_url: string | null; telegram_url: string | null };

/**
 * «Написать лично»: the person allowed it in «Приглашения». VK cannot pre-fill a dialog, so the text is copied first
 * (the sender pastes it) and the dialog opens in the sender's own VK / Telegram.
 */
export async function openDirectContact(url: string, text: string): Promise<boolean> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch { /* the dialog still opens; the sender types the text */ }
  try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { window.location.assign(url); }
  return copied;
}
