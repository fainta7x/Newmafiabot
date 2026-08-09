from pathlib import Path

ROOT = Path('.')


def replace_between(text: str, start: str, end: str, replacement: str) -> str:
    start_i = text.find(start)
    if start_i < 0:
        raise SystemExit(f'missing start marker: {start[:80]}')
    end_i = text.find(end, start_i)
    if end_i < 0:
        raise SystemExit(f'missing end marker: {end[:80]}')
    return text[:start_i] + replacement.rstrip() + '\n\n' + text[end_i:]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    return text.replace(old, new, 1)


# Shared theme and seating renderer are staged as complete, intentionally small source files.
Path('src/lib/exportNoirTheme.ts').write_text(Path('/tmp/exportNoirTheme.next.ts').read_text(encoding='utf-8'), encoding='utf-8')
Path('src/lib/seatingExport.ts').write_text(Path('/tmp/seatingExport.next.ts').read_text(encoding='utf-8'), encoding='utf-8')

# Tournament result renderer: replace only the reachable export renderers / contract.
p = Path('src/lib/tournamentResultsExport.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { NOIR_EXPORT_COLORS, NOIR_EXPORT_SCORE_COLORS } from './exportNoirTheme.ts';",
    "import {\n  NOIR_EXPORT_COLORS,\n  NOIR_EXPORT_SCORE_COLORS,\n  NOIR_EXPORT_FONT_FAMILY,\n  NOIR_EXPORT_LAYOUT,\n  renderNoirExportBackground,\n  renderNoirExportBrandHeader,\n  renderNoirExportFooter,\n} from './exportNoirTheme.ts';",
    'theme import',
)

game_renderer = r'''export function generateGameResultsSvg(
  tournament: Tournament,
  game: TournamentGame,
  exportRows: GamePlayerExportRow[]
): string {
  const width = NOIR_EXPORT_LAYOUT.width;
  const margin = NOIR_EXPORT_LAYOUT.margin;
  const font = NOIR_EXPORT_FONT_FAMILY;
  const seatX = margin + 16;
  const avatarX = margin + 48;
  const avatarSize = 64;
  const contentX = margin + 132;
  const totalRight = width - margin;
  const totalColumnWidth = 116;
  const contentRight = totalRight - totalColumnWidth - 28;
  const contentWidth = contentRight - contentX;
  const componentGap = 22;
  const componentColumnWidth = (contentWidth - componentGap) / 2;
  const componentFontSize = 23;
  const componentLineHeight = 30;
  const headerHeight = 250;
  const footerHeight = NOIR_EXPORT_LAYOUT.footerHeight;

  type GameScorePart = { key: keyof typeof NOIR_EXPORT_SCORE_COLORS; label: string; value: number };
  type GameScoreCell = { part: GameScorePart; text: string; column: 0 | 1; fullWidth: boolean };
  type GameScoreGridRow = { cells: GameScoreCell[] };

  const partsFor = (row: GamePlayerExportRow): GameScorePart[] => {
    const parts: GameScorePart[] = [];
    const add = (key: GameScorePart['key'], label: string, value: number) => {
      if (Math.abs(value) < 0.0001) return;
      parts.push({ key, label, value });
    };
    add('wins', 'За победу', row.win_point);
    add('judge', 'Оценка судей', row.judge_bonus);
    add('protocol', row.protocol_bonus < 0 ? 'Штраф по протоколу' : 'Бонус по протоколу', row.protocol_bonus);
    add('best_move', 'Лучший ход', row.best_move_points);
    add('ci', 'Компенсация первого убитого', row.ci_points);
    add('game_penalty', 'Штрафы в игре', -Math.abs(row.game_penalty_points));
    add('discipline', 'Дисциплинарный штраф', -Math.abs(row.disciplinary_penalty_points));
    return parts;
  };

  const estimate = (text: string): number => Math.ceil(text.length * componentFontSize * 0.53 + 8);
  const layoutComponents = (parts: GameScorePart[]): GameScoreGridRow[] => {
    const rows: GameScoreGridRow[] = [];
    let pending: GameScoreCell[] = [];
    const flush = () => {
      if (!pending.length) return;
      rows.push({ cells: pending });
      pending = [];
    };
    for (const part of parts) {
      const text = `${part.label} ${formatPoints(part.value)}`;
      const fullWidth = part.key === 'ci' || estimate(text) > componentColumnWidth;
      const cell: GameScoreCell = { part, text, column: pending.length as 0 | 1, fullWidth };
      if (fullWidth) {
        flush();
        rows.push({ cells: [{ ...cell, column: 0, fullWidth: true }] });
        continue;
      }
      pending.push(cell);
      if (pending.length === 2) flush();
    }
    flush();
    return rows;
  };

  const rowLayouts = exportRows.map((row) => {
    const nameChars = Math.max(14, Math.floor(contentWidth / (28 * 0.53)));
    const nameLines = wrapExportText(row.display_name, nameChars, 2);
    const nameY = 39;
    const nameLineHeight = 31;
    const nameBottom = nameY + Math.max(0, nameLines.length - 1) * nameLineHeight;
    const roleY = nameBottom + 28;
    const componentRows = layoutComponents(partsFor(row));
    const componentsY = roleY + 34;
    const componentsBottom = componentRows.length
      ? componentsY + Math.max(0, componentRows.length - 1) * componentLineHeight + 8
      : roleY;
    const rowHeight = Math.max(124, componentsBottom + 30);
    return { row, nameLines, nameY, nameLineHeight, roleY, componentRows, componentsY, rowHeight };
  });

  const rowsHeight = rowLayouts.reduce((sum, item) => sum + item.rowHeight, 0);
  const height = headerHeight + rowsHeight + footerHeight + 16;
  const winnerLabel = game.winner_team === 'black' ? 'ПОБЕДА ЧЁРНЫХ' : 'ПОБЕДА КРАСНЫХ';
  const winnerColor = game.winner_team === 'black' ? NOIR_EXPORT_COLORS.silver : NOIR_EXPORT_COLORS.wine;
  const roleMap: Record<string, { label: string; color: string }> = {
    citizen: { label: 'МИРНЫЙ', color: NOIR_EXPORT_SCORE_COLORS.wins },
    sheriff: { label: 'ШЕРИФ', color: NOIR_EXPORT_COLORS.gold },
    mafia: { label: 'МАФИЯ', color: '#D8747D' },
    don: { label: 'ДОН', color: '#B693C9' },
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${renderNoirExportBackground(width, height)}
    ${renderNoirExportBrandHeader('ИТОГИ ИГРЫ')}
    <text x="${margin}" y="164" font-family="${font}" font-size="48" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-0.8">ИГРА №${game.game_number}</text>
    <text x="${margin}" y="204" font-family="${font}" font-size="21" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(tournament.title)}</text>
    <text x="${totalRight}" y="160" text-anchor="end" font-family="${font}" font-size="23" font-weight="900" fill="${winnerColor}">${winnerLabel}</text>
    <text x="${totalRight}" y="201" text-anchor="end" font-family="${font}" font-size="17" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">Судья · ${escapeXml(game.judge_name || '—')}</text>
    <line x1="${margin}" y1="226" x2="${width - margin}" y2="226" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1"/>`;

  let y = headerHeight;
  rowLayouts.forEach((layout, index) => {
    const row = layout.row;
    const role = roleMap[String(row.role || '').toLowerCase()] || { label: 'БЕЗ РОЛИ', color: NOIR_EXPORT_COLORS.mutedText };
    if (index % 2 === 0) {
      svg += `<rect x="${margin}" y="${y}" width="${width - margin * 2}" height="${layout.rowHeight}" fill="${NOIR_EXPORT_COLORS.surfaceSoft}" opacity="0.18"/>`;
    }
    svg += `<text x="${seatX}" y="${y + 40}" text-anchor="middle" font-family="${font}" font-size="18" font-weight="900" fill="${NOIR_EXPORT_COLORS.subduedText}" font-variant-numeric="tabular-nums">${String(row.seat_number).padStart(2, '0')}</text>
      ${officialAvatarSvg(row.avatar_data_url, row.display_name, avatarX, y + 19, avatarSize, `game-avatar-${row.participant_id || index}`, '#39353B', 1.5)}
      ${officialSvgTextLines(layout.nameLines, contentX, y + layout.nameY, layout.nameLineHeight, `font-family="${font}" font-size="28" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}"`)}
      <text x="${contentX}" y="${y + layout.roleY}" font-family="${font}" font-size="16" font-weight="850" fill="${role.color}" letter-spacing="1.3">${role.label}</text>
      <text x="${totalRight}" y="${y + 43}" text-anchor="end" font-family="${font}" font-size="39" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" font-variant-numeric="tabular-nums">${formatPoints(row.game_total)}</text>
      <text x="${totalRight}" y="${y + 68}" text-anchor="end" font-family="${font}" font-size="12" font-weight="850" fill="${NOIR_EXPORT_COLORS.subduedText}" letter-spacing="1.3">ИТОГ ЗА ИГРУ</text>`;

    layout.componentRows.forEach((componentRow, rowIndex) => {
      componentRow.cells.forEach((cell) => {
        const x = cell.fullWidth ? contentX : contentX + cell.column * (componentColumnWidth + componentGap);
        svg += `<text x="${x}" y="${y + layout.componentsY + rowIndex * componentLineHeight}" font-family="${font}" font-size="${componentFontSize}" font-weight="700" fill="${NOIR_EXPORT_SCORE_COLORS[cell.part.key]}" font-variant-numeric="tabular-nums">${escapeXml(cell.text)}</text>`;
      });
    });
    svg += `<line x1="${margin}" y1="${y + layout.rowHeight}" x2="${width - margin}" y2="${y + layout.rowHeight}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1"/>`;
    y += layout.rowHeight;
  });

  svg += `${renderNoirExportFooter(width, height, `${exportRows.length} игроков · результат за одну игру`)}
  </svg>`;
  return svg;
}'''
s = replace_between(s, 'export function generateGameResultsSvg(', 'export function generateStandingsSvg(', game_renderer)

