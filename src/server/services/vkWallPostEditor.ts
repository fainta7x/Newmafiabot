import { editVkWallPost } from './vkPublishingService.ts';

/**
 * Existing wall posts must be edited with the configured user token.
 * VK accepts a community token for wall.post but rejects wall.edit with API 27.
 * Channel destinations continue through editVkWallPost's messages.edit branch.
 */
export async function editVkWallPostWithPublisher(input: {
  groupId: string;
  postId: number;
  message: string;
  attachments?: string[];
}): Promise<void> {
  await editVkWallPost(input);
}
