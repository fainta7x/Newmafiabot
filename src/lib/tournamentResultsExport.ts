import { Tournament, TournamentStandingItem, PlayerResultData, TournamentGame } from './api';

export interface GamePlayerExportRow {
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
  gameNumber: number
): GamePlayerExportRow[] {
  // We keep the player results in the order of their seats (1 to 10)
  const sortedResults = [...playerResults].sort((a, b) => a.seat_number - b.seat_number);

  return sortedResults.map((pr) => {
    // Find the participant's statistics in the standings
    const participantStanding = standings.find((s) => s.participant_id === pr.participant_id);
    const standingGame = participantStanding?.games?.find((g) => g.game_number === gameNumber);

    return {
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
    };
  });
}

export function generateGameResultsSvg(
  tournament: Tournament,
  game: TournamentGame,
  exportRows: GamePlayerExportRow[]
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

  const winnerTeam = game.winner_team || 'red'; // fallback just in case
  const isRedWin = winnerTeam === 'red';

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
    Результаты игры №${game.game_number}
  </text>

  <!-- Winner badge and Meta info -->
  `;

  if (isRedWin) {
    svg += `
    <rect x="50" y="155" width="220" height="42" rx="12" fill="rgba(16, 185, 129, 0.15)" stroke="rgba(16, 185, 129, 0.4)" stroke-width="1.5"/>
    <text x="160" y="182" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="800" fill="#10B981">Победа: Красные</text>
    `;
  } else {
    svg += `
    <rect x="50" y="155" width="220" height="42" rx="12" fill="rgba(139, 92, 246, 0.15)" stroke="rgba(139, 92, 246, 0.4)" stroke-width="1.5"/>
    <text x="160" y="182" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="800" fill="#C084FC">Победа: Чёрные</text>
    `;
  }

  svg += `
  <text x="295" y="182" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="700" fill="#94A3B8">
    Судья: <tspan fill="#F8FAFC" font-weight="800">${escapeXml(game.judge_name || '—')}</tspan>
  </text>
  <text x="600" y="182" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="700" fill="#94A3B8">
    Статус: <tspan fill="#34D399" font-weight="800">Завершена</tspan>
  </text>
  <text x="1030" y="182" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#64748B" text-anchor="end">
    Сформировано: ${escapeXml(dateStr)}
  </text>
  `;

  // Players Rows
  const startY = 225;
  const rowHeight = 110;
  const gap = 15;

  for (let i = 0; i < exportRows.length; i++) {
    const row = exportRows[i];
    const ry = startY + i * (rowHeight + gap);

    svg += `<rect x="50" y="${ry}" width="980" height="${rowHeight}" rx="18" fill="#1E293B" stroke="#334155" stroke-width="1.5"/>`;

    // Seat circle
    svg += `
    <circle cx="95" cy="${ry + 55}" r="26" fill="#2563EB"/>
    <text x="95" y="${ry + 63}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="900" fill="#FFFFFF">${row.seat_number}</text>
    `;

    // Nickname
    svg += `
    <text x="145" y="${ry + 42}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="800" fill="#F8FAFC">${escapeXml(row.display_name)}</text>
    `;

    // Role badge
    let roleLabel = 'Без роли';
    let textCol = '#94A3B8';
    let bgCol = 'rgba(148, 163, 184, 0.12)';
    let strokeCol = 'rgba(148, 163, 184, 0.3)';
    let badgeWidth = 95;

    const roleLower = (row.role || '').toLowerCase();
    if (roleLower === 'citizen') {
      roleLabel = 'Мирный';
      textCol = '#34D399';
      bgCol = 'rgba(52, 211, 153, 0.12)';
      strokeCol = 'rgba(52, 211, 153, 0.3)';
      badgeWidth = 85;
    } else if (roleLower === 'sheriff') {
      roleLabel = 'Шериф';
      textCol = '#FBBF24';
      bgCol = 'rgba(251, 191, 36, 0.12)';
      strokeCol = 'rgba(251, 191, 36, 0.3)';
      badgeWidth = 80;
    } else if (roleLower === 'mafia') {
      roleLabel = 'Мафия';
      textCol = '#F87171';
      bgCol = 'rgba(248, 113, 113, 0.12)';
      strokeCol = 'rgba(248, 113, 113, 0.3)';
      badgeWidth = 75;
    } else if (roleLower === 'don') {
      roleLabel = 'Дон';
      textCol = '#C084FC';
      bgCol = 'rgba(192, 132, 252, 0.12)';
      strokeCol = 'rgba(192, 132, 252, 0.3)';
      badgeWidth = 65;
    }

    svg += `
    <rect x="145" y="${ry + 58}" width="${badgeWidth}" height="28" rx="8" fill="${bgCol}" stroke="${strokeCol}" stroke-width="1"/>
    <text x="${145 + badgeWidth / 2}" y="${ry + 77}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="${textCol}">${roleLabel}</text>
    `;

    // Non-zero components
    const components: string[] = [];
    if (row.win_point !== 0) {
      components.push(`Победа ${formatPoints(row.win_point)}`);
    }
    if (row.judge_bonus !== 0) {
      components.push(`Судья ${formatPoints(row.judge_bonus)}`);
    }
    if (row.protocol_bonus !== 0) {
      components.push(`Протокол ${formatPoints(row.protocol_bonus)}`);
    }
    if (row.best_move_points !== 0) {
      components.push(`ЛХ ${formatPoints(row.best_move_points)}`);
    }
    if (row.game_penalty_points !== 0) {
      components.push(`Игр. штраф ${formatPoints(-row.game_penalty_points)}`);
    }
    if (row.disciplinary_penalty_points !== 0) {
      components.push(`Дисц. штраф ${formatPoints(-row.disciplinary_penalty_points)}`);
    }
    if (row.ci_points !== 0) {
      components.push(`Ci ${formatPoints(row.ci_points)}`);
    }

    if (components.length > 0) {
      svg += `
      <text x="${145 + badgeWidth + 15}" y="${ry + 76}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#94A3B8">
        ${escapeXml(components.join('  •  '))}
      </text>
      `;
    }

    // Large total point on the right
    const formattedTotal = formatPoints(row.game_total);
    let totalColor = '#94A3B8';
    if (row.game_total > 0) totalColor = '#10B981';
    else if (row.game_total < 0) totalColor = '#EF4444';

    svg += `
    <text x="1000" y="${ry + 65}" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="900" fill="${totalColor}">${formattedTotal}</text>
    `;
  }

  // Footer
  svg += `
  <text x="${width / 2}" y="${height - 35}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" fill="#64748B">
    NewMafia CRM • Итоговый протокол игры №${game.game_number}
  </text>
  </svg>
  `;

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
  label: string;
  value: number;
  kind: 'positive' | 'negative' | 'neutral';
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

export function getOfficialScoreComponents(item: TournamentStandingItem): OfficialScoreComponent[] {
  const components: OfficialScoreComponent[] = [];
  const wins = Number(item.wins || 0);
  const positiveJudge = Number(item.positive_judge_points || 0);
  const positiveProtocol = Number(item.positive_protocol_points || 0);
  const legacyPositive = positiveJudge === 0 && positiveProtocol === 0 ? Number(item.positive_points || 0) : 0;
  const bestMove = Number(item.best_move_points || 0);
  const ci = Number(item.ci_points || 0);
  const discipline = Number(item.disciplinary_penalty_points || 0);
  const gamePenalty = item.game_penalty_points === undefined
    ? Math.max(0, Number(item.penalty_points || 0) - discipline)
    : Number(item.game_penalty_points || 0);

  const push = (label: string, value: number) => {
    const rounded = roundOfficial(value);
    if (Math.abs(rounded) < 0.0001) return;
    components.push({
      label,
      value: rounded,
      kind: rounded > 0 ? 'positive' : rounded < 0 ? 'negative' : 'neutral',
    });
  };

  push('Победы', wins);
  push('Судейские баллы', positiveJudge);
  push('Протокольные баллы', positiveProtocol);
  push('Доп. баллы', legacyPositive);
  push('Лучший ход', bestMove);
  push('Ci-компенсация', ci);
  push('Игровые штрафы', -gamePenalty);
  push('Дисциплина', -discipline);

  const shownTotal = roundOfficial(components.reduce((sum, component) => sum + component.value, 0));
  const residual = roundOfficial(Number(item.total_points || 0) - shownTotal);
  if (Math.abs(residual) >= 0.005) push('Корректировка', residual);

  return components;
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
): OfficialTournamentResultsPresentation {
  const podium = [1, 2, 3].map((place) => {
    const slot = awardSlots.find((item) => item.key === `place_${place}`);
    return resolveOfficialAward(slot, standings, `${place} место`, place, avatarDataByParticipant);
  });

  const nominations = awardSlots
    .filter((item) => item.kind === 'nomination')
    .map((slot) => resolveOfficialAward(slot, standings, slot.title, null, avatarDataByParticipant));

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

const officialSvgFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const formatOfficialDate = (value: string | Date | null | undefined, includeTime = false): string => {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return includeTime
    ? date.toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatOfficialTotal = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const rounded = Math.round(Number(value) * 100) / 100;
  if (rounded === 0) return '0';
  return String(rounded).replace('.', ',').replace('-', '−');
};

function officialSvgTextLines(lines: string[], x: number, y: number, lineHeight: number, attrs: string): string {
  return `<text x="${x}" y="${y}" ${attrs}>${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')}</text>`;
}

const statusLabel = (status: Tournament['status']): string => ({
  draft: 'ЧЕРНОВИК',
  active: 'ИДЁТ',
  completed: 'ЗАВЕРШЁН',
  correction: 'КОРРЕКТИРОВКА',
}[status] || status.toUpperCase());

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
  const fallback = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#211F24" stroke="${borderColor}" stroke-width="${borderWidth}"/>
    <text x="${cx}" y="${cy + size * 0.11}" text-anchor="middle" font-family="${officialSvgFont}" font-size="${Math.round(size * 0.34)}" font-weight="900" fill="#E13458">${escapeXml(avatarInitial(displayName))}</text>`;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return fallback;
  return `<defs><clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${radius - borderWidth}"/></clipPath></defs>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="#211F24" stroke="${borderColor}" stroke-width="${borderWidth}"/>
    <image href="${escapeXml(dataUrl)}" x="${x + borderWidth}" y="${y + borderWidth}" width="${size - borderWidth * 2}" height="${size - borderWidth * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`;
}