standings_renderer = r'''export function generateStandingsSvg(
  tournament: Tournament,
  standings: TournamentStandingItem[],
  completedGamesCount: number,
  totalGamesCount: number,
  avatarDataByParticipant: Record<string, string> = {},
): string {
  const currentStandings: OfficialStandingPresentation[] = standings.map((item) => ({
    ...item,
    display_place: item.place,
    avatar_data_url: avatarDataByParticipant[item.participant_id] || null,
  }));
  return generateRankingPublicationSvg(
    tournament,
    currentStandings,
    {
      section: 'ПРОМЕЖУТОЧНЫЕ ИТОГИ',
      heading: 'ТЕКУЩИЙ РЕЙТИНГ',
      metaLead: `После ${completedGamesCount} из ${totalGamesCount} игр`,
      footer: 'Промежуточные данные · не финальные итоги',
    },
  ).svg;
}'''
s = replace_between(s, 'export function generateStandingsSvg(', 'export function renderSvgToPngDataUrl(', standings_renderer)

publication_helpers = r'''
interface PublicationScoreCell {
  component: OfficialScoreComponent;
  text: string;
  column: 0 | 1;
  fullWidth: boolean;
}

interface PublicationScoreRow {
  cells: PublicationScoreCell[];
}

interface PublicationRankingRowLayout {
  item: OfficialStandingPresentation;
  nameLines: string[];
  nameY: number;
  nameLineHeight: number;
  winsY: number;
  scoreY: number;
  scoreRows: PublicationScoreRow[];
  tieY: number | null;
  tieLines: string[];
  rowHeight: number;
}

function layoutPublicationScoreGrid(components: OfficialScoreComponent[], contentWidth: number): PublicationScoreRow[] {
  const fontSize = 21;
  const gap = 24;
  const columnWidth = (contentWidth - gap) / 2;
  const rows: PublicationScoreRow[] = [];
  let pending: PublicationScoreCell[] = [];
  const flush = () => {
    if (!pending.length) return;
    rows.push({ cells: pending });
    pending = [];
  };
  for (const component of components) {
    const text = scoreComponentDisplay(component);
    const fullWidth = component.kind === 'ci' || estimateOfficialTextWidth(text, fontSize) > columnWidth;
    const cell: PublicationScoreCell = { component, text, column: pending.length as 0 | 1, fullWidth };
    if (fullWidth) {
      flush();
      rows.push({ cells: [{ ...cell, column: 0, fullWidth: true }] });
      continue;
    }
    pending.push(cell);
    if (pending.length === 2) flush();
  }
  flush();
  return rows;
}

function layoutPublicationRankingRow(item: OfficialStandingPresentation, contentWidth: number): PublicationRankingRowLayout {
  const nameFontSize = 29;
  const nameLineHeight = 31;
  const nameLines = wrapExportText(item.display_name, Math.max(14, Math.floor(contentWidth / (nameFontSize * 0.53))), 2);
  const nameY = 42;
  const nameBottom = nameY + Math.max(0, nameLines.length - 1) * nameLineHeight;
  const winsY = nameBottom + 28;
  const scoreRows = layoutPublicationScoreGrid(getOfficialScoreComponents(item), contentWidth);
  const scoreY = winsY + 30;
  const scoreBottom = scoreRows.length ? scoreY + (scoreRows.length - 1) * 27 + 18 : winsY;
  const tieStats = buildTieBreakStats(item);
  const tieLines = tieStats.length ? wrapExportText(tieStats.join(' · '), Math.max(28, Math.floor(contentWidth / (19 * 0.53))), 2) : [];
  const tieY = tieLines.length ? scoreBottom + 24 : null;
  const tieBottom = tieY === null ? scoreBottom : tieY + Math.max(0, tieLines.length - 1) * 24 + 16;
  const rowHeight = Math.max(138, tieBottom + 22);
  return { item, nameLines, nameY, nameLineHeight, winsY, scoreY, scoreRows, tieY, tieLines, rowHeight };
}

function renderPublicationScoreGrid(rows: PublicationScoreRow[], x: number, y: number, contentWidth: number): string {
  const gap = 24;
  const columnWidth = (contentWidth - gap) / 2;
  let svg = '';
  rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell) => {
      const cx = cell.fullWidth ? x : x + cell.column * (columnWidth + gap);
      svg += `<text x="${cx}" y="${y + rowIndex * 27}" font-family="${NOIR_EXPORT_FONT_FAMILY}" font-size="21" font-weight="700" fill="${officialScoreColor(cell.component.kind)}" font-variant-numeric="tabular-nums">${escapeXml(cell.text)}</text>`;
    });
  });
  return svg;
}

function generateRankingPublicationSvg(
  tournament: Tournament,
  standings: OfficialStandingPresentation[],
  options: { section: string; heading: string; metaLead: string; footer: string },
): { svg: string; width: number; height: number } {
  const width = NOIR_EXPORT_LAYOUT.width;
  const margin = NOIR_EXPORT_LAYOUT.margin;
  const font = NOIR_EXPORT_FONT_FAMILY;
  const titleLines = wrapExportText(tournament.title, 32, 2);
  const titleExtra = Math.max(0, titleLines.length - 1) * 48;
  const headerHeight = 228 + titleExtra;
  const rankingHeaderHeight = 68;
  const rankX = margin + 22;
  const avatarX = margin + 52;
  const avatarSize = 64;
  const contentX = margin + 136;
  const totalRight = width - margin;
  const totalColumnWidth = 112;
  const contentRight = totalRight - totalColumnWidth - 28;
  const contentWidth = contentRight - contentX;
  const layouts = standings.map((item) => layoutPublicationRankingRow(item, contentWidth));
  const rowsHeight = layouts.reduce((sum, row) => sum + row.rowHeight, 0);
  const rowsStart = headerHeight + rankingHeaderHeight;
  const height = rowsStart + rowsHeight + NOIR_EXPORT_LAYOUT.footerHeight + 18;
  const date = tournament.date ? new Date(tournament.date) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const venue = getUsefulVenue(tournament.venue);
  const meta = [options.metaLead, dateLabel, venue].filter((value): value is string => Boolean(value)).join('   ·   ');

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${renderNoirExportBackground(width, height)}
    ${renderNoirExportBrandHeader(options.section)}
    ${officialSvgTextLines(titleLines, margin, 160, 48, `font-family="${font}" font-size="46" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-0.8"`)}
    <text x="${margin}" y="${214 + titleExtra}" font-family="${font}" font-size="19" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(meta)}</text>
    <line x1="${margin}" y1="${headerHeight - 8}" x2="${width - margin}" y2="${headerHeight - 8}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1"/>
    <text x="${margin}" y="${headerHeight + 43}" font-family="${font}" font-size="30" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="1.0">${escapeXml(options.heading)}</text>
    <text x="${totalRight}" y="${headerHeight + 43}" text-anchor="end" font-family="${font}" font-size="17" font-weight="700" fill="${NOIR_EXPORT_COLORS.subduedText}">${standings.length} ${russianPlural(standings.length, 'участник', 'участника', 'участников')}</text>`;

  let y = rowsStart;
  layouts.forEach((layout, index) => {
    const item = layout.item;
    const place = item.display_place;
    const accent = place === 1 ? NOIR_EXPORT_COLORS.gold : place === 2 ? NOIR_EXPORT_COLORS.silver : place === 3 ? NOIR_EXPORT_COLORS.bronze : '#8B8580';
    if (index % 2 === 0) {
      svg += `<rect x="${margin}" y="${y}" width="${width - margin * 2}" height="${layout.rowHeight}" fill="${NOIR_EXPORT_COLORS.surfaceSoft}" opacity="0.16"/>`;
    }
    if (place <= 3) svg += `<rect x="${margin}" y="${y + 12}" width="3" height="${layout.rowHeight - 24}" fill="${accent}" opacity="0.85"/>`;
    svg += `<text x="${rankX}" y="${y + 48}" text-anchor="middle" font-family="${font}" font-size="31" font-weight="900" fill="${accent}" font-variant-numeric="tabular-nums">${String(place).padStart(2, '0')}</text>
      ${officialAvatarSvg(item.avatar_data_url, item.display_name, avatarX, y + 17, avatarSize, `publication-ranking-${index}`, place <= 3 ? accent : '#39353B', place <= 3 ? 2 : 1.5)}
      ${officialSvgTextLines(layout.nameLines, contentX, y + layout.nameY, layout.nameLineHeight, `font-family="${font}" font-size="29" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}"`)}
      <text x="${contentX}" y="${y + layout.winsY}" font-family="${font}" font-size="20" font-weight="650" fill="#AAA39A">${escapeXml(formatWinsSummary(item.wins, item.games_played))}</text>
      <text x="${totalRight}" y="${y + 49}" text-anchor="end" font-family="${font}" font-size="42" font-weight="900" fill="${place <= 3 ? accent : NOIR_EXPORT_COLORS.warmText}" font-variant-numeric="tabular-nums">${formatPosterNumber(item.total_points)}</text>
      ${renderPublicationScoreGrid(layout.scoreRows, contentX, y + layout.scoreY, contentWidth)}`;
    if (layout.tieY !== null) {
      svg += officialSvgTextLines(layout.tieLines, contentX, y + layout.tieY, 24, `font-family="${font}" font-size="19" font-weight="600" fill="#746E68"`);
    }
    svg += `<line x1="${margin}" y1="${y + layout.rowHeight}" x2="${width - margin}" y2="${y + layout.rowHeight}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1"/>`;
    y += layout.rowHeight;
  });

  svg += `${renderNoirExportFooter(width, height, options.footer)}
  </svg>`;
  return { svg, width, height };
}

export function generateOfficialWinnersSvg(
  presentation: OfficialTournamentResultsPresentation,
): { svg: string; width: number; height: number } {
  const width = NOIR_EXPORT_LAYOUT.width;
  const height = 1350;
  const margin = NOIR_EXPORT_LAYOUT.margin;
  const font = NOIR_EXPORT_FONT_FAMILY;
  const titleLines = wrapExportText(presentation.tournament.title, 28, 2);
  const titleExtra = Math.max(0, titleLines.length - 1) * 54;
  const championAward = presentation.podium.find((award) => award.place === 1) || presentation.podium[0];
  const secondAward = presentation.podium.find((award) => award.place === 2) || presentation.podium[1];
  const thirdAward = presentation.podium.find((award) => award.place === 3) || presentation.podium[2];
  const championStanding = getStandingForAward(championAward, presentation.standings);
  const secondStanding = getStandingForAward(secondAward, presentation.standings);
  const thirdStanding = getStandingForAward(thirdAward, presentation.standings);
  const championName = championAward?.display_name || championStanding?.display_name || 'Победитель';
  const championNameLines = wrapExportText(championName, 17, 2);
  const championFacts = buildChampionFacts(championStanding, secondStanding, presentation.nominations);
  const date = formatOfficialDate(presentation.tournament.date);
  const venue = getUsefulVenue(presentation.tournament.venue);
  const meta = [date, venue].filter((value): value is string => Boolean(value)).join('   ·   ');
  const heroY = 300 + titleExtra;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${renderNoirExportBackground(width, height)}
    ${renderNoirExportBrandHeader('ПОБЕДИТЕЛИ ТУРНИРА')}
    ${officialSvgTextLines(titleLines, margin, 168, 54, `font-family="${font}" font-size="54" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-1.1"`)}
    <text x="${margin}" y="${258 + titleExtra}" font-family="${font}" font-size="20" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(meta)}</text>
    <line x1="${margin}" y1="${heroY - 18}" x2="${width - margin}" y2="${heroY - 18}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1"/>
    <rect x="${margin}" y="${heroY}" width="${width - margin * 2}" height="430" fill="${NOIR_EXPORT_COLORS.surface}" opacity="0.38"/>
    <rect x="${margin}" y="${heroY}" width="4" height="430" fill="${NOIR_EXPORT_COLORS.gold}"/>
    <text x="${margin + 322}" y="${heroY + 56}" font-family="${font}" font-size="20" font-weight="900" fill="${NOIR_EXPORT_COLORS.gold}" letter-spacing="2.1">ЧЕМПИОН ТУРНИРА</text>
    ${officialAvatarSvg(championAward?.avatar_data_url, championName, margin + 34, heroY + 82, 236, 'winners-champion', NOIR_EXPORT_COLORS.gold, 4)}
    ${officialSvgTextLines(championNameLines, margin + 322, heroY + 132, 58, `font-family="${font}" font-size="58" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-1.0"`)}
    <text x="${width - margin - 24}" y="${heroY + 88}" text-anchor="end" font-family="${font}" font-size="17" font-weight="900" fill="#A28A57" letter-spacing="1.7">ИТОГОВЫЙ БАЛЛ</text>
    <text x="${width - margin - 24}" y="${heroY + 160}" text-anchor="end" font-family="${font}" font-size="66" font-weight="900" fill="${NOIR_EXPORT_COLORS.gold}" font-variant-numeric="tabular-nums">${formatPosterNumber(championAward?.points ?? championStanding?.total_points)}</text>`;

  championFacts.slice(0, 2).forEach((fact, index) => {
    svg += `<text x="${margin + 322}" y="${heroY + 300 + index * 34}" font-family="${font}" font-size="23" font-weight="700" fill="#CDC6BC">${escapeXml(fact)}</text>`;
  });

  const podiumY = heroY + 466;
  const gap = 30;
  const podiumWidth = (width - margin * 2 - gap) / 2;
  const renderPodium = (award: OfficialAwardPresentation | undefined, standing: OfficialStandingPresentation | null, place: 2 | 3, x: number) => {
    const accent = place === 2 ? NOIR_EXPORT_COLORS.silver : NOIR_EXPORT_COLORS.bronze;
    const name = award?.display_name || standing?.display_name || 'Не определено';
    const nameLines = wrapExportText(name, 18, 2);
    return `<rect x="${x}" y="${podiumY}" width="${podiumWidth}" height="240" fill="${NOIR_EXPORT_COLORS.surfaceSoft}" opacity="0.32"/>
      <rect x="${x}" y="${podiumY}" width="${podiumWidth}" height="3" fill="${accent}" opacity="0.9"/>
      ${officialAvatarSvg(award?.avatar_data_url, name, x + 26, podiumY + 54, 104, `winners-${place}`, accent, 2.5)}
      <text x="${x + 154}" y="${podiumY + 48}" font-family="${font}" font-size="17" font-weight="900" fill="${accent}" letter-spacing="1.5">${place === 2 ? 'ВТОРОЕ МЕСТО' : 'ТРЕТЬЕ МЕСТО'}</text>
      ${officialSvgTextLines(nameLines, x + 154, podiumY + 94, 32, `font-family="${font}" font-size="30" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}"`)}
      <text x="${x + podiumWidth - 24}" y="${podiumY + 184}" text-anchor="end" font-family="${font}" font-size="42" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" font-variant-numeric="tabular-nums">${formatPosterNumber(award?.points ?? standing?.total_points)}</text>
      <text x="${x + podiumWidth - 24}" y="${podiumY + 211}" text-anchor="end" font-family="${font}" font-size="13" font-weight="800" fill="${NOIR_EXPORT_COLORS.subduedText}" letter-spacing="1.2">ИТОГ</text>`;
  };

  svg += `${renderPodium(secondAward, secondStanding, 2, margin)}
    ${renderPodium(thirdAward, thirdStanding, 3, margin + podiumWidth + gap)}
    ${renderNoirExportFooter(width, height, '1 · 2 · 3 места')}
  </svg>`;
  return { svg, width, height };
}

export function generateOfficialFinalRankingSvg(
  presentation: OfficialTournamentResultsPresentation,
): { svg: string; width: number; height: number } {
  return generateRankingPublicationSvg(
    presentation.tournament,
    presentation.standings,
    {
      section: 'ИТОГИ ТУРНИРА',
      heading: 'ФИНАЛЬНЫЙ РЕЙТИНГ',
      metaLead: `${presentation.standings.length} ${russianPlural(presentation.standings.length, 'участник', 'участника', 'участников')}`,
      footer: 'Финальный рейтинг',
    },
  );
}

export function generateOfficialAwardsSvg(
  presentation: OfficialTournamentResultsPresentation,
): { svg: string; width: number; height: number } {
  const width = NOIR_EXPORT_LAYOUT.width;
  const margin = NOIR_EXPORT_LAYOUT.margin;
  const font = NOIR_EXPORT_FONT_FAMILY;
  const titleLines = wrapExportText(presentation.tournament.title, 34, 2);
  const titleExtra = Math.max(0, titleLines.length - 1) * 42;
  const headerHeight = 226 + titleExtra;
  const featured = presentation.nominations.find(isMvpAward) || null;
  const others = presentation.nominations.filter((award) => award !== featured);
  const gap = 24;
  const tileWidth = (width - margin * 2 - gap) / 2;
  const featuredLayout = featured ? layoutAwardTile(featured, width - margin * 2, true) : null;
  const otherLayouts = others.map((award) => layoutAwardTile(award, tileWidth));
  const rows: Array<Array<{ award: OfficialAwardPresentation; layout: AwardTileLayout; index: number }>> = [];
  for (let index = 0; index < others.length; index += 2) {
    rows.push([index, index + 1].filter((item) => item < others.length).map((item) => ({ award: others[item], layout: otherLayouts[item], index: item })));
  }
  const rowHeights = rows.map((row) => Math.max(...row.map((item) => item.layout.height)));
  const contentHeight = (featuredLayout?.height || 0)
    + (featuredLayout && rows.length ? 24 : 0)
    + rowHeights.reduce((sum, value) => sum + value, 0)
    + Math.max(0, rows.length - 1) * 22;
  const height = Math.max(980, headerHeight + contentHeight + NOIR_EXPORT_LAYOUT.footerHeight + 42);
  const date = formatOfficialDate(presentation.tournament.date);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${renderNoirExportBackground(width, height)}
    <defs>
      <linearGradient id="mvpWash" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#7B1835" stop-opacity="0.26"/><stop offset="100%" stop-color="#150E12" stop-opacity="0"/></linearGradient>
      <linearGradient id="awardWash" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#5B1329" stop-opacity="0.12"/><stop offset="100%" stop-color="#0A090B" stop-opacity="0"/></linearGradient>
    </defs>
    ${renderNoirExportBrandHeader('НОМИНАЦИИ ТУРНИРА')}
    ${officialSvgTextLines(titleLines, margin, 158, 42, `font-family="${font}" font-size="42" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}" letter-spacing="-0.6"`)}
    <text x="${margin}" y="${210 + titleExtra}" font-family="${font}" font-size="18" font-weight="650" fill="${NOIR_EXPORT_COLORS.mutedText}">${escapeXml(date)}</text>
    <line x1="${margin}" y1="${headerHeight - 8}" x2="${width - margin}" y2="${headerHeight - 8}" stroke="${NOIR_EXPORT_COLORS.divider}" stroke-width="1"/>`;

  let y = headerHeight + 12;
  if (featured && featuredLayout) {
    const innerX = margin + 34;
    svg += `<rect x="${margin}" y="${y}" width="${width - margin * 2}" height="${featuredLayout.height}" fill="url(#mvpWash)"/>
      <rect x="${margin}" y="${y}" width="4" height="${featuredLayout.height}" fill="#A93C5D"/>
      ${officialSvgTextLines(featuredLayout.titleLines, innerX, y + featuredLayout.titleY, 31, `font-family="${font}" font-size="25" font-weight="900" fill="#D6A1AE" letter-spacing="2.2"`)}
      ${officialAvatarSvg(featured.avatar_data_url, featured.participant_id ? featured.display_name : featured.title, innerX, y + featuredLayout.avatarY, featuredLayout.avatarSize, 'publication-award-mvp', '#A95169', 3)}
      ${officialSvgTextLines(featuredLayout.nameLines, margin + featuredLayout.nameX, y + featuredLayout.nameY, featuredLayout.nameLineHeight, `font-family="${font}" font-size="${featuredLayout.nameFontSize}" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}"`)}
      ${renderAwardExplanation(featuredLayout, innerX, y)}`;
    y += featuredLayout.height + (rows.length ? 24 : 0);
  }

  if (!featured && !rows.length) {
    svg += `<text x="${margin}" y="${y + 80}" font-family="${font}" font-size="28" font-weight="800" fill="${NOIR_EXPORT_COLORS.mutedText}">Номинации не присуждены</text>`;
  }

  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex];
    row.forEach((item, col) => {
      const tileX = margin + col * (tileWidth + gap);
      const innerX = tileX + 18;
      const layout = item.layout;
      const award = item.award;
      svg += `<rect x="${tileX}" y="${y}" width="${tileWidth}" height="${rowHeight}" fill="url(#awardWash)"/>
        <rect x="${tileX}" y="${y}" width="${tileWidth}" height="3" fill="${NOIR_EXPORT_COLORS.wineSoft}" opacity="0.9"/>
        ${officialSvgTextLines(layout.titleLines, innerX, y + layout.titleY, 27, `font-family="${font}" font-size="22" font-weight="900" fill="#D6A1AE" letter-spacing="1.2"`)}
        ${officialAvatarSvg(award.avatar_data_url, award.participant_id ? award.display_name : award.title, innerX, y + layout.avatarY, layout.avatarSize, `publication-award-${item.index}`, '#69414D', 2)}
        ${officialSvgTextLines(layout.nameLines, tileX + layout.nameX, y + layout.nameY, layout.nameLineHeight, `font-family="${font}" font-size="${layout.nameFontSize}" font-weight="900" fill="${NOIR_EXPORT_COLORS.warmText}"`)}
        ${renderAwardExplanation(layout, innerX, y)}`;
    });
    y += rowHeight + (rowIndex < rows.length - 1 ? 22 : 0);
  });

  svg += `${renderNoirExportFooter(width, height, 'MVP · ролевые номинации')}
  </svg>`;
  return { svg, width, height };
}
'''
insert_marker = 'export function generateOfficialTournamentResultsSvg('
insert_i = s.find(insert_marker)
if insert_i < 0:
    raise SystemExit('official svg insertion marker missing')
