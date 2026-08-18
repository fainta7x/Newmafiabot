import { Router, type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

router.get('/player-avatar-data/:filename', (req: Request, res: Response) => {
  try {
    const filename = path.basename(String(req.params.filename));
    const avatarsDir =
      process.env.NODE_ENV === 'production'
        ? path.join(process.cwd(), 'dist', 'player-avatars')
        : path.join(process.cwd(), 'public', 'player-avatars');

    const filePath = path.join(avatarsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Avatar file not found' });
    }

    let fileBuffer = fs.readFileSync(filePath);

    // Auto-repair header/trailer if JPEG non-ASCII bytes were stored with UTF-8 replacement characters
    const ufffd4 = Buffer.from([0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd]);
    if (fileBuffer.subarray(0, 12).equals(ufffd4)) {
      const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      let body = fileBuffer.subarray(12);
      const ufffd2 = Buffer.from([0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd]);
      if (body.subarray(body.length - 6).equals(ufffd2)) {
        body = body.subarray(0, body.length - 6);
      }
      const tail = Buffer.from([0xff, 0xd9]);
      fileBuffer = Buffer.concat([head, body, tail]);
    }

    const base64 = fileBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    res.json({ dataUrl });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read avatar file', message: err.message });
  }
});

export default router;
