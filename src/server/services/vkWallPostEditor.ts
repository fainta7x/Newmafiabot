import { canEditVkWallPosts, editVkWallPost, vkPublisherApi } from './vkPublishingService.ts';

/**
 * Refresh an existing public wall post with the strongest available credential.
 * Prefer the organizer/user token when present because VK may reject community
 * keys for editing an already published wall post; keep the publisher-token
 * fallback for installations that only have the community key configured.
 */
export async function editVkWallPostWithPublisher(input: {
  groupId: string;
  postId: number;
  message: string;
  attachments?: string[];
}): Promise<void> {
  if (String(input.groupId || '').trim().startsWith('-') || canEditVkWallPosts()) {
    await editVkWallPost(input);
    return;
  }

  const ownerId = -Math.abs(Number(input.groupId));
  if (!Number.isFinite(ownerId) || ownerId >= 0) {
    throw new Error('Некорректный VK community ID');
  }

  await vkPublisherApi<number>('wall.edit', {
    owner_id: ownerId,
    post_id: input.postId,
    message: input.message,
    attachments: input.attachments?.filter(Boolean).join(',') || undefined,
  });
}