s = s[:insert_i] + publication_helpers + '\n' + s[insert_i:]

page_contract = r'''export interface ExportSvgPage {
  svg: string;
  width: number;
  height: number;
  section: 'winners' | 'ranking' | 'awards' | 'standings' | 'game';
  block_ids: string[];
  label: string;
  file_suffix: string;
}

export function generateOfficialTournamentResultsPages(
  presentation: OfficialTournamentResultsPresentation,
): ExportSvgPage[] {
  const winners = generateOfficialWinnersSvg(presentation);
  const ranking = generateOfficialFinalRankingSvg(presentation);
  const awards = generateOfficialAwardsSvg(presentation);
  return [
    {
      ...winners,
      section: 'winners',
      block_ids: ['podium-1', 'podium-2', 'podium-3'],
      label: 'Победители',
      file_suffix: 'winners',
    },
    {
      ...ranking,
      section: 'ranking',
      block_ids: presentation.standings.map((item) => `ranking-${item.display_place}`),
      label: 'Рейтинг',
      file_suffix: 'final-rating',
    },
    {
      ...awards,
      section: 'awards',
      block_ids: presentation.nominations.map((item) => `award-${item.key}`),
      label: 'Номинации',
      file_suffix: 'awards',
    },
  ];
}

export function generateGameResultsPages(
  tournament: Tournament,
  game: TournamentGame,
  exportRows: GamePlayerExportRow[],
): ExportSvgPage[] {
  const svg = generateGameResultsSvg(tournament, game, exportRows);
  const dimensions = getSvgDimensions(svg);
  return [{
    svg,
    ...dimensions,
    section: 'game',
    block_ids: exportRows.map((row) => `seat-${row.seat_number}`),
    label: `Игра №${game.game_number}`,
    file_suffix: `game-${game.game_number}`,
  }];
}

export function generateStandingsPages(
  tournament: Tournament,
  standings: TournamentStandingItem[],
  completedGamesCount: number,
  totalGamesCount: number,
  avatarDataByParticipant: Record<string, string> = {},
): ExportSvgPage[] {
  const svg = generateStandingsSvg(tournament, standings, completedGamesCount, totalGamesCount, avatarDataByParticipant);
  const dimensions = getSvgDimensions(svg);
  return [{
    svg,
    ...dimensions,
    section: 'standings',
    block_ids: standings.map((item) => `standing-${item.place}`),
    label: 'Промежуточные итоги',
    file_suffix: 'intermediate',
  }];
}'''
s = replace_between(s, 'export interface ExportSvgPage {', 'export function renderSvgToPngBlob(', page_contract)
p.write_text(s, encoding='utf-8')

