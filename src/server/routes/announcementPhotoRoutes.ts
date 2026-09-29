import { Router } from 'express';
import { getPlayerSessionId, requireOrganizerAuth } from '../auth.ts';
import {
  addAnnouncementPhoto,
  announcementPhotoPath,
  deleteAnnouncementPhoto,
  listAnnouncementPhotos,
  setAnnouncementPhotoAudience,
} from '../services/announcementPhotoService.ts';

/** CRM «Публикации клуба» → «Фото для анонсов»: the organizer uploads, labels and removes club photos. */
const router = Router();
router.use(requireOrganizerAuth);

const fail = (res: any, error: any, fallback: string) =>
  res.status(Number(error?.statusCode) || 500).json({ error: error?.message || fallback });

router.get('/', async (req, res) => {
  try {
    const photos = await listAnnouncementPhotos(req.db);
    res.json({ photos: photos.map((photo) => ({ ...photo, url: announcementPhotoPath(photo.id) })) });
  } catch (error) {
    fail(res, error, 'Не удалось загрузить фото');
  }
});

router.post('/', async (req, res) => {
  try {
    const photo = await addAnnouncementPhoto(req.db, {
      base64: req.body?.data,
      audience: req.body?.audience,
      createdBy: getPlayerSessionId(req) || null,
    });
    res.status(201).json({ photo: { ...photo, url: announcementPhotoPath(photo.id) } });
  } catch (error) {
    fail(res, error, 'Не удалось сохранить фото');
  }
});

router.patch('/:id', async (req, res) => {
  try {
    await setAnnouncementPhotoAudience(req.db, String(req.params.id), req.body?.audience);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, 'Не удалось изменить фото');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteAnnouncementPhoto(req.db, String(req.params.id));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, 'Не удалось удалить фото');
  }
});

export default router;
