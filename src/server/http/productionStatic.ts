import express from 'express';
import path from 'node:path';

/** Only content-addressed Vite assets are immutable; entry documents must revalidate. */
export function productionStatic(distPath: string) {
  const assetsPath = path.join(path.resolve(distPath), 'assets');
  return express.static(distPath, {
    setHeaders(res, filePath) {
      if (path.dirname(filePath) === assetsPath && /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(path.basename(filePath))) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
}