# Shared preview: semantic assets, generated once; no long-strip archive path.
p = Path('src/components/crm/tournaments/ResultsImageExportModal.tsx')
s = p.read_text(encoding='utf-8')
for line in [
    '  generateGameResultsSvg,\n',
    '  generateOfficialTournamentResultsSvg,\n',
    '  generateStandingsSvg,\n',
    '  getSvgDimensions,\n',
]:
    s = s.replace(line, '')
s = replace_once(
    s,
    "type PreviewPage = {\n  blob: Blob;\n  url: string;\n  fileName: string;\n};\n\ntype ArchiveImage = {\n  blob: Blob;\n  url: string;\n  fileName: string;\n};",
    "type PreviewPage = {\n  blob: Blob;\n  url: string;\n  fileName: string;\n  label: string;\n};",
    'preview types',
)
s = replace_once(
    s,
    "const pageFileName = (baseFileName: string, index: number): string => {\n  const base = baseFileName.replace(/\\.png$/i, '');\n  return `${base}-${String(index + 1).padStart(2, '0')}.png`;\n};",
    "const pageFileName = (baseFileName: string, page: ExportSvgPage, index: number, total: number): string => {\n  if (total === 1) return baseFileName;\n  const base = baseFileName.replace(/\\.png$/i, '');\n  const suffix = page.file_suffix ? `-${page.file_suffix}` : '';\n  return `${base}-${String(index + 1).padStart(2, '0')}${suffix}.png`;\n};",
    'page filename',
)
s = replace_once(
    s,
    "    rendered.push({ blob, url, fileName: pageFileName(baseFileName, index) });",
    "    rendered.push({ blob, url, fileName: pageFileName(baseFileName, page, index, pages.length), label: page.label });",
    'render pages filename',
)
s = s.replace("  const [archive, setArchive] = useState<ArchiveImage | null>(null);\n", '')
s = s.replace("    setArchive(null);\n", '')

