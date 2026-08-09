import { Tournament, TournamentStandingItem, PlayerResultData, TournamentGame } from './api';
import { NOIR_EXPORT_COLORS, NOIR_EXPORT_SCORE_COLORS } from './exportNoirTheme.ts';

export interface GamePlayerExportRow {
  participant_id?: string;
  seat_number: number;
  display_name: string;
  role: string | null;
  game_total: number;
  win_point: number;
  judge_bonus: number;
  protocol_bonus: number;
  best_move_points: number;
  game_penalty_points: number;
  disciplinary_penalty_points: number;
  ci_points: number;
  avatar_data_url?: string | null;
}

/**
 * Formats points into local Russian FSM style:
 * - Positive: +0,5
 * - Negative: −0,3 (Unicode minus \u2212)
 * - Zero: 0
 * - Decimal separator: comma (,)
 */
export function formatPoints(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) {
    return '0';
  }
  const rounded = Math.round(val * 1000) / 1000;
  if (rounded === 0) {
    return '0';
  }
  const formatted = rounded.toString().replace('.', ',');
  if (rounded > 0) {
    return '+' + formatted;
  } else {
    // Unicode minus symbol: \u2212
    return '\u2212' + formatted.substring(1);
  }
}

export function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getSafeFilenameForGame(title: string, gameNumber: number): string {
  const safeTitle = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'tournament';
  return `${safeTitle}-game-${gameNumber}-results.png`;
}

export function getSafeFilenameForStandings(title: string, gamesCount: number): string {
  const safeTitle = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'tournament';
  return `${safeTitle}-standings-after-${gamesCount}-games.png`;
}

export function buildGameExportRows(
  playerResults: PlayerResultData[],
  standings: TournamentStandingItem[],
  gameNumber: number,
  avatarDataByParticipant: Record<string, string> = {},
): GamePlayerExportRow[] {
  // We keep the player results in the order of their seats (1 to 10)
  const sortedResults = [...playerResults].sort((a, b) => a.seat_number - b.seat_number);

  return sortedResults.map((pr) => {
    // Find the participant's statistics in the standings
    const participantStanding = standings.find((s) => s.participant_id === pr.participant_id);
    const standingGame = participantStanding?.games?.find((g) => g.game_number === gameNumber);

    return {
      participant_id: pr.participant_id,
      seat_number: pr.seat_number,
      display_name: pr.display_name,
      role: pr.role,
      game_total: standingGame?.game_total ?? 0,
      win_point: standingGame?.win_point ?? 0,
      judge_bonus: standingGame?.judge_bonus ?? pr.judge_bonus ?? 0,
      protocol_bonus: standingGame?.protocol_bonus ?? pr.protocol_bonus ?? 0,
      best_move_points: standingGame?.best_move_points ?? 0,
      game_penalty_points: standingGame?.game_penalty_points ?? pr.penalty_points ?? 0,
      disciplinary_penalty_points: standingGame?.disciplinary_penalty_points ?? pr.disciplinary_penalty_points ?? 0,
      ci_points: standingGame?.ci_points ?? pr.ci_points ?? 0,
      avatar_data_url: avatarDataByParticipant[pr.participant_id] || null,
    };
  });
}

export function getSvgDimensions(svgString: string): { width: number; height: number } {
  const width = Number(/<svg[^>]*\bwidth=["']([0-9.]+)["']/.exec(svgString)?.[1] || 0);
  const height = Number(/<svg[^>]*\bheight=["']([0-9.]+)["']/.exec(svgString)?.[1] || 0);
  if (!(width > 0) || !(height > 0)) throw new Error('SVG не содержит корректные размеры');
  return { width: Math.round(width), height: Math.round(height) };
}

export function generateGameResultsSvg(
  tournament: Tournament,
  game: TournamentGame,
  exportRows: GamePlayerExportRow[]
): string {
  const width = 1080;
  const margin = 58;
  const scoreX = 260;
  const scoreMaxWidth = width - margin - scoreX - 120;
  const fontFamily = "Montserrat, Arial, sans-serif";

  type GameScorePart = { key: keyof typeof NOIR_EXPORT_SCORE_COLORS; label: string; value: number };
  const partsFor = (row: GamePlayerExportRow): GameScorePart[] => {
    const parts: GameScorePart[] = [];
    const add = (key: GameScorePart['key'], label: string, value: number) => {
      if (Math.abs(value) < 0.0001) return;
      parts.push({ key, label, value });
    };
    add('wins', 'За победу', row.win_point);
    add('judge', 'Баллы', row.judge_bonus);
    add('protocol', 'Доп. баллы', row.protocol_bonus);
    add('best_move', 'Лучший ход', row.best_move_points);
    add('ci', 'Компенсация первого убитого', row.ci_points);
    add('game_penalty', 'Штрафы в игре', -Math.abs(row.game_penalty_points));
    add('discipline', 'Дисциплинарный штраф', -Math.abs(row.disciplinary_penalty_points));
    return parts;
  };

  const estimate = (text: string, fontSize = 24) => text.length * fontSize * 0.56;
  const layoutParts = (parts: GameScorePart[]) => {
    const lines: Array<Array<{ part: GameScorePart; text: string; width: number }>> = [];
    let line: Array<{ part: GameScorePart; text: string; width: number }> = [];
    let used = 0;
    const gap = 26;
    for (const part of parts) {
      const text = `${part.label} ${formatPoints(part.value)}`;
      const tokenWidth = Math.min(scoreMaxWidth, estimate(text, 22));
      if (line.length && used + gap + tokenWidth > scoreMaxWidth) {
        lines.push(line);
        line = [];
        used = 0;
      }
      line.push({ part, text, width: tokenWidth });
      used += (line.length > 1 ? gap : 0) + tokenWidth;
    }
    if (line.length) lines.push(line);
    return lines;
  };

  const rows = exportRows.map((row) => {
    const parts = partsFor(row);
    const lines = layoutParts(parts);
    const height = Math.max(116, 88 + Math.max(1, lines.length) * 34);
    return { row, parts, lines, height };
  });
  const rowsHeight = rows.reduce((sum, item) => sum + item.height, 0);
  const headerHeight = 300;
  const footerHeight = 112;
  const height = headerHeight + rowsHeight + footerHeight;

  const winnerLabel = game.winner_team === 'black' ? 'ПОБЕДА ЧЁРНЫХ' : 'ПОБЕДА КРАСНЫХ';
  const winnerColor = game.winner_team === 'black' ? NOIR_EXPORT_COLORS.silver : NOIR_EXPORT_COLORS.wine;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="monogramGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#421828"/>
      <stop offset="100%" stop-color="#1C1117"/>
    </linearGradient>
    <filter id="monogramBlur"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="${NOIR_EXPORT_COLORS.background}"/>
  <rect x="0" y="0" width="8" height="${height}" fill="${NOIR_EXPORT_COLORS.wine}"/>
  <text x="${margin}" y="64" font-family="${fontFamily}" font-size="20" font-weight="800" fill="${NOIR_EXPORT_COLORS.wine}" letter-spacing="4">2LA NOIRE</text>
  <text x="${margin}" y="116" font-family="${fontFamily}" font-size="20" font-weight="700" fill="${NOIR_EXPORT_COLORS.mutedText}" letter-spacing="2">ОФИЦИАЛЬНЫЙ ПРОТОКОЛ ИГРЫ</text>
  <text x="${margin}" y="178" font-family="${fontFamily}" font-size="44" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}">ИГРА №${game.game_number}</text>
  <text x="${margin}" y="218" font-family="${fontFamily}" font-size="22" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(tournament.title)}</text>
  <text x="${width - margin}" y="170" text-anchor="end" font-family="${fontFamily}" font-size="24" font-weight="850" fill="${winnerColor}">${winnerLabel}</text>
  <text x="${width - margin}" y="210" text-anchor="end" font-family="${fontFamily}" font-size="18" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">Судья · ${escapeXml(game.judge_name || '—')}</text>
  <line x1="${margin}" y1="258" x2="${width - margin}" y2="258" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="2"/>
  `;

  let y = headerHeight;
  for (const item of rows) {
    const { row, lines } = item;
    const roleMap: Record<string, { label: string; color: string }> = {
      citizen: { label: 'МИРНЫЙ', color: NOIR_EXPORT_SCORE_COLORS.wins },
      sheriff: { label: 'ШЕРИФ', color: NOIR_EXPORT_COLORS.gold },
      mafia: { label: 'МАФИЯ', color: '#D8747D' },
      don: { label: 'ДОН', color: '#B693C9' },
    };
    const role = roleMap[String(row.role || '').toLowerCase()] || { label: 'БЕЗ РОЛИ', color: NOIR_EXPORT_COLORS.mutedText };
    svg += `<text x="${margin}" y="${y + 40}" font-family="${fontFamily}" font-size="18" font-weight="800" fill="${NOIR_EXPORT_COLORS.subduedText}">${String(row.seat_number).padStart(2, '0')}</text>`;
    svg += officialAvatarSvg(row.avatar_data_url, row.display_name, margin + 46, y + 18, 54, `game-avatar-${row.participant_id}`, NOIR_EXPORT_COLORS.divider, 1.5);
    svg += `<text x="${margin + 118}" y="${y + 37}" font-family="${fontFamily}" font-size="29" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}">${escapeXml(row.display_name)}</text>`;
    svg += `<text x="${margin + 118}" y="${y + 68}" font-family="${fontFamily}" font-size="16" font-weight="800" fill="${role.color}" letter-spacing="1.4">${role.label}</text>`;
    svg += `<text x="${width - margin}" y="${y + 43}" text-anchor="end" font-family="${fontFamily}" font-size="38" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" font-variant-numeric="tabular-nums">${formatPoints(row.game_total)}</text>`;
    svg += `<text x="${width - margin}" y="${y + 68}" text-anchor="end" font-family="${fontFamily}" font-size="13" font-weight="800" fill="${NOIR_EXPORT_COLORS.subduedText}" letter-spacing="1.5">ИТОГ ЗА ИГРУ</text>`;

    if (lines.length) {
      lines.forEach((line, lineIndex) => {
        let x = scoreX;
        line.forEach(({ part, text, width: tokenWidth }) => {
          svg += `<text x="${x}" y="${y + 98 + lineIndex * 34}" font-family="${fontFamily}" font-size="22" font-weight="700" fill="${NOIR_EXPORT_SCORE_COLORS[part.key]}">${escapeXml(text)}</text>`;
          x += tokenWidth + 26;
        });
      });
    }
    svg += `<line x1="${margin}" y1="${y + item.height - 2}" x2="${width - margin}" y2="${y + item.height - 2}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1.5"/>`;
    y += item.height;
  }

  svg += `<text x="${margin}" y="${height - 58}" font-family="${fontFamily}" font-size="16" font-weight="750" fill="${NOIR_EXPORT_COLORS.mutedText}">2LA NOIRE · ОФИЦИАЛЬНЫЙ СПОРТИВНЫЙ ПРОТОКОЛ</text>`;
  svg += `<text x="${width - margin}" y="${height - 58}" text-anchor="end" font-family="${fontFamily}" font-size="15" font-weight="650" fill="${NOIR_EXPORT_COLORS.subduedText}">10 мест · результат за одну игру</text>`;
  svg += `</svg>`;
  return svg;
}