function officialScoreComponentsSvg(
  components: OfficialScoreComponent[],
  x: number,
  y: number,
  maxX: number,
): string {
  if (!components.length) {
    return `<text x="${x}" y="${y}" font-family="${officialSvgFont}" font-size="14" font-weight="650" fill="#77736D">Без дополнительных начислений</text>`;
  }
  let cx = x;
  let cy = y;
  const lineHeight = 25;
  let svg = '';
  components.forEach((component) => {
    const value = formatPoints(component.value);
    const token = `${component.label} ${value}`;
    const estimatedWidth = Math.min(220, 20 + token.length * 7.1);
    if (cx > x && cx + estimatedWidth > maxX) {
      cx = x;
      cy += lineHeight;
    }
    const valueColor = component.kind === 'negative' ? '#E45A67' : component.kind === 'positive' ? '#E8BCC6' : '#D6D0C8';
    svg += `<text x="${cx}" y="${cy}" font-family="${officialSvgFont}" font-size="13.5" font-weight="650" fill="#8E8982">${escapeXml(component.label)} <tspan fill="${valueColor}" font-weight="850">${escapeXml(value)}</tspan></text>`;
    cx += estimatedWidth;
  });
  return svg;
}

export function generateOfficialTournamentResultsSvg(
  presentation: OfficialTournamentResultsPresentation,
): { svg: string; width: number; height: number } {
  const width = 1080;
  const margin = 56;
  const titleLines = wrapExportText(presentation.tournament.title, 34, 2);
  const headerHeight = 274 + Math.max(0, titleLines.length - 1) * 40;
  const podiumHeight = 330;
  const standingsTitleHeight = 62;
  const standingsRowHeight = 118;
  const standingsHeight = standingsTitleHeight + presentation.standings.length * standingsRowHeight;
  const nominationRows = Math.ceil(presentation.nominations.length / 2);
  const nominationsHeight = presentation.nominations.length ? 72 + nominationRows * 112 : 0;
  const legendHeight = 150;
  const footerHeight = 92;
  const height = headerHeight + podiumHeight + standingsHeight + nominationsHeight + legendHeight + footerHeight;

  const tournamentDate = formatOfficialDate(presentation.tournament.date);
  const generatedAt = formatOfficialDate(presentation.generated_at, true);
  const completedGames = Math.max(
    Number(presentation.tournament.completed_games_count || 0),
    ...presentation.standings.map((item) => Number(item.games_played || 0)),
    0,
  );
  const metaParts = [
    tournamentDate,
    presentation.tournament.venue || null,
    `${presentation.standings.length} игроков`,
    `${completedGames} игр`,
    statusLabel(presentation.tournament.status),
  ].filter((part): part is string => Boolean(part));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="officialBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#09090B"/>
      <stop offset="52%" stop-color="#0D0C0F"/>
      <stop offset="100%" stop-color="#131115"/>
    </linearGradient>
    <linearGradient id="officialAccent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#E13458"/>
      <stop offset="100%" stop-color="#9E2441"/>
    </linearGradient>
    <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="12"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#officialBg)"/>
  <rect x="0" y="0" width="${width}" height="12" fill="url(#officialAccent)"/>
  <circle cx="980" cy="92" r="92" fill="#E13458" opacity="0.055" filter="url(#softGlow)"/>
  <text x="${margin}" y="62" font-family="${officialSvgFont}" font-size="22" font-weight="900" fill="#E13458" letter-spacing="2.2">2LA NOIRE</text>
  <text x="${margin}" y="96" font-family="${officialSvgFont}" font-size="15" font-weight="800" fill="#8E8982" letter-spacing="2.8">ОФИЦИАЛЬНЫЕ РЕЗУЛЬТАТЫ</text>
  ${officialSvgTextLines(titleLines, margin, 154, 40, `font-family="${officialSvgFont}" font-size="40" font-weight="900" fill="#F5F0E8"`)}
  <text x="${margin}" y="${214 + Math.max(0, titleLines.length - 1) * 40}" font-family="${officialSvgFont}" font-size="15.5" font-weight="650" fill="#9A958E">${escapeXml(metaParts.join('  ·  '))}</text>`;

  if (presentation.tournament.chief_judge_name) {
    svg += `<text x="${margin}" y="${242 + Math.max(0, titleLines.length - 1) * 40}" font-family="${officialSvgFont}" font-size="13.5" font-weight="650" fill="#706B66">Главный судья: <tspan fill="#BEB7AE" font-weight="800">${escapeXml(presentation.tournament.chief_judge_name)}</tspan></text>`;
  }
  svg += `<line x1="${margin}" y1="${headerHeight - 18}" x2="${width - margin}" y2="${headerHeight - 18}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`;

  let y = headerHeight;
  svg += `<text x="${margin}" y="${y + 36}" font-family="${officialSvgFont}" font-size="18" font-weight="900" fill="#F5F0E8" letter-spacing="1.8">ПРИЗЁРЫ</text>`;

  const place1 = presentation.podium.find((award) => award.place === 1) || presentation.podium[0];
  const place2 = presentation.podium.find((award) => award.place === 2) || presentation.podium[1];
  const place3 = presentation.podium.find((award) => award.place === 3) || presentation.podium[2];
  const cardsY = y + 62;

  const renderPodiumCard = (award: OfficialAwardPresentation, place: number, x: number, cardY: number, cardW: number, cardH: number, accent: string, featured = false) => {
    const avatarSize = featured ? 104 : 78;
    const avatarX = x + (cardW - avatarSize) / 2;
    const avatarY = cardY + (featured ? 36 : 28);
    const nameY = avatarY + avatarSize + (featured ? 30 : 25);
    const pointY = cardY + cardH - 26;
    const nameLines = wrapExportText(award?.display_name || 'Не определено', featured ? 18 : 15, 1);
    return `<rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${featured ? '#171419' : '#121114'}" stroke="${accent}" stroke-opacity="${featured ? 0.64 : 0.34}" stroke-width="${featured ? 2 : 1.5}"/>
      <text x="${x + 18}" y="${cardY + 27}" font-family="${officialSvgFont}" font-size="12" font-weight="900" fill="${accent}" letter-spacing="1.5">${place === 1 ? 'I МЕСТО' : place === 2 ? 'II МЕСТО' : 'III МЕСТО'}</text>
      ${officialAvatarSvg(award?.avatar_data_url, award?.display_name || '?', avatarX, avatarY, avatarSize, `podium-${place}`, accent, featured ? 3 : 2)}
      ${officialSvgTextLines(nameLines, x + cardW / 2, nameY, 22, `text-anchor="middle" font-family="${officialSvgFont}" font-size="${featured ? 20 : 17}" font-weight="900" fill="#F5F0E8"`)}
      <text x="${x + cardW / 2}" y="${pointY}" text-anchor="middle" font-family="${officialSvgFont}" font-size="${featured ? 28 : 23}" font-weight="900" fill="${accent}">${formatOfficialTotal(award?.points)}</text>
      <text x="${x + cardW / 2}" y="${pointY + 18}" text-anchor="middle" font-family="${officialSvgFont}" font-size="10.5" font-weight="700" fill="#77716B">БАЛЛОВ</text>`;
  };

  svg += renderPodiumCard(place2, 2, margin, cardsY + 26, 278, 188, '#C8CDD4');
  svg += renderPodiumCard(place1, 1, 358, cardsY, 364, 226, '#E2B84F', true);
  svg += renderPodiumCard(place3, 3, 746, cardsY + 26, 278, 188, '#C88455');

  y += podiumHeight;
  svg += `<text x="${margin}" y="${y + 34}" font-family="${officialSvgFont}" font-size="18" font-weight="900" fill="#F5F0E8" letter-spacing="1.8">ИТОГОВЫЙ РЕЙТИНГ</text>
    <text x="${width - margin}" y="${y + 34}" text-anchor="end" font-family="${officialSvgFont}" font-size="12.5" font-weight="700" fill="#706B66">СОСТАВ БАЛЛОВ → ИТОГО</text>`;
  y += standingsTitleHeight;

  presentation.standings.forEach((item, index) => {
    const rowY = y + index * standingsRowHeight;
    const rowFill = index % 2 === 0 ? '#111014' : '#0D0D10';
    const totalAccent = item.display_place === 1 ? '#E2B84F' : item.display_place === 2 ? '#C8CDD4' : item.display_place === 3 ? '#C88455' : '#F5F0E8';
    const name = wrapExportText(item.display_name, 21, 1)[0];
    const tieStats: string[] = [];
    const roleWins = Number(item.don_wins || 0) + Number(item.sheriff_wins || 0);
    if (roleWins > 0) tieStats.push(`побед Доном/Шерифом: ${roleWins}`);
    if (Number(item.first_killed_count || 0) > 0) tieStats.push(`первым убит: ${item.first_killed_count}`);
    const components = getOfficialScoreComponents(item);

    svg += `<rect x="${margin}" y="${rowY}" width="${width - margin * 2}" height="${standingsRowHeight}" fill="${rowFill}"/>
      <line x1="${margin}" y1="${rowY + standingsRowHeight}" x2="${width - margin}" y2="${rowY + standingsRowHeight}" stroke="rgba(255,255,255,0.065)" stroke-width="1"/>
      <text x="${margin + 28}" y="${rowY + 66}" text-anchor="middle" font-family="${officialSvgFont}" font-size="24" font-weight="900" fill="${totalAccent}">${String(item.display_place).padStart(2, '0')}</text>
      ${officialAvatarSvg(item.avatar_data_url, item.display_name, margin + 58, rowY + 29, 60, `standing-${index}`, item.display_place <= 3 ? totalAccent : '#38343A', item.display_place <= 3 ? 2.5 : 1.5)}
      <text x="${margin + 134}" y="${rowY + 43}" font-family="${officialSvgFont}" font-size="18.5" font-weight="900" fill="#F5F0E8">${escapeXml(name)}</text>
      <text x="${margin + 134}" y="${rowY + 68}" font-family="${officialSvgFont}" font-size="12.5" font-weight="650" fill="#827D76">${item.games_played} игр · ${item.wins} побед</text>
      ${tieStats.length ? `<text x="${margin + 134}" y="${rowY + 91}" font-family="${officialSvgFont}" font-size="11.5" font-weight="650" fill="#66615C">${escapeXml(tieStats.join(' · '))}</text>` : ''}
      ${officialScoreComponentsSvg(components, 410, rowY + 47, 875)}
      <text x="${width - margin - 10}" y="${rowY + 32}" text-anchor="end" font-family="${officialSvgFont}" font-size="10.5" font-weight="800" fill="#6F6964" letter-spacing="1.2">ИТОГО</text>
      <text x="${width - margin - 10}" y="${rowY + 68}" text-anchor="end" font-family="${officialSvgFont}" font-size="29" font-weight="900" fill="${totalAccent}">${formatOfficialTotal(item.total_points)}</text>`;
  });

  y += presentation.standings.length * standingsRowHeight;
  if (presentation.nominations.length) {
    svg += `<text x="${margin}" y="${y + 42}" font-family="${officialSvgFont}" font-size="18" font-weight="900" fill="#F5F0E8" letter-spacing="1.8">НАГРАДЫ И НОМИНАЦИИ</text>`;
    y += 72;
    const gap = 20;
    const cardW = (width - margin * 2 - gap) / 2;
    presentation.nominations.forEach((award, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const cardX = margin + col * (cardW + gap);
      const cardY = y + row * 112;
      const suppressed = award.source === 'suppressed';
      svg += `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="96" rx="14" fill="#121114" stroke="rgba(225,52,88,0.18)" stroke-width="1"/>
        ${officialAvatarSvg(suppressed ? null : award.avatar_data_url, award.display_name, cardX + 18, cardY + 22, 52, `nomination-${index}`, suppressed ? '#39353A' : '#6C3945', 1.5)}
        <text x="${cardX + 86}" y="${cardY + 34}" font-family="${officialSvgFont}" font-size="11.5" font-weight="800" fill="#8A847E" letter-spacing="0.7">${escapeXml(award.title.toLocaleUpperCase('ru-RU'))}</text>
        <text x="${cardX + 86}" y="${cardY + 63}" font-family="${officialSvgFont}" font-size="17" font-weight="900" fill="${suppressed ? '#817B75' : '#F5F0E8'}">${escapeXml(wrapExportText(award.display_name, 25, 1)[0])}</text>`;
    });
    y += nominationRows * 112;
  }

  svg += `<line x1="${margin}" y1="${y + 26}" x2="${width - margin}" y2="${y + 26}" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
    <text x="${margin}" y="${y + 60}" font-family="${officialSvgFont}" font-size="12.5" font-weight="800" fill="#9B958E">КАК ЧИТАТЬ РЕЗУЛЬТАТ</text>
    <text x="${margin}" y="${y + 86}" font-family="${officialSvgFont}" font-size="12.5" font-weight="650" fill="#716C66">В итог входят: победы, судейские и протокольные баллы, лучший ход, Ci-компенсация, игровые и дисциплинарные штрафы.</text>
    <text x="${margin}" y="${y + 108}" font-family="${officialSvgFont}" font-size="12.5" font-weight="650" fill="#716C66">Ci-компенсация — турнирный балл первого убитого по действующей формуле турнира.</text>
    <text x="${margin}" y="${y + 130}" font-family="${officialSvgFont}" font-size="12.5" font-weight="650" fill="#716C66">Победы Доном/Шерифом и показатель «первым убит» — статистика тай-брейка и отдельно к сумме не прибавляются.</text>`;

  const footerY = height - footerHeight;
  svg += `<line x1="${margin}" y1="${footerY + 12}" x2="${width - margin}" y2="${footerY + 12}" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
    <text x="${margin}" y="${footerY + 50}" font-family="${officialSvgFont}" font-size="12.5" font-weight="650" fill="#66615C">Сформировано: ${escapeXml(generatedAt)}</text>
    <text x="${width - margin}" y="${footerY + 50}" text-anchor="end" font-family="${officialSvgFont}" font-size="13" font-weight="900" fill="#A49E97" letter-spacing="1.2">2LA NOIRE</text>
    <text x="${width - margin}" y="${footerY + 72}" text-anchor="end" font-family="${officialSvgFont}" font-size="10.5" font-weight="700" fill="#5D5854">ОФИЦИАЛЬНЫЙ ТУРНИРНЫЙ ПРОТОКОЛ</text>
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