prepare_block = r'''  const prepareImage = useCallback(async () => {
    if (!isOpen) return;

    const requestSeq = ++requestSeqRef.current;
    clearPreview();
    setGenerationError(null);
    setActionError(null);
    setLoading(true);

    try {
      let assets: ExportSvgPage[] = [];
      let baseFileName = 'export.png';

      if (exportType === 'official') {
        const [freshTournament, readiness, standingsRes, awardsRes, nominationsRes] = await Promise.all([
          api.getTournament(tournament.id),
          api.getTournamentFinalReadiness(tournament.id),
          api.getTournamentStandings(tournament.id),
          api.getTournamentAwards(tournament.id),
          api.getTournamentNominations(tournament.id),
        ]);
        if (freshTournament.status !== 'completed') {
          throw new Error(
            freshTournament.status === 'correction'
              ? 'Завершите корректировку турнира и повторно зафиксируйте итоги — после этого можно будет сформировать новые изображения.'
              : 'Официальные результаты доступны только после завершения турнира.'
          );
        }
        if (!readiness?.ready) throw new Error('Сначала разрешите все равенства мест и номинаций.');
        const freshStandings = standingsRes.standings || [];
        const avatarDataByParticipant = await loadOfficialAvatarMap(freshStandings);
        const presentation = buildOfficialTournamentResultsPresentation(
          freshTournament,
          freshStandings,
          awardsRes.slots || [],
          new Date(),
          avatarDataByParticipant,
          nominationsRes.nominations || [],
        );
        assets = generateOfficialTournamentResultsPages(presentation);
        baseFileName = getSafeFilenameForOfficial(freshTournament.title, freshTournament.date);
      } else if (exportType === 'game') {
        if (!gameId) throw new Error('Не указан идентификатор игры для экспорта');
        const [protocolRes, standingsRes] = await Promise.all([
          api.getGameProtocol(tournament.id, gameId),
          api.getTournamentStandings(tournament.id),
        ]);
        const gameStandings = standingsRes.standings || [];
        const avatarDataByParticipant = await loadOfficialAvatarMap(gameStandings);
        const exportRows = buildGameExportRows(
          protocolRes.player_results || [],
          gameStandings,
          protocolRes.game.game_number,
          avatarDataByParticipant,
        );
        assets = generateGameResultsPages(tournament, protocolRes.game, exportRows);
        baseFileName = getSafeFilenameForGame(tournament.title, protocolRes.game.game_number);
      } else {
        const standingsRes = await api.getTournamentStandings(tournament.id);
        const currentStandings = standingsRes.standings || [];
        const avatarDataByParticipant = await loadOfficialAvatarMap(currentStandings);
        const completedGames = standingsRes.completed_games_count ?? 0;
        const totalGames = tournament.total_games_count ?? 10;
        assets = generateStandingsPages(
          tournament,
          currentStandings,
          completedGames,
          totalGames,
          avatarDataByParticipant,
        );
        baseFileName = getSafeFilenameForStandings(tournament.title, completedGames);
      }

      if (!assets.length) throw new Error('Экспорт не сформировал ни одного изображения');
      const nextPages = await renderPages(assets, baseFileName);
      const urls = nextPages.map((page) => page.url);

      if (!mountedRef.current || requestSeq !== requestSeqRef.current || !isOpen) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      objectUrlsRef.current = urls;
      setPages(nextPages);
    } catch (err: any) {
      if (!mountedRef.current || requestSeq !== requestSeqRef.current || !isOpen) return;
      setGenerationError(err?.message || 'Ошибка генерации изображения');
    } finally {
      if (mountedRef.current && requestSeq === requestSeqRef.current && isOpen) setLoading(false);
    }
  }, [clearPreview, exportType, gameId, isOpen, tournament]);'''