export function generateStandingsSvg(
  tournament: Tournament,
  standings: TournamentStandingItem[],
  completedGamesCount: number,
  totalGamesCount: number
): string {
  const width = 1080;
  const height = 1600;

  const dateStr = new Date().toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

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

  <!-- Title & Header -->
  <text x="50" y="75" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="700" fill="#94A3B8">
    ${escapeXml(tournament.title)}
  </text>
  <text x="50" y="125" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="900" fill="#F8FAFC">
    Промежуточная турнирная таблица
  </text>

  <!-- Subtitle info -->
  <text x="50" y="180" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="#38BDF8">
    После ${completedGamesCount} из ${totalGamesCount} игр
  </text>
  <text x="1030" y="180" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#64748B" text-anchor="end">
    Сформировано: ${escapeXml(dateStr)}
  </text>
  `;

  // Standings Table
  const startX = 40;
  const startY = 220;
  const tableWidth = 1000;
  const headerHeight = 65;
  const rowHeight = 105;
  const gap = 12;

  // Header background
  svg += `<rect x="${startX}" y="${startY}" width="${tableWidth}" height="${headerHeight}" rx="14" fill="#1E293B" stroke="#334155" stroke-width="2"/>`;

  // Header column names
  // Positions: Place (X=80), Player (X=130, left), Total (X=360), Games (X=420), Wins (X=475), Pos (X=535), PosProt (X=600), BestMove (X=670), Ci (X=735), GamePen (X=805), ProtPen (X=875), DiscPen (X=965)
  svg += `
  <text x="80" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="#94A3B8">Место</text>
  <text x="130" y="${startY + 40}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="#94A3B8">Игрок</text>
  <text x="360" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="900" fill="#38BDF8">Σ</text>
  <text x="420" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="#94A3B8">И</text>
  <text x="475" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="#34D399">П</text>
  <text x="535" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="#34D399">+</text>
  <text x="600" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="#34D399">+Пр</text>
  <text x="670" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="#FBBF24">ЛХ</text>
  <text x="735" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="#22D3EE">Ci</text>
  <text x="805" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="#F87171">Игр. −</text>
  <text x="875" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="#F87171">−Пр</text>
  <text x="965" y="${startY + 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="#F87171">Дисц. −</text>
  `;

  // Render rows
  for (let rIdx = 0; rIdx < standings.length; rIdx++) {
    const item = standings[rIdx];
    const ry = startY + headerHeight + 15 + rIdx * (rowHeight + gap);
    if (ry + rowHeight > height - 100) break; // prevent vertical overflow just in case

    svg += `<rect x="${startX}" y="${ry}" width="${tableWidth}" height="${rowHeight}" rx="16" fill="#1E293B" stroke="#334155" stroke-width="1.5"/>`;

    // Place badge
    let placeBg = 'rgba(51, 65, 85, 0.4)';
    let placeText = '#F8FAFC';
    let placeBorder = '#475569';
    if (item.place === 1) {
      placeBg = 'rgba(251, 191, 36, 0.15)';
      placeText = '#FBBF24';
      placeBorder = 'rgba(251, 191, 36, 0.4)';
    } else if (item.place === 2) {
      placeBg = 'rgba(148, 163, 184, 0.15)';
      placeText = '#94A3B8';
      placeBorder = 'rgba(148, 163, 184, 0.4)';
    } else if (item.place === 3) {
      placeBg = 'rgba(180, 83, 9, 0.15)';
      placeText = '#F97316';
      placeBorder = 'rgba(180, 83, 9, 0.4)';
    }

    svg += `
    <rect x="${startX + 14}" y="${ry + 27}" width="50" height="50" rx="14" fill="${placeBg}" stroke="${placeBorder}" stroke-width="1.5"/>
    <text x="${startX + 39}" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="900" fill="${placeText}">${item.place}</text>
    `;

    // Player name & number
    const safeName = escapeXml(item.display_name);
    svg += `
    <text x="130" y="${ry + 45}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="#F8FAFC">${safeName}</text>
    <text x="130" y="${ry + 73}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" fill="#64748B">Слот #${item.participant_number}</text>
    `;

    // Total points (Σ) - styled larger
    svg += `
    <text x="360" y="${ry + 61}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="900" fill="#38BDF8">${formatPoints(item.total_points)}</text>
    `;

    // Games played
    svg += `
    <text x="420" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="#E2E8F0">${item.games_played}</text>
    `;

    // Wins (П)
    svg += `
    <text x="475" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="#34D399">${item.wins}</text>
    `;

    // Positive judge points (+)
    svg += `
    <text x="535" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#34D399">${formatPoints(item.positive_judge_points ?? 0)}</text>
    `;

    // Positive protocol points (+Пр)
    svg += `
    <text x="600" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#34D399">${formatPoints(item.positive_protocol_points ?? 0)}</text>
    `;

    // Best move points (ЛХ)
    svg += `
    <text x="670" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#FBBF24">${formatPoints(item.best_move_points)}</text>
    `;

    // Ci points
    svg += `
    <text x="735" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#22D3EE">${formatPoints(item.ci_points)}</text>
    `;

    // Game Penalty
    svg += `
    <text x="805" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#F87171">${formatPoints(item.negative_judge_points ? -item.negative_judge_points : 0)}</text>
    `;

    // Protocol Penalty
    svg += `
    <text x="875" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#F87171">${formatPoints(item.negative_protocol_points ? -item.negative_protocol_points : 0)}</text>
    `;

    // Disc Penalty
    svg += `
    <text x="965" y="${ry + 59}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#F87171">${formatPoints(item.disciplinary_penalty_points ? -item.disciplinary_penalty_points : 0)}</text>
    `;
  }

  // Footer Disclaimer
  svg += `
  <text x="${width / 2}" y="${height - 75}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="700" fill="#FBBF24">
    Промежуточные результаты. Не являются финальным протоколом турнира.
  </text>
  <text x="${width / 2}" y="${height - 35}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#64748B">
    NewMafia CRM • Турнирная таблица (${completedGamesCount} завершённых игр)
  </text>
  </svg>
  `;

  return svg;
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

export type OfficialScoreKind =
  | 'wins'
  | 'judge'
  | 'protocol'
  | 'legacy_bonus'
  | 'best_move'
  | 'ci'
  | 'game_penalty'
  | 'discipline'
  | 'residual_bonus'
  | 'residual_penalty';

export interface OfficialNominationCandidate {
  participant_id: string;
  display_name: string;
  points: number;
  additional_points: number;
  role_wins: number;
  nomination_points: number;
  games_in_role: number;
  judge_bonus: number;
  protocol_bonus: number;
  best_move_points: number;
}

export interface OfficialNominationComparison {
  winner_participant_id: string | null;
  tied_participant_ids: string[];
  has_exact_tie: boolean;
  decisive_criterion: 'points' | 'additional_points' | 'role_wins' | 'head_to_head' | 'exact_tie' | null;
  decisive_value: number | null;
  head_to_head_scores: Record<string, number> | null;
  stages: Array<{
    criterion: 'points' | 'additional_points' | 'role_wins' | 'head_to_head';
    candidate_ids: string[];
    values: Record<string, number>;
    advancing_ids: string[];
    decisive: boolean;
  }>;
}

export interface OfficialNominationResult {
  category: string;
  title: string;
  has_tie: boolean;
  candidates: OfficialNominationCandidate[];
  winner_participant_id: string | null;
  decisive_criterion: OfficialNominationComparison['decisive_criterion'];
  comparison: OfficialNominationComparison;
}

export interface OfficialNominationReason {
  category: string | null;
  decisive_criterion: Exclude<OfficialNominationComparison['decisive_criterion'], null | 'exact_tie'>;
  headline: string;
  games_in_role: number | null;
  points: number;
  additional_points: number;
  protocol_bonus: number;
  best_move_points: number;
  role_wins: number;
  head_to_head_label: string | null;
  show_metrics: boolean;
}

export interface OfficialAwardPresentation {
  key: string;
  title: string;
  place: number | null;
  source: 'automatic' | 'manual' | 'suppressed' | 'unresolved';
  participant_id: string | null;
  player_id: string | null;
  display_name: string;
  points: number | null;
  avatar_data_url: string | null;
  nomination_reason?: OfficialNominationReason | null;
}

export interface OfficialStandingPresentation extends TournamentStandingItem {
  display_place: number;
  avatar_data_url: string | null;
}

export interface OfficialTournamentResultsPresentation {
  tournament: Tournament;
  podium: OfficialAwardPresentation[];
  standings: OfficialStandingPresentation[];
  nominations: OfficialAwardPresentation[];
  generated_at: Date;
}

export interface OfficialScoreComponent {
  kind: OfficialScoreKind;
  label: string;
  value: number;
  tone: 'base' | 'bonus' | 'penalty';
  show_plus: boolean;
}

const splitLongToken = (token: string, maxChars: number): string[] => {
  if (token.length <= maxChars) return [token];
  const parts: string[] = [];
  for (let i = 0; i < token.length; i += maxChars) parts.push(token.slice(i, i + maxChars));
  return parts;
};

export function wrapExportText(value: string | null | undefined, maxChars: number, maxLines = 2): string[] {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return ['—'];

  const words = normalized.split(' ').flatMap((word) => splitLongToken(word, maxChars));
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

  const consumed = lines.join(' ').replace(/…$/, '');
  if (normalized.length > consumed.length && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }
  return lines.slice(0, maxLines);
}

const roundOfficial = (value: number): number => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const russianPlural = (value: number, one: string, few: string, many: string): string => {
  const absoluteValue = Math.abs(Number(value || 0));
  if (!Number.isInteger(absoluteValue)) return few;
  const absolute = Math.trunc(absoluteValue);
  const mod100 = absolute % 100;
  const mod10 = absolute % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const formatPosterNumber = (
  value: number | null | undefined,
  options: { signed?: boolean; minimumFractionDigits?: number } = {},
): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const rounded = roundOfficial(Number(value));
  const abs = Math.abs(rounded).toLocaleString('ru-RU', {
    minimumFractionDigits: options.minimumFractionDigits ?? 1,
    maximumFractionDigits: 2,
  });
  if (!options.signed || rounded === 0) return rounded < 0 ? `−${abs}` : abs;
  return rounded > 0 ? `+${abs}` : `−${abs}`;
};

const formatBallWord = (value: number): string => russianPlural(value, 'балл', 'балла', 'баллов');
void formatBallWord;
const formatGameWord = (value: number): string => russianPlural(value, 'игра', 'игры', 'игр');

const formatWinsSummary = (wins: number, games: number): string =>
  `${wins} ${russianPlural(wins, 'победа', 'победы', 'побед')} из ${games}`;

export function getOfficialScoreComponents(item: TournamentStandingItem): OfficialScoreComponent[] {
  const components: OfficialScoreComponent[] = [];
  const wins = Number(item.wins || 0);
  const positiveJudge = Number(item.positive_judge_points || 0);
  const positiveProtocol = Number(item.positive_protocol_points || 0);
  const detailedPositive = roundOfficial(positiveJudge + positiveProtocol);
  const legacyPositive = detailedPositive === 0 ? Number(item.positive_points || 0) : 0;
  const bestMove = Number(item.best_move_points || 0);
  const firstKilledCompensation = Number(item.ci_points || 0);
  const discipline = Number(item.disciplinary_penalty_points || 0);
  const gamePenalty = item.game_penalty_points === undefined
    ? Math.max(0, Number(item.penalty_points || 0) - discipline)
    : Number(item.game_penalty_points || 0);

  const push = (
    kind: OfficialScoreKind,
    label: string,
    value: number,
    tone: OfficialScoreComponent['tone'],
    showPlus = true,
  ) => {
    const rounded = roundOfficial(value);
    if (Math.abs(rounded) < 0.0001) return;
    components.push({ kind, label, value: rounded, tone, show_plus: showPlus });
  };

  push('wins', 'За победы', wins, 'base', false);
  push('judge', 'Оценка судей', positiveJudge, 'bonus');
  push('protocol', 'Игровые бонусы', positiveProtocol, 'bonus');
  push('legacy_bonus', 'Дополнительные баллы', legacyPositive, 'bonus');
  push('best_move', 'Лучший ход', bestMove, 'bonus');
  push('ci', 'Компенсация первого убитого', firstKilledCompensation, 'bonus');
  push('game_penalty', 'Штрафы в игре', -gamePenalty, 'penalty');
  push('discipline', 'Дисциплинарный штраф', -discipline, 'penalty');

  const shownTotal = roundOfficial(components.reduce((sum, component) => sum + component.value, 0));
  const residual = roundOfficial(Number(item.total_points || 0) - shownTotal);
  if (Math.abs(residual) >= 0.005) {
    push(
      residual > 0 ? 'residual_bonus' : 'residual_penalty',
      residual > 0 ? 'Прочие баллы' : 'Прочий штраф',
      residual,
      residual > 0 ? 'bonus' : 'penalty',
    );
  }

  return components;
}

const nominationRoleWinLabel = (category: string | null | undefined, wins: number): string => {
  const role = category === 'best_sheriff' ? 'ШЕРИФА' : 'ДОНА';
  return `${wins} ${russianPlural(wins, 'ПОБЕДА', 'ПОБЕДЫ', 'ПОБЕД')} В РОЛИ ${role}`;
};

function buildOfficialNominationReason(
  slot: import('./api').TournamentAwardSlot,
  result: OfficialNominationResult | undefined,
): OfficialNominationReason | null {
  if (!slot.participant_id || slot.source !== 'automatic' || !result?.comparison?.winner_participant_id) return null;
  const candidate = result.candidates.find((item) => item.participant_id === slot.participant_id);
  if (!candidate) return null;

  const criterion = result.comparison.decisive_criterion;
  if (!criterion || criterion === 'exact_tie') return null;

  let headline = 'ЛУЧШАЯ ОЦЕНКА СУДЕЙ';
  let headToHeadLabel: string | null = null;
  if (criterion === 'points') {
    headline = `ЛУЧШАЯ ОЦЕНКА СУДЕЙ · ${formatPosterNumber(candidate.points)}`;
  } else if (criterion === 'additional_points') {
    headline = `ПРИ РАВНОЙ ОЦЕНКЕ · ВЫШЕ ИГРОВЫЕ НАЧИСЛЕНИЯ ${formatPosterNumber(candidate.additional_points, { signed: true })}`;
  } else if (criterion === 'role_wins') {
    headline = `ПРИ РАВНОЙ ОЦЕНКЕ И НАЧИСЛЕНИЯХ · ${nominationRoleWinLabel(result.category, candidate.role_wins)}`;
  } else if (criterion === 'head_to_head') {
    const scores = result.comparison.head_to_head_scores || {};
    const winnerScore = scores[candidate.participant_id] || 0;
    const finalStage = [...result.comparison.stages].reverse().find((stage) => stage.criterion === 'head_to_head');
    const opponentScores = (finalStage?.candidate_ids || [])
      .filter((id) => id !== candidate.participant_id)
      .map((id) => scores[id] || 0);
    headToHeadLabel = opponentScores.length === 1
      ? `${winnerScore}:${opponentScores[0]}`
      : `${winnerScore} ${russianPlural(winnerScore, 'победа', 'победы', 'побед')} против ${opponentScores.join(' / ')}`;
    headline = `ЛИЧНЫЕ ВСТРЕЧИ · ${headToHeadLabel}`;
  }

  return {
    category: result.category,
    decisive_criterion: criterion,
    headline,
    games_in_role: candidate.games_in_role,
    points: Number(candidate.points || 0),
    additional_points: Number(candidate.additional_points || 0),
    protocol_bonus: Number(candidate.protocol_bonus || 0),
    best_move_points: Number(candidate.best_move_points || 0),
    role_wins: Number(candidate.role_wins || 0),
    head_to_head_label: headToHeadLabel,
    show_metrics: true,
  };
}

function resolveOfficialAward(
  slot: import('./api').TournamentAwardSlot | undefined,
  standings: TournamentStandingItem[],
  fallbackTitle: string,
  fallbackPlace: number | null,
  avatarDataByParticipant: Record<string, string>,
): OfficialAwardPresentation {
  if (!slot) {
    return {
      key: fallbackPlace ? `place_${fallbackPlace}` : fallbackTitle,
      title: fallbackTitle,
      place: fallbackPlace,
      source: 'unresolved',
      participant_id: null,
      player_id: null,
      display_name: 'Не определено',
      points: null,
      avatar_data_url: null,
    };
  }

  if (slot.source === 'suppressed') {
    return {
      key: slot.key,
      title: slot.title || fallbackTitle,
      place: slot.place ?? fallbackPlace,
      source: slot.source,
      participant_id: null,
      player_id: null,
      display_name: 'Не присуждена',
      points: null,
      avatar_data_url: null,
    };
  }

  const standing = slot.participant_id
    ? standings.find((item) => item.participant_id === slot.participant_id)
    : undefined;

  return {
    key: slot.key,
    title: slot.title || fallbackTitle,
    place: slot.place ?? fallbackPlace,
    source: slot.source,
    participant_id: slot.participant_id || null,
    player_id: standing?.player_id || slot.player_id || null,
    display_name: standing?.display_name || slot.player_nickname || 'Не определено',
    points: standing?.total_points ?? null,
    avatar_data_url: slot.participant_id ? avatarDataByParticipant[slot.participant_id] || null : null,
  };
}

export function buildOfficialTournamentResultsPresentation(
  tournament: Tournament,
  standings: TournamentStandingItem[],
  awardSlots: import('./api').TournamentAwardSlot[],
  generatedAt = new Date(),
  avatarDataByParticipant: Record<string, string> = {},
  nominationResults: OfficialNominationResult[] = [],
): OfficialTournamentResultsPresentation {
  const podium = [1, 2, 3].map((place) => {
    const slot = awardSlots.find((item) => item.key === `place_${place}`);
    return resolveOfficialAward(slot, standings, `${place} место`, place, avatarDataByParticipant);
  });

  const nominations = awardSlots
    .filter((item) => item.kind === 'nomination')
    .map((slot) => {
      const award = resolveOfficialAward(slot, standings, slot.title, null, avatarDataByParticipant);
      const result = nominationResults.find((item) => item.category === slot.category);
      return {
        ...award,
        nomination_reason: buildOfficialNominationReason(slot, result),
      };
    });

  const podiumPlaceByParticipant = new Map<string, number>();
  for (const award of podium) {
    if (award.participant_id && award.place && award.source !== 'suppressed') {
      podiumPlaceByParticipant.set(award.participant_id, award.place);
    }
  }

  const podiumParticipants = [1, 2, 3]
    .map((place) => podium.find((award) => award.place === place)?.participant_id)
    .filter((id): id is string => Boolean(id))
    .map((id) => standings.find((item) => item.participant_id === id))
    .filter((item): item is TournamentStandingItem => Boolean(item));

  const used = new Set(podiumParticipants.map((item) => item.participant_id));
  const remaining = standings.filter((item) => !used.has(item.participant_id));
  const ordered = [...podiumParticipants, ...remaining];

  const reservedPlaces = new Set<number>([...podiumPlaceByParticipant.values()]);
  let nextPlace = 1;
  const officialStandings: OfficialStandingPresentation[] = ordered.map((item) => {
    const forcedPlace = podiumPlaceByParticipant.get(item.participant_id);
    const displayPlace = forcedPlace || (() => {
      while (reservedPlaces.has(nextPlace)) nextPlace += 1;
      const place = nextPlace;
      nextPlace += 1;
      return place;
    })();
    return {
      ...item,
      display_place: displayPlace,
      avatar_data_url: avatarDataByParticipant[item.participant_id] || null,
    };
  });
  officialStandings.sort((a, b) => a.display_place - b.display_place);

  return { tournament, podium, standings: officialStandings, nominations, generated_at: generatedAt };
}

export function getSafeFilenameForOfficial(title: string, tournamentDate?: string | null): string {
  const safeTitle = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'tournament';

  const parsed = tournamentDate ? new Date(tournamentDate) : new Date();
  const datePart = Number.isNaN(parsed.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsed.toISOString().slice(0, 10);

  return `${safeTitle}-official-results-${datePart}.png`;
}

const officialSvgFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

const formatOfficialDate = (value: string | Date | null | undefined): string => {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
};

function officialSvgTextLines(lines: string[], x: number, y: number, lineHeight: number, attrs: string): string {
  return `<text x="${x}" y="${y}" ${attrs}>${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')}</text>`;
}

const avatarInitial = (name: string | null | undefined): string => (name || '?').trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';

function officialAvatarSvg(
  dataUrl: string | null | undefined,
  displayName: string,
  x: number,
  y: number,
  size: number,
  clipId: string,
  borderColor = '#3B373D',
  borderWidth = 2,
): string {
  const radius = size / 2;
  const cx = x + radius;
  const cy = y + radius;
  const innerRadius = Math.max(1, radius - borderWidth - 2);
  const fallback = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#151217" stroke="${borderColor}" stroke-width="${borderWidth}"/>
    <circle cx="${cx}" cy="${cy}" r="${innerRadius}" fill="url(#monogramGradient)"/>
    <circle cx="${cx - size * 0.10}" cy="${cy - size * 0.13}" r="${size * 0.25}" fill="#FFFFFF" opacity="0.035" filter="url(#monogramBlur)"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.max(1, innerRadius - 4)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="${cx}" y="${cy + size * 0.12}" text-anchor="middle" font-family="${officialSvgFont}" font-size="${Math.round(size * 0.36)}" font-weight="900" fill="#F4EDE3">${escapeXml(avatarInitial(displayName))}</text>`;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return fallback;
  return `<defs><clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${innerRadius}"/></clipPath></defs>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="#151217" stroke="${borderColor}" stroke-width="${borderWidth}"/>
    <image href="${escapeXml(dataUrl)}" x="${x + borderWidth + 2}" y="${y + borderWidth + 2}" width="${size - (borderWidth + 2) * 2}" height="${size - (borderWidth + 2) * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.max(1, innerRadius - 1)}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`;
}

const getUsefulVenue = (venue: string | null | undefined): string | null => {
  const value = String(venue || '').trim();
  if (!value) return null;
  const normalized = value.toLocaleLowerCase('ru-RU');
  if (/^(зал|стол|комната|room)\s*(?:#|№)?\s*\d+/.test(normalized)) return null;
  if (/\bзал\s*#\s*\d+\b/.test(normalized)) return null;
  return value;
};

const isMvpAward = (award: OfficialAwardPresentation): boolean =>
  award.key === 'nomination_mvp' || award.title.trim().toLocaleUpperCase('ru-RU') === 'MVP';

const getStandingForAward = (
  award: OfficialAwardPresentation | undefined,
  standings: OfficialStandingPresentation[],
): OfficialStandingPresentation | null => {
  if (!award?.participant_id) return null;
  return standings.find((item) => item.participant_id === award.participant_id) || null;
};

const buildChampionFacts = (
  champion: OfficialStandingPresentation | null,
  runnerUp: OfficialStandingPresentation | null,
  nominations: OfficialAwardPresentation[],
): string[] => {
  if (!champion) return [];
  const facts: string[] = [formatWinsSummary(champion.wins, champion.games_played)];
  if (runnerUp) {
    const gap = roundOfficial(Number(champion.total_points || 0) - Number(runnerUp.total_points || 0));
    if (gap > 0.005) {
      facts.push(`ОТРЫВ ОТ ВТОРОГО МЕСТА · ${formatPosterNumber(gap, { signed: true })}`);
      return facts.slice(0, 2);
    }
  }

  const championAwards = nominations.filter((award) =>
    award.participant_id === champion.participant_id && award.source !== 'suppressed' && award.source !== 'unresolved'
  );
  if (championAwards.some(isMvpAward)) {
    facts.push('MVP турнира');
  } else if (championAwards.length > 0) {
    facts.push(`${championAwards.length} ${russianPlural(championAwards.length, 'награда', 'награды', 'наград')} турнира`);
  }
  return facts.slice(0, 2);
};

const buildTieBreakStats = (item: TournamentStandingItem): string[] => {
  const stats: string[] = [];
  const roleWins = Number(item.don_wins || 0) + Number(item.sheriff_wins || 0);
  if (roleWins > 0) {
    stats.push(`${roleWins} ${russianPlural(roleWins, 'победа', 'победы', 'побед')} в роли Дона или Шерифа`);
  }
  const firstKilled = Number(item.first_killed_count || 0);
  if (firstKilled > 0) {
    stats.push(`${firstKilled} ${russianPlural(firstKilled, 'раз', 'раза', 'раз')} убит первым`);
  }
  return stats;
};

const scoreComponentDisplay = (component: OfficialScoreComponent): string => {
  const value = formatPosterNumber(component.value, {
    signed: component.show_plus,
    minimumFractionDigits: 1,
  });
  return `${component.label} ${value}`;
};

interface OfficialScoreLayoutItem {
  text: string;
  kind: OfficialScoreKind;
  width: number;
}

interface OfficialScoreLayout {
  lines: OfficialScoreLayoutItem[][];
  fontSize: number;
  lineHeight: number;
  columnGap: number;
}

const estimateOfficialTextWidth = (text: string, fontSize: number): number =>
  Math.ceil(text.length * fontSize * 0.53 + 10);

function splitScoreComponentForWidth(
  component: OfficialScoreComponent,
  maxWidth: number,
  fontSize: number,
): OfficialScoreLayoutItem[] {
  const token = scoreComponentDisplay(component);
  if (estimateOfficialTextWidth(token, fontSize) <= maxWidth) {
    return [{ text: token, kind: component.kind, width: estimateOfficialTextWidth(token, fontSize) }];
  }

  const maxChars = Math.max(12, Math.floor((maxWidth - 10) / (fontSize * 0.53)));
  return wrapExportText(token, maxChars, 6).map((line) => ({
    text: line,
    kind: component.kind,
    width: Math.min(maxWidth, estimateOfficialTextWidth(line, fontSize)),
  }));
}

function layoutOfficialScoreComponents(
  components: OfficialScoreComponent[],
  maxWidth: number,
  options: { fontSize?: number; lineHeight?: number; columnGap?: number } = {},
): OfficialScoreLayout {
  const fontSize = options.fontSize ?? 29;
  const lineHeight = options.lineHeight ?? 38;
  const columnGap = options.columnGap ?? 24;
  const lines: OfficialScoreLayoutItem[][] = [];
  let current: OfficialScoreLayoutItem[] = [];
  let usedWidth = 0;

  const flush = () => {
    if (!current.length) return;
    lines.push(current);
    current = [];
    usedWidth = 0;
  };

  components.forEach((component) => {
    const fragments = splitScoreComponentForWidth(component, maxWidth, fontSize);
    fragments.forEach((fragment, fragmentIndex) => {
      if (fragmentIndex > 0) flush();
      const required = current.length ? columnGap + fragment.width : fragment.width;
      if (current.length && usedWidth + required > maxWidth) flush();
      current.push(fragment);
      usedWidth += (current.length > 1 ? columnGap : 0) + fragment.width;
      if (fragments.length > 1 && fragmentIndex < fragments.length - 1) flush();
    });
  });
  flush();

  return { lines, fontSize, lineHeight, columnGap };
}

const officialScoreColor = (kind: OfficialScoreKind): string => {
  switch (kind) {
    case 'wins': return NOIR_EXPORT_SCORE_COLORS.wins;
    case 'judge': return NOIR_EXPORT_SCORE_COLORS.judge;
    case 'protocol': return NOIR_EXPORT_SCORE_COLORS.protocol;
    case 'best_move': return NOIR_EXPORT_SCORE_COLORS.best_move;
    case 'ci': return NOIR_EXPORT_SCORE_COLORS.ci;
    case 'game_penalty': return NOIR_EXPORT_SCORE_COLORS.game_penalty;
    case 'discipline': return NOIR_EXPORT_SCORE_COLORS.discipline;
    case 'legacy_bonus': return NOIR_EXPORT_SCORE_COLORS.protocol;
    case 'residual_bonus': return NOIR_EXPORT_SCORE_COLORS.protocol;
    case 'residual_penalty': return NOIR_EXPORT_SCORE_COLORS.game_penalty;
  }
};

function officialScoreComponentsSvg(
  layout: OfficialScoreLayout,
  x: number,
  y: number,
): string {
  let svg = '';
  layout.lines.forEach((line, lineIndex) => {
    let cx = x;
    line.forEach((item) => {
      svg += `<text x="${cx}" y="${y + lineIndex * layout.lineHeight}" font-family="${officialSvgFont}" font-size="${layout.fontSize}" font-weight="650" fill="${officialScoreColor(item.kind)}" font-variant-numeric="tabular-nums">${escapeXml(item.text)}</text>`;
      cx += item.width + layout.columnGap;
    });
  });
  return svg;
}

interface SecondaryPodiumLayout {
  nameLines: string[];
  avatarOffsetX: number;
  avatarSize: number;
  infoOffsetX: number;
  scoreRightOffset: number;
  nameY: number;
  nameLineHeight: number;
  winsY: number;
  height: number;
}

function layoutSecondaryPodium(name: string, width: number): SecondaryPodiumLayout {
  const avatarOffsetX = 54;
  const avatarSize = 82;
  const infoOffsetX = 150;
  const scoreColumnWidth = 90;
  const scoreRightOffset = width - 6;
  const scoreLeft = scoreRightOffset - scoreColumnWidth;
  const infoWidth = Math.max(96, scoreLeft - infoOffsetX - 20);
  const nameFontSize = 34;
  const maxChars = Math.max(7, Math.floor(infoWidth / (nameFontSize * 0.53)));
  const nameLines = wrapExportText(name, maxChars, 2);
  const nameY = 84;
  const nameLineHeight = 36;
  const winsY = nameY + Math.max(0, nameLines.length - 1) * nameLineHeight + 43;
  const height = Math.max(190, winsY + 34);
  return { nameLines, avatarOffsetX, avatarSize, infoOffsetX, scoreRightOffset, nameY, nameLineHeight, winsY, height };
}

function renderSecondaryPodium(
  award: OfficialAwardPresentation | undefined,
  standing: OfficialStandingPresentation | null,
  place: 2 | 3,
  x: number,
  y: number,
  layout: SecondaryPodiumLayout,
): string {
  const accent = place === 2 ? '#BFC3C9' : '#B77951';
  const name = award?.display_name || 'Не определено';
  const points = award?.points ?? standing?.total_points ?? null;
  return `<g>
    ${officialAvatarSvg(award?.avatar_data_url, name, x + layout.avatarOffsetX, y + 24, layout.avatarSize, `podium-${place}`, accent, 2.5)}
    <text x="${x + layout.infoOffsetX}" y="${y + 40}" font-family="${officialSvgFont}" font-size="18" font-weight="850" fill="${accent}" letter-spacing="1.7">${place === 2 ? 'ВТОРОЕ МЕСТО' : 'ТРЕТЬЕ МЕСТО'}</text>
    ${officialSvgTextLines(layout.nameLines, x + layout.infoOffsetX, y + layout.nameY, layout.nameLineHeight, `font-family="${officialSvgFont}" font-size="34" font-weight="900" fill="#F3EDE4"`)}
    <text x="${x + layout.scoreRightOffset}" y="${y + 48}" text-anchor="end" font-family="${officialSvgFont}" font-size="16" font-weight="850" fill="#79736D" letter-spacing="1.6">ИТОГ</text>
    <text x="${x + layout.scoreRightOffset}" y="${y + 100}" text-anchor="end" font-family="${officialSvgFont}" font-size="46" font-weight="900" fill="#F3EDE4" font-variant-numeric="tabular-nums">${formatPosterNumber(points)}</text>
    ${standing ? `<text x="${x + layout.infoOffsetX}" y="${y + layout.winsY}" font-family="${officialSvgFont}" font-size="24" font-weight="650" fill="#AAA39A">${escapeXml(formatWinsSummary(standing.wins, standing.games_played))}</text>` : ''}
  </g>`;
}

const awardDisplayTitle = (award: OfficialAwardPresentation): string =>
  isMvpAward(award) ? 'MVP ТУРНИРА' : award.title.toLocaleUpperCase('ru-RU');

interface AwardTileLayout {
  titleLines: string[];
  nameLines: string[];
  reasonLines: string[];
  metricLayout: OfficialScoreLayout | null;
  breakdownLayout: OfficialScoreLayout | null;
  gamesLabel: string | null;
  titleY: number;
  avatarY: number;
  nameY: number;
  reasonY: number;
  gamesY: number | null;
  metricsY: number | null;
  breakdownY: number | null;
  height: number;
  avatarSize: number;
  nameX: number;
  nameFontSize: number;
  nameLineHeight: number;
}

const nominationMetricComponents = (reason: OfficialNominationReason | null | undefined): OfficialScoreComponent[] => {
  if (!reason?.show_metrics) return [];
  const items: OfficialScoreComponent[] = [];
  const push = (kind: OfficialScoreKind, label: string, value: number, showPlus = false) => {
    const rounded = roundOfficial(value);
    items.push({ kind, label, value: rounded, tone: 'bonus', show_plus: showPlus });
  };
  push('judge', 'Оценка судей', reason.points);
  push('protocol', 'Игровые начисления', reason.additional_points, true);
  if ((reason.category === 'best_sheriff' || reason.category === 'best_don') && reason.decisive_criterion !== 'points' && reason.decisive_criterion !== 'additional_points') {
    push('wins', 'Победы в роли', reason.role_wins);
  }
  return items;
};

const nominationBreakdownComponents = (reason: OfficialNominationReason | null | undefined): OfficialScoreComponent[] => {
  if (!reason?.show_metrics) return [];
  const items: OfficialScoreComponent[] = [];
  const push = (kind: OfficialScoreKind, label: string, value: number) => {
    const rounded = roundOfficial(value);
    if (Math.abs(rounded) < 0.0001) return;
    items.push({ kind, label, value: rounded, tone: 'bonus', show_plus: true });
  };
  push('protocol', 'Игровые бонусы', reason.protocol_bonus);
  push('best_move', 'Лучший ход', reason.best_move_points);
  return items;
};

const nominationReasonText = (reason: OfficialNominationReason | null | undefined): string => reason?.headline || '';

function layoutAwardTile(award: OfficialAwardPresentation, width: number, featured = false): AwardTileLayout {
  const titleFontSize = featured ? 25 : 22;
  const titleLineHeight = featured ? 31 : 27;
  const titleChars = Math.max(16, Math.floor((width - (featured ? 68 : 36)) / (titleFontSize * 0.53)));
  const titleLines = wrapExportText(awardDisplayTitle(award), titleChars, 2);
  const nameFontSize = featured ? 44 : 31;
  const nameLineHeight = featured ? 44 : 32;
  const nameLines = wrapExportText(award.display_name, featured ? 28 : 20, 2);
  const avatarSize = featured ? 88 : 76;
  const titleY = featured ? 42 : 34;
  const titleBottom = titleY + Math.max(0, titleLines.length - 1) * titleLineHeight;
  const avatarY = titleBottom + (featured ? 20 : 24);
  const nameX = featured ? 150 : 116;
  const nameY = avatarY + (featured ? 54 : 49);
  const nameBottom = nameY + Math.max(0, nameLines.length - 1) * nameLineHeight;
  const identityBottom = Math.max(avatarY + avatarSize, nameBottom + 8);

  const reason = award.nomination_reason;
  const reasonText = nominationReasonText(reason);
  const reasonChars = Math.max(16, Math.floor((width - (featured ? 68 : 36)) / (24 * 0.66)));
  const reasonLines = reasonText ? wrapExportText(reasonText, reasonChars, featured ? 3 : 4) : [];
  const reasonY = identityBottom + 34;
  let cursor = reasonY + Math.max(0, reasonLines.length - 1) * 31;

  const gamesLabel = reason?.show_metrics && reason.games_in_role !== null && reason.games_in_role > 0
    ? `${reason.games_in_role} ${formatGameWord(reason.games_in_role)}`
    : null;
  const gamesY = gamesLabel ? cursor + 34 : null;
  if (gamesY) cursor = gamesY;

  const metricComponents = nominationMetricComponents(reason);
  const metricLayout = metricComponents.length
    ? layoutOfficialScoreComponents(metricComponents, width - (featured ? 68 : 36), { fontSize: 22, lineHeight: 30, columnGap: 18 })
    : null;
  const metricsY = metricLayout ? cursor + 38 : null;
  if (metricLayout && metricsY) cursor = metricsY + Math.max(0, metricLayout.lines.length - 1) * metricLayout.lineHeight;

  const breakdownComponents = nominationBreakdownComponents(reason);
  const breakdownLayout = breakdownComponents.length
    ? layoutOfficialScoreComponents(breakdownComponents, width - (featured ? 68 : 36), { fontSize: 21, lineHeight: 29, columnGap: 18 })
    : null;
  const breakdownY = breakdownLayout ? cursor + 34 : null;
  if (breakdownLayout && breakdownY) cursor = breakdownY + Math.max(0, breakdownLayout.lines.length - 1) * breakdownLayout.lineHeight;

  const height = Math.max(featured ? 190 : 166, cursor + 30);
  return {
    titleLines,
    nameLines,
    reasonLines,
    metricLayout,
    breakdownLayout,
    gamesLabel,
    titleY,
    avatarY,
    nameY,
    reasonY,
    gamesY,
    metricsY,
    breakdownY,
    height,
    avatarSize,
    nameX,
    nameFontSize,
    nameLineHeight,
  };
}

function renderAwardExplanation(
  layout: AwardTileLayout,
  x: number,
  y: number,
): string {
  let svg = '';
  if (layout.reasonLines.length) {
    svg += officialSvgTextLines(
      layout.reasonLines,
      x,
      y + layout.reasonY,
      31,
      `font-family="${officialSvgFont}" font-size="24" font-weight="850" fill="#D8C9C2" letter-spacing="0.35"`,
    );
  }
  if (layout.gamesLabel && layout.gamesY) {
    svg += `<text x="${x}" y="${y + layout.gamesY}" font-family="${officialSvgFont}" font-size="22" font-weight="700" fill="#8F8880">${escapeXml(layout.gamesLabel)}</text>`;
  }
  if (layout.metricLayout && layout.metricsY) {
    svg += officialScoreComponentsSvg(layout.metricLayout, x, y + layout.metricsY);
  }
  if (layout.breakdownLayout && layout.breakdownY) {
    svg += officialScoreComponentsSvg(layout.breakdownLayout, x, y + layout.breakdownY);
  }
  return svg;
}

type RankingScoreGroupKey = 'base' | 'positive' | 'compensation' | 'penalty';

interface RankingScoreCell {
  item: OfficialScoreLayoutItem;
  column: 0 | 1;
  fullWidth: boolean;
}

interface RankingScoreGridRow {
  cells: RankingScoreCell[];
}

interface RankingScoreGroupLayout {
  key: RankingScoreGroupKey;
  rows: RankingScoreGridRow[];
  firstBaseline: number;
}

interface OfficialRankingRowLayout {
  item: OfficialStandingPresentation;
  nameLines: string[];
  winsY: number;
  scoreGroups: RankingScoreGroupLayout[];
  tieLines: string[];
  tieStartOffset: number | null;
  rowHeight: number;
}

const rankingGroupForKind = (kind: OfficialScoreKind): RankingScoreGroupKey => {
  if (kind === 'wins' || kind === 'judge') return 'base';
  if (kind === 'ci') return 'compensation';
  if (kind === 'game_penalty' || kind === 'discipline' || kind === 'residual_penalty') return 'penalty';
  return 'positive';
};

function layoutRankingScoreGroup(
  components: OfficialScoreComponent[],
  maxWidth: number,
  fontSize = 26,
  columnGap = 28,
): RankingScoreGridRow[] {
  const rows: RankingScoreGridRow[] = [];
  const columnWidth = (maxWidth - columnGap) / 2;
  let pending: RankingScoreCell[] = [];

  const flushPending = () => {
    if (!pending.length) return;
    rows.push({ cells: pending });
    pending = [];
  };

  for (const component of components) {
    const text = scoreComponentDisplay(component);
    const width = estimateOfficialTextWidth(text, fontSize);
    const fullWidth = component.kind === 'ci' || width > columnWidth;
    const item: OfficialScoreLayoutItem = { text, kind: component.kind, width: Math.min(width, maxWidth) };
    if (fullWidth) {
      flushPending();
      rows.push({ cells: [{ item, column: 0, fullWidth: true }] });
      continue;
    }
    pending.push({ item, column: pending.length as 0 | 1, fullWidth: false });
    if (pending.length === 2) flushPending();
  }
  flushPending();
  return rows;
}

function layoutOfficialRankingRow(
  item: OfficialStandingPresentation,
  contentWidth: number,
): OfficialRankingRowLayout {
  const nameFontSize = 36;
  const nameLineHeight = 40;
  const nameChars = Math.max(12, Math.floor(contentWidth / (nameFontSize * 0.53)));
  const nameLines = wrapExportText(item.display_name, nameChars, 2);
  const nameY = 56;
  const winsY = nameY + Math.max(0, nameLines.length - 1) * nameLineHeight + 40;
  const components = getOfficialScoreComponents(item);
  const orderedGroups: RankingScoreGroupKey[] = ['base', 'positive', 'compensation', 'penalty'];
  let cursor = winsY + 44;
  const scoreGroups: RankingScoreGroupLayout[] = [];

  for (const key of orderedGroups) {
    const groupComponents = components.filter((component) => rankingGroupForKind(component.kind) === key);
    if (!groupComponents.length) continue;
    if (scoreGroups.length) cursor += 10;
    const rows = layoutRankingScoreGroup(groupComponents, contentWidth);
    scoreGroups.push({ key, rows, firstBaseline: cursor });
    cursor += rows.length * 36;
  }

  const tieBreakStats = buildTieBreakStats(item);
  const tieChars = Math.max(28, Math.floor(contentWidth / (23 * 0.53)));
  const tieLines = tieBreakStats.length ? wrapExportText(tieBreakStats.join(' · '), tieChars, 3) : [];
  const tieStartOffset = tieLines.length ? cursor + 12 : null;
  if (tieLines.length && tieStartOffset !== null) cursor = tieStartOffset + (tieLines.length - 1) * 31 + 23;

  const rowHeight = Math.max(168, cursor + 34);
  return { item, nameLines, winsY, scoreGroups, tieLines, tieStartOffset, rowHeight };
}

function renderRankingScoreGroups(
  groups: RankingScoreGroupLayout[],
  x: number,
  y: number,
  contentWidth: number,
): string {
  const fontSize = 26;
  const columnGap = 28;
  const columnWidth = (contentWidth - columnGap) / 2;
  let svg = '';
  groups.forEach((group) => {
    group.rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell) => {
        const cx = cell.fullWidth ? x : x + cell.column * (columnWidth + columnGap);
        svg += `<text x="${cx}" y="${y + group.firstBaseline + rowIndex * 36}" font-family="${officialSvgFont}" font-size="${fontSize}" font-weight="650" fill="${officialScoreColor(cell.item.kind)}" font-variant-numeric="tabular-nums">${escapeXml(cell.item.text)}</text>`;
      });
    });
  });
  return svg;
}

