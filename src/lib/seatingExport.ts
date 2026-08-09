import { Tournament } from './api.ts';
import {
  NOIR_EXPORT_COLORS,
  NOIR_EXPORT_FONT_FAMILY,
  NOIR_EXPORT_LAYOUT,
  renderNoirExportBackground,
  renderNoirExportBrandHeader,
  renderNoirExportFooter,
} from './exportNoirTheme.ts';

export interface SeatingMatrixRow {
  participantId: string;
  displayName: string;
  gameSeats: (number | null)[];
}

export interface SeatingMatrixResult {
  valid: boolean;
  rows: SeatingMatrixRow[];
  error?: string;
}

export function buildSeatingMatrix(tournament: Tournament): SeatingMatrixResult {
  if (!tournament.participants || tournament.participants.length !== 10) {
    return {
      valid: false,
      rows: [],
      error: `В турнире должно быть ровно 10 участников (найдено: ${tournament.participants?.length || 0})`,
    };
  }

  if (!tournament.games || tournament.games.length !== 10) {
    return {
      valid: false,
      rows: [],
      error: `В турнире должно быть ровно 10 игр (найдено: ${tournament.games?.length || 0})`,
    };
  }

  const sortedGames = [...tournament.games].sort((a, b) => a.game_number - b.game_number);
  const gameNumbers = sortedGames.map((g) => g.game_number);
  for (let i = 1; i <= 10; i++) {
    if (!gameNumbers.includes(i)) {
      return { valid: false, rows: [], error: `В турнире отсутствует Игра №${i}` };
    }
  }

  const sortedParticipants = [...tournament.participants].sort(
    (a, b) => a.participant_number - b.participant_number,
  );
  const rows: SeatingMatrixRow[] = [];

  for (const participant of sortedParticipants) {
    const gameSeats: (number | null)[] = [];
    for (let gameIndex = 0; gameIndex < 10; gameIndex += 1) {
      const game = sortedGames[gameIndex];
      if (!game?.seats?.length) {
        return { valid: false, rows: [], error: `В Игре №${gameIndex + 1} отсутствует рассадка` };
      }
      const seat = game.seats.find((item) => item.participant_id === participant.id);
      if (!seat || typeof seat.seat_number !== 'number') {
        return {
          valid: false,
          rows: [],
          error: `Для игрока "${participant.display_name}" не найдено место в Игре №${gameIndex + 1}`,
        };
      }
      gameSeats.push(seat.seat_number);
    }
    rows.push({ participantId: participant.id, displayName: participant.display_name, gameSeats });
  }

  return { valid: true, rows };
}

export function getSafeFilename(title: string): string {
  const safeTitle = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'tournament';
  return `rassadka_${safeTitle}.png`;
}

const escapeXml = (unsafe: string): string => unsafe
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const wrapText = (value: string, maxChars: number, maxLines = 2): string[] => {
  const words = String(value || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!words.length) return ['—'];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.join(' ').length < String(value).trim().length && lines.length) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }
  return lines.slice(0, maxLines);
};

const svgTextLines = (lines: string[], x: number, y: number, lineHeight: number, attrs: string): string =>
  `<text x="${x}" y="${y}" ${attrs}>${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`;

