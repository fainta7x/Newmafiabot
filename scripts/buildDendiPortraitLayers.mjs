/**
 * Deterministic draft alpha layers derived from the EXISTING Dendi JPG, never from AI.
 * 512x640 geometry is authored for THIS portrait. Do not apply blindly to other players.
 * These outputs are preview/build assets, NOT a published player cosmetic.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'public/player-avatars/dendi.jpg');
const outputDir = path.resolve(process.argv[2] || path.join(root, 'temp/dendi-portrait-layers'));
const source = await readFile(sourcePath);
const src = `data:image/jpeg;base64,${source.toString('base64')}`;
const WIDTH = 512, HEIGHT = 640;
const FACE_CONTOUR = `M 177 62 L 169 65 L 157 83 L 141 97 L 138 120 L 143 137 L 143 144 L 138 165 L 131 186 L 109 226 L 105 237 L 106 243 L 103 247 L 104 269 L 114 290 L 111 293 L 112 302 L 110 311 L 104 321 L 81 345 L 75 358 L 74 373 L 78 375 L 96 369 L 132 371 L 139 369 L 150 363 L 159 354 L 164 344 L 173 338 L 177 328 L 179 329 L 179 333 L 191 343 L 188 367 L 191 370 L 221 379 L 228 374 L 251 390 L 262 386 L 267 389 L 290 374 L 303 374 L 304 364 L 312 356 L 314 358 L 314 364 L 319 365 L 320 388 L 324 391 L 326 400 L 334 414 L 334 421 L 345 436 L 369 459 L 378 471 L 380 477 L 421 477 L 433 456 L 436 446 L 438 416 L 434 397 L 417 369 L 422 364 L 429 364 L 430 366 L 435 366 L 451 373 L 451 359 L 442 339 L 419 310 L 413 292 L 408 286 L 415 264 L 415 244 L 408 222 L 388 186 L 389 182 L 383 164 L 383 159 L 387 155 L 383 142 L 384 114 L 382 108 L 375 97 L 362 84 L 350 66 L 328 45 L 324 45 L 305 36 L 298 36 L 297 41 L 285 41 L 277 46 L 269 39 L 261 36 L 234 36 L 213 43 L 193 56 L 188 52 Z`;
const OUTFIT_CONTOUR = `M -20 434 L 4 389 L 48 366 L 88 352 L 128 332 L 173 326 L 222 340 L 269 333 L 313 330 L 356 337 L 394 346 L 441 356 L 481 388 L 525 432 L 528 660 L -20 660 Z`;
const layerDefs = [
  { id: 'dendi-face-hair-base', shape: FACE_CONTOUR, crop: { x:660, y:105, w:790, h:745 }, destination: { x:2, y:0, w:507, h:478 } },
  { id: 'dendi-original-suit', shape: OUTFIT_CONTOUR, crop: { x:660, y:105, w:790, h:988 }, destination: { x:0, y:0, w:512, h:640 } },
];
await mkdir(outputDir, { recursive: true });
const outputs = [];
for (const layer of layerDefs) {
  const sx = layer.destination.w/layer.crop.w, sy=layer.destination.h/layer.crop.h;
  const x = layer.destination.x-layer.crop.x*sx, y=layer.destination.y-layer.crop.y*sy;
  // SVG rasterization uses the original JPG bytes. The clip is in 512x640
  // coordinates, so every output is a separate alpha-correct overlay.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs><clipPath id="cut"><path d="${layer.shape}"/></clipPath></defs>
    <image href="${src}" x="${x}" y="${y}" width="${2048*sx}" height="${1381*sy}" preserveAspectRatio="none" clip-path="url(#cut)"/>
    </svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
  await writeFile(path.join(outputDir, `${layer.id}.png`), png);
  outputs.push({ id: layer.id, file: `${layer.id}.png`, width: WIDTH, height: HEIGHT, bytes: png.length });
}
const manifest = {
  source: 'public/player-avatars/dendi.jpg',
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  layout: 'bust-512x640-v1', status: 'draft', noFaceRegeneration: true,
  notes: 'Original hair/face and original full suit; suit includes hands, shirt and bow tie. These cannot be independently swapped until manually separated and retouched.',
  order: ['dendi-original-suit', 'dendi-face-hair-base', 'portrait_hat'],
  outputs,
};
await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Dendi original-photo alpha layers: ${outputDir} (${outputs.map(x=>x.file).join(', ')})`);