s = replace_between(s, '  const prepareImage = useCallback(async () => {', '  useEffect(() => {\n    if (!isOpen)', prepare_block)

s = replace_once(
    s,
    "  const subtitle = loading\n    ? 'Формируем читаемые страницы 1080×1350 из актуальных данных…'\n    : pages.length\n      ? `${pages.length} ${pages.length === 1 ? 'страница' : pages.length < 5 ? 'страницы' : 'страниц'} · свайпните для просмотра`\n      : 'Предпросмотр результата';",
    "  const subtitle = loading\n    ? 'Формируем изображения из актуальных данных…'\n    : pages.length\n      ? `${pages.length} ${pages.length === 1 ? 'изображение' : pages.length < 5 ? 'изображения' : 'изображений'} · свайпните для просмотра`\n      : 'Предпросмотр результата';",
    'subtitle',
)
s = s.replace("'Не удалось скачать страницы'", "'Не удалось скачать изображения'")
s = s.replace('aria-label="Предыдущая страница"', 'aria-label="Предыдущее изображение"')
s = s.replace('aria-label="Следующая страница"', 'aria-label="Следующее изображение"')
s = s.replace('alt={`${title}, страница ${index + 1} из ${pages.length}`}', 'alt={`${title}, изображение ${index + 1} из ${pages.length}` }')
s = s.replace('Формируем страницы из актуальных данных…', 'Формируем изображения из актуальных данных…')
s = s.replace('Скачать эту страницу', 'Скачать это изображение')
s = s.replace('Поделиться страницей', 'Поделиться изображением')
s = s.replace('Скачайте все пронумерованные страницы или отправьте текущую страницу отдельно, если системное меню это поддерживает.', 'Скачайте все пронумерованные изображения или отправьте текущее изображение отдельно, если системное меню это поддерживает.')

