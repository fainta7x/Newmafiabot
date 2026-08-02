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