export function generateSeatingSvg(tournament: Tournament, matrixRows: SeatingMatrixRow[]): string {
  const width = NOIR_EXPORT_LAYOUT.width;
  const height = 1350;
  const margin = NOIR_EXPORT_LAYOUT.margin;
  const font = NOIR_EXPORT_FONT_FAMILY;
  const titleLines = wrapText(tournament.title, 31, 2);
  const titleExtra = Math.max(0, titleLines.length - 1) * 48;
  const headerHeight = 248 + titleExtra;
  const tableTop = headerHeight + 24;
  const nameColumnWidth = 286;
  const gameColumnWidth = (width - margin * 2 - nameColumnWidth) / 10;
  const tableWidth = width - margin * 2;
  const tableHeaderHeight = 66;
  const rowHeight = 86;

  const date = tournament.date ? new Date(tournament.date) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const meta = [
    '10 игроков × 10 игр',
    dateLabel,
    tournament.venue || null,
    tournament.stage || null,
  ].filter((item): item is string => Boolean(item)).join('   ·   ');

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${renderNoirExportBackground(width, height)}
    ${renderNoirExportBrandHeader('РАССАДКА ИГРОКОВ')}
    ${svgTextLines(titleLines, margin, 164, 48, `font-family="${font}" font-size="46" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-0.8"`)}
    <text x="${margin}" y="${222 + titleExtra}" font-family="${font}" font-size="20" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(meta)}</text>
    <text x="${width - margin}" y="${tableTop - 22}" text-anchor="end" font-family="${font}" font-size="15" font-weight="700" fill="${NOIR_EXPORT_COLORS.subduedText}">В ячейке — место игрока за столом</text>
    <line x1="${margin}" y1="${tableTop - 8}" x2="${width - margin}" y2="${tableTop - 8}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1"/>
    <rect x="${margin}" y="${tableTop}" width="${tableWidth}" height="${tableHeaderHeight}" fill="${NOIR_EXPORT_COLORS.surface}" opacity="0.72"/>
    <text x="${margin + 18}" y="${tableTop + 42}" font-family="${font}" font-size="18" font-weight="850" fill="${NOIR_EXPORT_COLORS.mutedText}" letter-spacing="1.2">ИГРОК</text>
    <text x="${margin + nameColumnWidth - 18}" y="${tableTop + 42}" text-anchor="end" font-family="${font}" font-size="15" font-weight="750" fill="${NOIR_EXPORT_COLORS.subduedText}">ИГРА</text>`;

  for (let game = 1; game <= 10; game += 1) {
    const cx = margin + nameColumnWidth + (game - 0.5) * gameColumnWidth;
    svg += `<text x="${cx}" y="${tableTop + 43}" text-anchor="middle" font-family="${font}" font-size="22" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" font-variant-numeric="tabular-nums">${game}</text>`;
  }

  const gridBottom = tableTop + tableHeaderHeight + matrixRows.length * rowHeight;
  for (let column = 0; column <= 10; column += 1) {
    const x = margin + nameColumnWidth + column * gameColumnWidth;
    svg += `<line x1="${x}" y1="${tableTop}" x2="${x}" y2="${gridBottom}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1" opacity="0.72"/>`;
  }

  matrixRows.forEach((row, index) => {
    const y = tableTop + tableHeaderHeight + index * rowHeight;
    if (index % 2 === 0) {
      svg += `<rect x="${margin}" y="${y}" width="${tableWidth}" height="${rowHeight}" fill="${NOIR_EXPORT_COLORS.surfaceSoft}" opacity="0.32"/>`;
    }
    svg += `<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1" opacity="0.76"/>`;
    const nameLines = wrapText(row.displayName, 18, 2);
    svg += `<text x="${margin + 18}" y="${y + 34}" font-family="${font}" font-size="17" font-weight="900" fill="${NOIR_EXPORT_COLORS.wineSoft}" font-variant-numeric="tabular-nums">${String(index + 1).padStart(2, '0')}</text>`;
    svg += svgTextLines(nameLines, margin + 58, y + (nameLines.length > 1 ? 29 : 48), 25, `font-family="${font}" font-size="22" font-weight="850" fill="${NOIR_EXPORT_COLORS.warmText}"`);
    row.gameSeats.forEach((seat, gameIndex) => {
      const cx = margin + nameColumnWidth + (gameIndex + 0.5) * gameColumnWidth;
      svg += `<text x="${cx}" y="${y + 52}" text-anchor="middle" font-family="${font}" font-size="27" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" font-variant-numeric="tabular-nums">${seat ?? '—'}</text>`;
    });
  });

  svg += `<line x1="${margin}" y1="${gridBottom}" x2="${width - margin}" y2="${gridBottom}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1"/>
    ${renderNoirExportFooter(width, height, 'Рассадка игроков · 10 игр')}
  </svg>`;
  return svg;
}

export function renderSvgToPngDataUrl(svgString: string, width = 1080, height = 1350): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error('Canvas 2D context not available'));
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err || new Error('Failed to load SVG into image element'));
    };

    img.src = url;
  });
}
