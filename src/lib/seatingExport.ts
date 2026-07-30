import { Tournament } from './api.ts';

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
      return {
        valid: false,
        rows: [],
        error: `В турнире отсутствует Игра №${i}`,
      };
    }
  }

  const sortedParticipants = [...tournament.participants].sort(
    (a, b) => a.participant_number - b.participant_number
  );

  const rows: SeatingMatrixRow[] = [];

  for (const p of sortedParticipants) {
    const gameSeats: (number | null)[] = [];

    for (let gIdx = 0; gIdx < 10; gIdx++) {
      const game = sortedGames[gIdx];
      if (!game || !game.seats || game.seats.length === 0) {
        return {
          valid: false,
          rows: [],
          error: `В Игре №${gIdx + 1} отсутствует рассадка`,
        };
      }

      const seatObj = game.seats.find((s) => s.participant_id === p.id);
      if (!seatObj || typeof seatObj.seat_number !== 'number') {
        return {
          valid: false,
          rows: [],
          error: `Для игрока "${p.display_name}" не найдено место в Игре №${gIdx + 1}`,
        };
      }

      gameSeats.push(seatObj.seat_number);
    }

    rows.push({
      participantId: p.id,
      displayName: p.display_name,
      gameSeats,
    });
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

export function generateSeatingSvg(tournament: Tournament, matrixRows: SeatingMatrixRow[]): string {
  const width = 1080;
  const height = 1600;

  const dateStr = tournament.date
    ? new Date(tournament.date).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const venueStr = tournament.venue || 'Главный зал';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  <rect x="0" y="0" width="${width}" height="16" fill="url(#accentGrad)"/>

  <text x="50" y="85" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="42" font-weight="900" fill="#F8FAFC">
    ${escapeXml(tournament.title)}
  </text>

  <text x="50" y="132" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#94A3B8">
    ${escapeXml(dateStr)}${venueStr ? ` • ${escapeXml(venueStr)}` : ''}${tournament.stage ? ` • ${escapeXml(tournament.stage)}` : ''}
  </text>

  <rect x="50" y="160" width="370" height="42" rx="12" fill="rgba(37, 99, 235, 0.18)" stroke="rgba(59, 130, 246, 0.5)" stroke-width="2"/>
  <text x="70" y="187" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="700" fill="#60A5FA">
    Цифра — номер места игрока
  </text>
  `;

  const startX = 40;
  const startY = 240;
  const tableWidth = 1000;
  const colNameWidth = 270;
  const colGameWidth = 73;
  const headerHeight = 75;
  const rowHeight = 118;

  svg += `<rect x="${startX}" y="${startY}" width="${tableWidth}" height="${headerHeight}" rx="16" fill="#1E293B" stroke="#334155" stroke-width="2"/>`;
  svg += `<text x="${startX + 24}" y="${startY + 46}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="800" fill="#94A3B8">Игрок</text>`;

  for (let g = 1; g <= 10; g++) {
    const cx = startX + colNameWidth + (g - 1) * colGameWidth + colGameWidth / 2;
    svg += `<text x="${cx}" y="${startY + 46}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="900" fill="#60A5FA">И${g}</text>`;
  }

  for (let rIdx = 0; rIdx < matrixRows.length; rIdx++) {
    const row = matrixRows[rIdx];
    const ry = startY + headerHeight + 14 + rIdx * rowHeight;
    const isEven = rIdx % 2 === 0;

    const rowBg = isEven ? '#1E293B' : '#0F172A';
    svg += `<rect x="${startX}" y="${ry}" width="${tableWidth}" height="${rowHeight - 10}" rx="16" fill="${rowBg}" stroke="#334155" stroke-width="1.5"/>`;

    svg += `<rect x="${startX + 6}" y="${ry + 6}" width="${colNameWidth - 12}" height="${rowHeight - 22}" rx="12" fill="rgba(30, 41, 59, 0.85)" stroke="rgba(51, 65, 85, 0.5)" stroke-width="1"/>`;

    const circleCy = ry + (rowHeight - 10) / 2;
    svg += `<circle cx="${startX + 28}" cy="${circleCy}" r="15" fill="#2563EB"/>`;
    svg += `<text x="${startX + 28}" y="${circleCy + 6}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="#FFFFFF">${rIdx + 1}</text>`;

    const safeName = escapeXml(truncateText(row.displayName, 15));
    svg += `<text x="${startX + 54}" y="${circleCy + 7}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="23" font-weight="800" fill="#F8FAFC">${safeName}</text>`;

    for (let g = 0; g < 10; g++) {
      const seatNum = row.gameSeats[g];
      const cx = startX + colNameWidth + g * colGameWidth + colGameWidth / 2;
      const cy = circleCy;

      svg += `<rect x="${cx - 24}" y="${cy - 24}" width="48" height="48" rx="14" fill="#0F172A" stroke="#475569" stroke-width="2"/>`;
      svg += `<text x="${cx}" y="${cy + 9}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="900" fill="#F1F5F9">${seatNum ?? '-'}</text>`;
    }
  }

  svg += `<text x="${width / 2}" y="${height - 30}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#64748B">
    NewMafia CRM • Рассадка игроков (10 игр × 10 участников)
  </text>`;

  svg += `</svg>`;
  return svg;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(text: string, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

export function renderSvgToPngDataUrl(svgString: string, width = 1080, height = 1600): Promise<string> {
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
