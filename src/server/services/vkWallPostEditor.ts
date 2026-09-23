import { callVkApi, editVkWallPost, getVkWallEditCredentials } from './vkPublishingService.ts';

const CREDENTIAL_LABELS = { user: 'API-токен организатора' } as const;

/**
 * Refresh an existing public wall post with the API-compatible organizer token.
 * VK rejects wall.edit for community keys (error 27), so without that token the
 * edit is reported as unavailable instead of being attempted.
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
    throw Object.assign(
      new Error('Пост VK не обновляется: VK разрешает редактировать стену только API-токеном администратора'),
      { code: 'vk_wall_edit_unavailable' },
    );
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

  throw Object.assign(
    new Error(`Пост VK не обновлён (${failures.join('; ')}).`),
    { code: 'vk_wall_edit_failed' },
  );
}