export function generateOfficialTournamentResultsSvg(
  presentation: OfficialTournamentResultsPresentation,
): { svg: string; width: number; height: number } {
  const width = 1080;
  const margin = 58;
  const warmWhite = '#F3EDE4';
  const gold = '#D9B35F';
  const silver = '#BFC3C9';
  const bronze = '#B77951';

  const titleLines = wrapExportText(presentation.tournament.title, 27, 2);
  const titleExtra = Math.max(0, titleLines.length - 1) * 78;
  const championAward = presentation.podium.find((award) => award.place === 1) || presentation.podium[0];
  const secondAward = presentation.podium.find((award) => award.place === 2) || presentation.podium[1];
  const thirdAward = presentation.podium.find((award) => award.place === 3) || presentation.podium[2];
  const championStanding = getStandingForAward(championAward, presentation.standings);
  const secondStanding = getStandingForAward(secondAward, presentation.standings);
  const thirdStanding = getStandingForAward(thirdAward, presentation.standings);
  const championName = championAward?.display_name || championStanding?.display_name || 'Победитель';
  const championNameLines = wrapExportText(championName, 13, 2);
  const championNameExtra = Math.max(0, championNameLines.length - 1) * 76;
  const championFacts = buildChampionFacts(championStanding, secondStanding, presentation.nominations);

  const heroTopHeight = 338 + titleExtra;
  const championHeight = 430 + championNameExtra;
  const secondaryGap = 48;
  const secondaryWidth = (width - margin * 2 - secondaryGap) / 2;
  const secondPodiumLayout = layoutSecondaryPodium(secondAward?.display_name || 'Не определено', secondaryWidth);
  const thirdPodiumLayout = layoutSecondaryPodium(thirdAward?.display_name || 'Не определено', secondaryWidth);
  const secondaryPodiumHeight = 40 + Math.max(secondPodiumLayout.height, thirdPodiumLayout.height);
  const heroHeight = heroTopHeight + championHeight + secondaryPodiumHeight + 48;

  const rankingRankCenterX = margin + 32;
  const rankingAvatarX = margin + 78;
  const rankingAvatarSize = 82;
  const rankingContentX = rankingAvatarX + rankingAvatarSize + 24;
  const rankingTotalRight = width - margin;
  const rankingTotalColumnWidth = 118;
  const rankingContentRight = rankingTotalRight - rankingTotalColumnWidth - 24;
  const rankingContentWidth = rankingContentRight - rankingContentX;
  const rankingLayouts = presentation.standings.map((item) => layoutOfficialRankingRow(item, rankingContentWidth));

  const rankingTitleHeight = 104;
  const rankingHeight = rankingTitleHeight + rankingLayouts.reduce((sum, row) => sum + row.rowHeight, 0);

  const featuredAward = presentation.nominations.find(isMvpAward) || null;
  const awardTiles = presentation.nominations.filter((award) => award !== featuredAward);
  const awardGap = 24;
  const awardTileWidth = (width - margin * 2 - awardGap) / 2;
  const featuredAwardLayout = featuredAward ? layoutAwardTile(featuredAward, width - margin * 2, true) : null;
  const awardTileLayouts = awardTiles.map((award) => layoutAwardTile(award, awardTileWidth));
  const awardRows: { items: { award: OfficialAwardPresentation; layout: AwardTileLayout; index: number }[]; height: number }[] = [];
  for (let index = 0; index < awardTiles.length; index += 2) {
    const items = [index, index + 1]
      .filter((itemIndex) => itemIndex < awardTiles.length)
      .map((itemIndex) => ({ award: awardTiles[itemIndex], layout: awardTileLayouts[itemIndex], index: itemIndex }));
    awardRows.push({ items, height: Math.max(...items.map((item) => item.layout.height)) });
  }
  const featuredAwardHeight = featuredAwardLayout?.height || 0;
  const awardsGridHeight = awardRows.reduce((sum, row, index) => sum + row.height + (index > 0 ? 22 : 0), 0);
  const awardsHeight = presentation.nominations.length
    ? 98 + featuredAwardHeight + (featuredAward && awardRows.length ? 24 : 0) + awardsGridHeight + 38
    : 0;
  const footerHeight = 132;
  const height = heroHeight + rankingHeight + awardsHeight + footerHeight;

  const tournamentDate = formatOfficialDate(presentation.tournament.date).toLocaleUpperCase('ru-RU');
  const completedGames = Math.max(
    Number(presentation.tournament.completed_games_count || 0),
    ...presentation.standings.map((item) => Number(item.games_played || 0)),
    0,
  );
  const venue = getUsefulVenue(presentation.tournament.venue);
  const metaParts = [
    tournamentDate,
    `${presentation.standings.length} ${russianPlural(presentation.standings.length, 'игрок', 'игрока', 'игроков')}`,
    `${completedGames} ${russianPlural(completedGames, 'игра', 'игры', 'игр')}`,
    venue,
  ].filter((part): part is string => Boolean(part));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="posterBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#08080A"/>
      <stop offset="46%" stop-color="#0C0A0D"/>
      <stop offset="100%" stop-color="#120D11"/>
    </linearGradient>
    <linearGradient id="wineWash" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5B1329" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="#2B0C18" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#09090B" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="championWash" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#D9B35F" stop-opacity="0.13"/>
      <stop offset="55%" stop-color="#6A4317" stop-opacity="0.035"/>
      <stop offset="100%" stop-color="#0A090B" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="mvpWash" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7B1835" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="#150E12" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="awardWash" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5B1329" stop-opacity="0.12"/>
      <stop offset="70%" stop-color="#160F13" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#0A090B" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="monogramGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4E1728"/>
      <stop offset="48%" stop-color="#261018"/>
      <stop offset="100%" stop-color="#111014"/>
    </linearGradient>
    <filter id="championGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="38"/>
    </filter>
    <filter id="monogramBlur" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#posterBg)"/>
  <rect x="0" y="0" width="${width}" height="${heroHeight}" fill="url(#wineWash)"/>
  <rect x="0" y="0" width="${width}" height="10" fill="#7E1736"/>
  <text x="${margin}" y="68" font-family="${officialSvgFont}" font-size="24" font-weight="900" fill="#D7A0AE" letter-spacing="3.2">2LA NOIRE</text>
  <text x="${margin}" y="112" font-family="${officialSvgFont}" font-size="22" font-weight="850" fill="#857E77" letter-spacing="3.8">ИТОГИ ТУРНИРА</text>
  ${officialSvgTextLines(titleLines, margin, 194, 78, `font-family="${officialSvgFont}" font-size="70" font-weight="900" fill="${warmWhite}" letter-spacing="-1.6"`)}
  <text x="${margin}" y="${292 + titleExtra}" font-family="${officialSvgFont}" font-size="24" font-weight="650" fill="#A49D94">${escapeXml(metaParts.join('   ·   '))}</text>
  <line x1="${margin}" y1="${heroTopHeight - 18}" x2="${width - margin}" y2="${heroTopHeight - 18}" stroke="rgba(255,255,255,0.11)" stroke-width="1"/>`;

  let y = heroTopHeight;
  const championInfoX = 382;
  const championScoreRight = width - margin - 4;
  const championScoreLabelY = y + 82;
  const championScoreValueY = y + 174;
  const championFactsY = y + 330 + championNameExtra;
  svg += `<rect x="${margin}" y="${y}" width="${width - margin * 2}" height="${championHeight - 16}" fill="url(#championWash)"/>
    <circle cx="218" cy="${y + 204}" r="170" fill="#D9B35F" opacity="0.07" filter="url(#championGlow)"/>
    <text x="${championInfoX}" y="${y + 54}" font-family="${officialSvgFont}" font-size="22" font-weight="900" fill="${gold}" letter-spacing="2.4">ЧЕМПИОН ТУРНИРА</text>
    ${officialAvatarSvg(championAward?.avatar_data_url, championName, 82, y + 82, 250, 'champion-avatar', gold, 4)}
    ${officialSvgTextLines(championNameLines, championInfoX, y + 132, 76, `font-family="${officialSvgFont}" font-size="76" font-weight="900" fill="${warmWhite}" letter-spacing="-1.9"`)}
    <text x="${championScoreRight}" y="${championScoreLabelY}" text-anchor="end" font-family="${officialSvgFont}" font-size="19" font-weight="900" fill="#A28A57" letter-spacing="2.0">ИТОГОВЫЙ БАЛЛ</text>
    <text x="${championScoreRight}" y="${championScoreValueY}" text-anchor="end" font-family="${officialSvgFont}" font-size="78" font-weight="900" fill="${gold}" font-variant-numeric="tabular-nums" letter-spacing="-2">${formatPosterNumber(championAward?.points ?? championStanding?.total_points)}</text>`;

  championFacts.forEach((fact, index) => {
    const factX = championInfoX + index * 300;
    const factLines = wrapExportText(fact, index === 0 ? 20 : 22, 2);
    svg += officialSvgTextLines(
      factLines,
      factX,
      championFactsY,
      31,
      `font-family="${officialSvgFont}" font-size="27" font-weight="700" fill="#CDC6BC"`,
    );
  });

  y += championHeight;
  const secondX = margin;
  const thirdX = margin + secondaryWidth + secondaryGap;
  const dividerX = margin + secondaryWidth + secondaryGap / 2;
  svg += `<line x1="${margin}" y1="${y + 10}" x2="${width - margin}" y2="${y + 10}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
    ${renderSecondaryPodium(secondAward, secondStanding, 2, secondX, y + 24, secondPodiumLayout)}
    <line x1="${dividerX}" y1="${y + 42}" x2="${dividerX}" y2="${y + secondaryPodiumHeight - 26}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
    ${renderSecondaryPodium(thirdAward, thirdStanding, 3, thirdX, y + 24, thirdPodiumLayout)}
    <line x1="${margin}" y1="${y + secondaryPodiumHeight}" x2="${width - margin}" y2="${y + secondaryPodiumHeight}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`;

  y = heroHeight;
  svg += `<text x="${margin}" y="${y + 62}" font-family="${officialSvgFont}" font-size="34" font-weight="900" fill="${warmWhite}" letter-spacing="1.4">ФИНАЛЬНЫЙ РЕЙТИНГ</text>
    <text x="${width - margin}" y="${y + 62}" text-anchor="end" font-family="${officialSvgFont}" font-size="21" font-weight="650" fill="#706A64">${presentation.standings.length} ${russianPlural(presentation.standings.length, 'участник', 'участника', 'участников')}</text>`;
  y += rankingTitleHeight;

  rankingLayouts.forEach((layout, index) => {
    const { item, nameLines, winsY, scoreGroups, tieLines, tieStartOffset, rowHeight } = layout;
    const rowY = y;
    const accent = item.display_place === 1 ? gold : item.display_place === 2 ? silver : item.display_place === 3 ? bronze : '#8B8580';
    if (item.display_place <= 3) {
      svg += `<rect x="${margin}" y="${rowY + 18}" width="4" height="${rowHeight - 36}" fill="${accent}" opacity="0.82"/>`;
    }
    svg += `<line x1="${margin}" y1="${rowY}" x2="${width - margin}" y2="${rowY}" stroke="rgba(255,255,255,0.085)" stroke-width="1"/>
      <text x="${rankingRankCenterX}" y="${rowY + 73}" text-anchor="middle" font-family="${officialSvgFont}" font-size="40" font-weight="900" fill="${accent}" font-variant-numeric="tabular-nums">${String(item.display_place).padStart(2, '0')}</text>
      ${officialAvatarSvg(item.avatar_data_url, item.display_name, rankingAvatarX, rowY + 26, rankingAvatarSize, `standing-${index}`, item.display_place <= 3 ? accent : '#39353B', item.display_place <= 3 ? 2.5 : 1.5)}
      ${officialSvgTextLines(nameLines, rankingContentX, rowY + 56, 40, `font-family="${officialSvgFont}" font-size="36" font-weight="900" fill="${warmWhite}"`)}
      <text x="${rankingContentX}" y="${rowY + winsY}" font-family="${officialSvgFont}" font-size="27" font-weight="650" fill="#AAA39A">${escapeXml(formatWinsSummary(item.wins, item.games_played))}</text>
      <text x="${rankingTotalRight}" y="${rowY + 56}" text-anchor="end" font-family="${officialSvgFont}" font-size="50" font-weight="900" fill="${item.display_place <= 3 ? accent : warmWhite}" font-variant-numeric="tabular-nums">${formatPosterNumber(item.total_points)}</text>
      ${renderRankingScoreGroups(scoreGroups, rankingContentX, rowY, rankingContentWidth)}`;

    if (tieLines.length && tieStartOffset !== null) {
      svg += officialSvgTextLines(tieLines, rankingContentX, rowY + tieStartOffset, 31, `font-family="${officialSvgFont}" font-size="23" font-weight="600" fill="#746E68"`);
    }
    y += rowHeight;
  });
  svg += `<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="rgba(255,255,255,0.085)" stroke-width="1"/>`;

  if (presentation.nominations.length) {
    svg += `<text x="${margin}" y="${y + 66}" font-family="${officialSvgFont}" font-size="34" font-weight="900" fill="${warmWhite}" letter-spacing="1.4">НАГРАДЫ ТУРНИРА</text>`;
    y += 98;

    if (featuredAward && featuredAwardLayout) {
      const featuredName = featuredAward.display_name;
      const innerX = margin + 34;
      svg += `<rect x="${margin}" y="${y}" width="${width - margin * 2}" height="${featuredAwardLayout.height}" fill="url(#mvpWash)"/>
        <rect x="${margin}" y="${y}" width="4" height="${featuredAwardLayout.height}" fill="#A93C5D"/>
        ${officialSvgTextLines(featuredAwardLayout.titleLines, innerX, y + featuredAwardLayout.titleY, 31, `font-family="${officialSvgFont}" font-size="25" font-weight="900" fill="#D6A1AE" letter-spacing="2.2"`)}
        ${officialAvatarSvg(featuredAward.avatar_data_url, featuredAward.participant_id ? featuredName : featuredAward.title, innerX, y + featuredAwardLayout.avatarY, featuredAwardLayout.avatarSize, 'award-mvp', '#A95169', 3)}
        ${officialSvgTextLines(featuredAwardLayout.nameLines, margin + featuredAwardLayout.nameX, y + featuredAwardLayout.nameY, featuredAwardLayout.nameLineHeight, `font-family="${officialSvgFont}" font-size="${featuredAwardLayout.nameFontSize}" font-weight="900" fill="${warmWhite}"`)}
        ${renderAwardExplanation(featuredAwardLayout, innerX, y)}`;
      y += featuredAwardHeight;
      if (awardRows.length) y += 24;
    }

    awardRows.forEach((row, rowIndex) => {
      row.items.forEach(({ award, layout, index }) => {
        const col = index % 2;
        const tileX = margin + col * (awardTileWidth + awardGap);
        const innerX = tileX + 18;
        svg += `<rect x="${tileX}" y="${y}" width="${awardTileWidth}" height="${row.height}" fill="url(#awardWash)"/>
          <rect x="${tileX}" y="${y}" width="${awardTileWidth}" height="3" fill="#7E1736" opacity="0.9"/>
          ${officialSvgTextLines(layout.titleLines, innerX, y + layout.titleY, 27, `font-family="${officialSvgFont}" font-size="22" font-weight="900" fill="#D6A1AE" letter-spacing="1.2"`)}
          ${officialAvatarSvg(award.avatar_data_url, award.participant_id ? award.display_name : award.title, innerX, y + layout.avatarY, layout.avatarSize, `award-tile-${index}`, '#69414D', 2)}
          ${officialSvgTextLines(layout.nameLines, tileX + layout.nameX, y + layout.nameY, layout.nameLineHeight, `font-family="${officialSvgFont}" font-size="${layout.nameFontSize}" font-weight="900" fill="${warmWhite}"`)}
          ${renderAwardExplanation(layout, innerX, y)}`;
      });
      y += row.height;
      if (rowIndex < awardRows.length - 1) y += 22;
    });
    y += 38;
  }

  const footerY = height - footerHeight;
  svg += `<line x1="${margin}" y1="${footerY + 20}" x2="${width - margin}" y2="${footerY + 20}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
    <text x="${width / 2}" y="${footerY + 78}" text-anchor="middle" font-family="${officialSvgFont}" font-size="25" font-weight="900" fill="#B88B97" letter-spacing="4.2">2LA NOIRE</text>
  </svg>`;

  return { svg, width, height };
}

export function renderSvgToPngBlob(svgString: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';

    const fail = (message: string) => reject(new Error(message));

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fail('Браузер не поддерживает Canvas 2D для PNG-экспорта');
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : fail('Не удалось сформировать PNG-файл'),
            'image/png',
          );
          return;
        }

        const dataUrl = canvas.toDataURL('image/png');
        const [header, payload] = dataUrl.split(',', 2);
        if (!payload) {
          fail('Не удалось сформировать PNG-файл');
          return;
        }
        const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/png';
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes], { type: mime }));
      } catch (error: any) {
        fail(error?.message || 'Ошибка при отрисовке PNG');
      }
    };

    img.onerror = () => {
      fail('Браузер не смог подготовить изображение для PNG-экспорта');
    };

    // The generated SVG contains only local vector/text data. Encoding it directly
    // avoids ObjectURL lifecycle/CORS quirks and is reliable in desktop and mobile browsers.
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  });
}