# Replace center counter with semantic label without redesigning the toolbar.
s = replace_once(
    s,
    '              <strong className="text-[12px] font-black tabular-nums text-text-primary">{activePage + 1} из {pages.length}</strong>',
    '              <div className="min-w-0 text-center">\n                <strong className="block text-[12px] font-black tabular-nums text-text-primary">{activePage + 1} из {pages.length}</strong>\n                <span className="block max-w-[150px] truncate text-[10px] font-semibold text-text-muted">{pages[activePage]?.label}</span>\n              </div>',
    'semantic counter',
)

archive_button = '''                ) : archive ? (\n                  <button type="button" onClick={() => triggerDownload(archive.url, archive.fileName)} className="min-h-[42px] rounded-xl border border-border-soft bg-surface-2 px-3 text-[11px] font-bold text-text-secondary inline-flex items-center justify-center gap-1.5">\n                    <Download className="h-4 w-4" /> Скачать одним файлом\n                  </button>\n                ) : <span />}'''
s = replace_once(s, archive_button, '                ) : <span />}', 'archive current button')
archive_link = '''              {archive && canShareCurrent && !canShareAll ? (\n                <button type="button" onClick={() => triggerDownload(archive.url, archive.fileName)} className="text-[11px] font-semibold text-text-muted underline underline-offset-2">\n                  Скачать архивный длинный PNG одним файлом\n                </button>\n              ) : null}\n'''
s = replace_once(s, archive_link, '', 'archive fallback link')
if 'archive' in s:
    raise SystemExit('archive reference remains in ResultsImageExportModal')
p.write_text(s, encoding='utf-8')

# Seating preview dimensions follow the single 1080x1350 document.
p = Path('src/components/crm/tournaments/SeatingExportModal.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(s, 'renderSvgToPngDataUrl(svg, 1080, 1600)', 'renderSvgToPngDataUrl(svg, 1080, 1350)', 'seating render dimensions')
s = replace_once(s, '(1080×1600 px)', '(1080×1350 px)', 'seating displayed dimensions')
p.write_text(s, encoding='utf-8')

# Focused export contract tests: semantic final 3 assets, single game/intermediate sheets.
p = Path('src/tests/resultExportPublication.test.ts')
s = p.read_text(encoding='utf-8')
new_describe = r'''describe('result export publication assets', () => {
  it('keeps a completed ten-player game on one stable Noir sheet', () => {
    const pages = generateGameResultsPages(tournament, game, gameRows);
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBe(1080);
    expect(pages[0].height).toBeGreaterThan(1350);
    expect(pages[0].block_ids).toEqual(gameRows.map((row) => `seat-${row.seat_number}`));
    expect(pages[0].svg).toContain('ИТОГИ ИГРЫ');
    expect(pages[0].svg).toContain('Компенсация первого убитого');
    expect(pages[0].svg).not.toContain('ПРОДОЛЖЕНИЕ');
    expect(pages[0].svg).not.toContain('NewMafia CRM');
    gameRows.forEach((row) => expect(pages[0].svg).toContain(row.display_name));
  });

  it('keeps the complete intermediate standings on one Noir image', () => {
    const pages = generateStandingsPages(tournament, standings, 6, 10);
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBe(1080);
    expect(pages[0].block_ids).toEqual(standings.map((item) => `standing-${item.place}`));
    expect(pages[0].svg).toContain('ПРОМЕЖУТОЧНЫЕ ИТОГИ');
    expect(pages[0].svg).toContain('После 6 из 10 игр');
    expect(pages[0].svg).not.toContain('ПРОДОЛЖЕНИЕ');
    expect(pages[0].svg).not.toContain('#0F172A');
    standings.forEach((item) => expect(pages[0].svg).toContain(item.display_name));
  });

  it('publishes exactly winners, complete ranking and nominations in that order', () => {
    const presentation = buildOfficialTournamentResultsPresentation(tournament, standings, awardSlots, new Date('2026-08-09T08:00:00Z'), {}, nominations as any);
    const pages = generateOfficialTournamentResultsPages(presentation);
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.section)).toEqual(['winners', 'ranking', 'awards']);
    expect(pages.map((page) => page.label)).toEqual(['Победители', 'Рейтинг', 'Номинации']);
    expect(pages.map((page) => page.file_suffix)).toEqual(['winners', 'final-rating', 'awards']);
    expect(pages.every((page) => page.width === 1080)).toBe(true);
    expect(pages.map((page) => page.svg).join('\n')).not.toContain('ПРОДОЛЖЕНИЕ');

    expect(pages[0].svg).toContain('ПОБЕДИТЕЛИ ТУРНИРА');
    expect(pages[0].svg).toContain('Игрок 1');
    expect(pages[0].svg).toContain('Игрок 2');
    expect(pages[0].svg).toContain('Игрок 3');
    expect(pages[0].svg).not.toContain('ФИНАЛЬНЫЙ РЕЙТИНГ');
    expect(pages[0].svg).not.toContain('НОМИНАЦИИ ТУРНИРА');

    standings.forEach((item) => expect(pages[1].svg).toContain(item.display_name));
    expect(pages[1].block_ids.filter((id) => id.startsWith('ranking-'))).toHaveLength(10);
    expect(pages[1].svg).toContain('ФИНАЛЬНЫЙ РЕЙТИНГ');
    expect(pages[1].svg).not.toContain('MVP ТУРНИРА');

    expect(pages[2].svg).toContain('НОМИНАЦИИ ТУРНИРА');
    expect(pages[2].svg).toContain('MVP ТУРНИРА');
    expect(pages[2].svg).toContain('ЛУЧШИЙ МИРНЫЙ');
    expect(pages[2].svg).toContain('ЛУЧШАЯ МАФИЯ');
    expect(pages[2].svg).toContain('ЛУЧШИЙ ШЕРИФ');
    expect(pages[2].svg).toContain('ЛУЧШИЙ ДОН');
    expect(pages[2].svg).not.toContain('Игровые начисления');
    expect(pages[2].svg).not.toContain('Доп. баллы');
    expect(pages[2].svg).toContain('ПОБЕДИЛ ПО ОЦЕНКЕ СУДЕЙ');
    expect(pages[2].svg).toContain('ЛУЧШЕ ПО БОНУСАМ И ШТРАФАМ');
    expect(pages[2].svg).toContain('Итог бонусов и штрафов');
    expect(pages[2].svg).toContain('Штраф по протоколу');
    expect(pages[2].svg).toContain('ПРИ ПОЛНОМ РАВЕНСТВЕ ·');
    expect(pages[2].svg).toContain('ЛИЧНЫЕ ВСТРЕЧИ 2:1');
    expect(pages[2].svg).not.toMatch(/ГЛАВНОГО СУДЬИ|ЖЕРЕБ|СЛУЧАЙН/i);
  });
});
'''
start = s.find("describe('result export publication pages'")
if start < 0:
    raise SystemExit('result export describe marker missing')
s = s[:start] + new_describe
p.write_text(s, encoding='utf-8')

# Seating export test now protects the Noir contract.
p = Path('src/tests/seatingExport.test.ts')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "    expect(svg).toContain('Цифра — номер места игрока');",
    "    expect(svg).toContain('РАССАДКА ИГРОКОВ');\n    expect(svg).toContain('10 игроков × 10 игр');\n    expect(svg).toContain('2LA NOIRE');\n    expect(svg).not.toContain('NewMafia CRM');\n    expect(svg).not.toContain('#0F172A');\n    expect(svg).not.toContain('#2563EB');",
    'seating style assertions',
)
p.write_text(s, encoding='utf-8')

