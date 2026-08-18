import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Live Game overlay boundary', () => {
  it('keeps overlay markup outside the main LiveGameEngine shell', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    const overlays = read('src/components/LiveGameEngine/LiveGameOverlays.tsx');

    expect(engine).toContain('from "./LiveGameEngine/LiveGameOverlays.js"');
    expect(engine).toContain('<DisciplineConfirmationOverlay');
    expect(engine).toContain('<PlayerActionOverlay');
    expect(engine).toContain('<BestMoveProtocolOverlay');
    expect(engine).toContain('<LiveGameToast');
    expect(engine).toContain('<RestorableSessionBanner');

    expect(engine).not.toContain('Требуется подтверждение');
    expect(engine).not.toContain('Первое нажатие ничего не меняет');
    expect(engine).not.toContain('Протокол ЛХ</h2>');
    expect(engine).not.toContain('Найдена незавершённая игра');

    expect(overlays).toContain('Требуется подтверждение');
    expect(overlays).toContain('Протокол ЛХ');
    expect(overlays).toContain('Найдена незавершённая игра');
  });
});
