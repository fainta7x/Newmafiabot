import { editVkWallPost, vkPublisherApi } from './vkPublishingService.ts';

/**
 * Edit a VK destination using the same publisher credentials that are used to
 * create wall posts. Community tokens can be valid publishers, so capability
 * is determined by the real wall.edit response instead of a user-token gate.
 */
export async function editVkWallPostWithPublisher(input: {
  groupId: string;
  postId: number;
  message: string;
  attachments?: string[];
}): Promise<void> {
  const groupId = String(input.groupId || '').trim();
  if (groupId.startsWith('-')) {
    await editVkWallPost(input);
    return;
  }

  const numericGroupId = Math.abs(Number(groupId));
  if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) {
    throw new Error('Некорректный VK community ID');
  }

  await vkPublisherApi<number>('wall.edit', {
    owner_id: -numericGroupId,
    post_id: input.postId,
    message: input.message,
    attachments: input.attachments?.filter(Boolean).join(',') || undefined,
  });
}
