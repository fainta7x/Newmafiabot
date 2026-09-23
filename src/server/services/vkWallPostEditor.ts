import { callVkApi, editVkWallPost, getVkWallEditCredentials } from './vkPublishingService.ts';

const CREDENTIAL_LABELS = { user: 'API-токен организатора', community: 'ключ сообщества' } as const;

/**
 * Refresh an existing public wall post. Every available credential is tried in
 * preference order (API-compatible organizer token, then community key) so one
 * rejected credential does not block the refresh; when all fail the error names
 * each credential's VK answer so the CRM shows the real cause.
 */
export async function editVkWallPostWithPublisher(input: {
  groupId: string;
  postId: number;
  message: string;
  attachments?: string[];
}): Promise<void> {
  if (String(input.groupId || '').trim().startsWith('-')) {
    await editVkWallPost(input);
    return;
  }

  const ownerId = -Math.abs(Number(input.groupId));
  if (!Number.isFinite(ownerId) || ownerId >= 0) {
    throw new Error('Некорректный VK community ID');
  }

  const credentials = getVkWallEditCredentials();
  if (!credentials.length) {
    throw Object.assign(new Error('Нет ключа VK для обновления поста'), { code: 'vk_wall_edit_token_missing' });
  }

  const failures: string[] = [];
  for (const credential of credentials) {
    try {
      await callVkApi<number>(credential.token, 'wall.edit', {
        owner_id: ownerId,
        post_id: input.postId,
        message: input.message,
        attachments: input.attachments?.filter(Boolean).join(',') || undefined,
      });
      return;
    } catch (error) {
      failures.push(`${CREDENTIAL_LABELS[credential.source]}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const hint = credentials.some((item) => item.source === 'user')
    ? ''
    : ' Для автообновления подключите «API VK» в CRM: VK не даёт ключу сообщества редактировать посты.';
  throw Object.assign(
    new Error(`Пост VK не обновлён (${failures.join('; ')}).${hint}`),
    { code: 'vk_wall_edit_failed' },
  );
}