# StrictMode preview test updated to the semantic 3-image contract.
Path('src/tests/resultsImageExportModal.test.tsx').write_text(r'''/**
 * @vitest-environment jsdom
 */
import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTournament: vi.fn(),
  getTournamentFinalReadiness: vi.fn(),
  getTournamentStandings: vi.fn(),
  getTournamentAwards: vi.fn(),
  getTournamentNominations: vi.fn(),
  buildOfficialTournamentResultsPresentation: vi.fn(),
  generateOfficialTournamentResultsPages: vi.fn(),
  renderSvgToPngBlob: vi.fn(),
  getSafeFilenameForOfficial: vi.fn(),
}));

vi.mock('../lib/api.ts', () => ({
  api: {
    getTournament: mocks.getTournament,
    getTournamentFinalReadiness: mocks.getTournamentFinalReadiness,
    getTournamentStandings: mocks.getTournamentStandings,
    getTournamentAwards: mocks.getTournamentAwards,
    getTournamentNominations: mocks.getTournamentNominations,
    getPlayerAvatar: vi.fn(),
    getGameProtocol: vi.fn(),
  },
}));

vi.mock('../lib/tournamentResultsExport.ts', () => ({
  buildGameExportRows: vi.fn(),
  buildOfficialTournamentResultsPresentation: mocks.buildOfficialTournamentResultsPresentation,
  generateGameResultsPages: vi.fn(),
  generateOfficialTournamentResultsPages: mocks.generateOfficialTournamentResultsPages,
  generateStandingsPages: vi.fn(),
  getSafeFilenameForGame: vi.fn(() => 'game.png'),
  getSafeFilenameForOfficial: mocks.getSafeFilenameForOfficial,
  getSafeFilenameForStandings: vi.fn(() => 'standings.png'),
  renderSvgToPngBlob: mocks.renderSvgToPngBlob,
}));

import { ResultsImageExportModal } from '../components/crm/tournaments/ResultsImageExportModal.tsx';

const tournament = {
  id: 't-strict-mode',
  title: 'Тестовый турнир',
  date: '2026-08-08T18:00:00.000Z',
  venue: 'Тула',
  status: 'completed',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-08T20:00:00.000Z',
} as any;

const assets = [
  { section: 'winners', label: 'Победители', file_suffix: 'winners', block_ids: ['podium-1'], svg: '<svg width="1080" height="1350"></svg>', width: 1080, height: 1350 },
  { section: 'ranking', label: 'Рейтинг', file_suffix: 'final-rating', block_ids: ['ranking-1'], svg: '<svg width="1080" height="1800"></svg>', width: 1080, height: 1800 },
  { section: 'awards', label: 'Номинации', file_suffix: 'awards', block_ids: ['award-mvp'], svg: '<svg width="1080" height="1300"></svg>', width: 1080, height: 1300 },
] as any[];

describe('ResultsImageExportModal semantic official PNG lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let objectUrlIndex = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:official-results-${++objectUrlIndex}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    mocks.getTournament.mockResolvedValue(tournament);
    mocks.getTournamentFinalReadiness.mockResolvedValue({ ready: true });
    mocks.getTournamentStandings.mockResolvedValue({ standings: [], completed_games_count: 10 });
    mocks.getTournamentAwards.mockResolvedValue({ slots: [] });
    mocks.getTournamentNominations.mockResolvedValue({ nominations: [] });
    mocks.buildOfficialTournamentResultsPresentation.mockReturnValue({ tournament, standings: [], podium: [], nominations: [] });
    mocks.generateOfficialTournamentResultsPages.mockReturnValue(assets);
    mocks.renderSvgToPngBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    mocks.getSafeFilenameForOfficial.mockReturnValue('test-official-results-2026-08-08.png');
  });

  afterEach(cleanup);

  it('generates exactly three reusable semantic images under StrictMode', async () => {
    render(
      <StrictMode>
        <ResultsImageExportModal isOpen onClose={() => {}} tournament={tournament} exportType="official" />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId('results-preview-page-1')).toBeTruthy());
    expect(screen.getByText(/3 изображения/)).toBeTruthy();
    expect(screen.getByText('Победители')).toBeTruthy();
    expect(screen.getByText(/01-winners\.png/)).toBeTruthy();
    expect(mocks.generateOfficialTournamentResultsPages).toHaveBeenCalled();
    expect(mocks.renderSvgToPngBlob).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(screen.queryByText(/Скачать одним файлом/)).toBeNull();
  });
});
''', encoding='utf-8')

print('export cleanup patch applied')
