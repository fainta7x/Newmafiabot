from pathlib import Path

PATH = Path('src/lib/tournamentResultsExport.ts')
text = PATH.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
"""export interface OfficialNominationReason {
  category: string | null;
  decisive_criterion: Exclude<OfficialNominationComparison['decisive_criterion'], null | 'exact_tie'>;
  headline: string;
  games_in_role: number | null;
  points: number;
  additional_points: number;
  role_wins: number;
  head_to_head_label: string | null;
  show_metrics: boolean;
}
""",
"""export interface OfficialNominationReason {
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
""",
'extend nomination reason',
)

replace_once(
"""  let headline = 'ЛУЧШИЙ РЕЗУЛЬТАТ';
  let headToHeadLabel: string | null = null;
  if (criterion === 'points') {
    headline = `ЛУЧШИЙ РЕЗУЛЬТАТ · БАЛЛЫ ${formatPosterNumber(candidate.points)}`;
  } else if (criterion === 'additional_points') {
    headline = `РАВЕНСТВО ПО БАЛЛАМ · ДОП. БАЛЛЫ ${formatPosterNumber(candidate.additional_points)}`;
  } else if (criterion === 'role_wins') {
    headline = `РАВЕНСТВО ПО БАЛЛАМ И ДОПАМ · ${nominationRoleWinLabel(result.category, candidate.role_wins)}`;
  } else if (criterion === 'head_to_head') {
    const scores = result.comparison.head_to_head_scores || {};
    const winnerScore = scores[candidate.participant_id] || 0;
    const finalStage = [...result.comparison.stages].reverse().find((stage) => stage.criterion === 'head_to_head');
    const opponentScores = (finalStage?.candidate_ids || [])
      .filter((id) => id !== candidate.participant_id)
      .map((id) => scores[id] || 0);
    headToHeadLabel = opponentScores.length === 1
      ? `${winnerScore}:${opponentScores[0]}`
      : `${winnerScore} ${russianPlural(winnerScore, 'победа', 'победы', 'побед')}`;
    headline = `ЛИЧНОЕ СРАВНЕНИЕ · ${headToHeadLabel}`;
  }
""",
"""  let headline = 'ЛУЧШАЯ ОЦЕНКА СУДЕЙ';
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
""",
'human nomination headline',
)

replace_once(
"""    points: Number(candidate.points || 0),
    additional_points: Number(candidate.additional_points || 0),
    role_wins: Number(candidate.role_wins || 0),
""",
"""    points: Number(candidate.points || 0),
    additional_points: Number(candidate.additional_points || 0),
    protocol_bonus: Number(candidate.protocol_bonus || 0),
    best_move_points: Number(candidate.best_move_points || 0),
    role_wins: Number(candidate.role_wins || 0),
""",
'pass nomination breakdown',
)

replace_once(
"""  const accent = place === 2 ? '#BFC3C9' : '#B77951';
  const number = `0${place}`;
  const name = award?.display_name || 'Не определено';
""",
"""  const accent = place === 2 ? '#BFC3C9' : '#B77951';
  const name = award?.display_name || 'Не определено';
""",
'remove secondary numeral variable',
)

replace_once(
"""  return `<g>
    <text x="${x}" y="${y + 96}" font-family="${officialSvgFont}" font-size="94" font-weight="900" fill="${accent}" opacity="0.16" letter-spacing="-4">${number}</text>
    ${officialAvatarSvg(award?.avatar_data_url, name, x + layout.avatarOffsetX, y + 24, layout.avatarSize, `podium-${place}`, accent, 2.5)}
""",
"""  return `<g>
    ${officialAvatarSvg(award?.avatar_data_url, name, x + layout.avatarOffsetX, y + 24, layout.avatarSize, `podium-${place}`, accent, 2.5)}
""",
'remove secondary podium numerals',
)

replace_once(
"""interface AwardTileLayout {
  titleLines: string[];
  nameLines: string[];
  reasonLines: string[];
  metricLayout: OfficialScoreLayout | null;
  gamesLabel: string | null;
  titleY: number;
  avatarY: number;
  nameY: number;
  reasonY: number;
  gamesY: number | null;
  metricsY: number | null;
  height: number;
""",
"""interface AwardTileLayout {
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
""",
'award layout breakdown fields',
)

replace_once(
"""const nominationMetricComponents = (reason: OfficialNominationReason | null | undefined): OfficialScoreComponent[] => {
  if (!reason?.show_metrics) return [];
  const items: OfficialScoreComponent[] = [];
  const push = (kind: OfficialScoreKind, label: string, value: number) => {
    const rounded = roundOfficial(value);
    items.push({ kind, label, value: rounded, tone: 'bonus', show_plus: false });
  };
  push('judge', 'Баллы', reason.points);
  push('protocol', 'Доп. баллы', reason.additional_points);
  if ((reason.category === 'best_sheriff' || reason.category === 'best_don') && reason.decisive_criterion !== 'points' && reason.decisive_criterion !== 'additional_points') {
    push('wins', 'Победы в роли', reason.role_wins);
  }
  return items;
};
""",
"""const nominationMetricComponents = (reason: OfficialNominationReason | null | undefined): OfficialScoreComponent[] => {
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
""",
'human nomination metrics',
)

replace_once(
"""  const metricComponents = nominationMetricComponents(reason);
  const metricLayout = metricComponents.length
    ? layoutOfficialScoreComponents(metricComponents, width - (featured ? 68 : 36), { fontSize: 22, lineHeight: 30, columnGap: 18 })
    : null;
  const metricsY = metricLayout ? cursor + 38 : null;
  if (metricLayout && metricsY) cursor = metricsY + Math.max(0, metricLayout.lines.length - 1) * metricLayout.lineHeight;

  const height = Math.max(featured ? 190 : 166, cursor + 30);
  return {
    titleLines,
    nameLines,
    reasonLines,
    metricLayout,
    gamesLabel,
""",
"""  const metricComponents = nominationMetricComponents(reason);
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
""",
'layout award metric breakdown',
)

replace_once(
"""    gamesY,
    metricsY,
    height,
""",
"""    gamesY,
    metricsY,
    breakdownY,
    height,
""",
'return award breakdown y',
)

replace_once(
"""  if (layout.metricLayout && layout.metricsY) {
    svg += officialScoreComponentsSvg(layout.metricLayout, x, y + layout.metricsY);
  }
  return svg;
}

export function generateOfficialTournamentResultsSvg(
""",
"""  if (layout.metricLayout && layout.metricsY) {
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
""",
'insert stable ranking grid',
)

replace_once(
"""  const scoreX = margin + 184;
  const scoreMaxX = width - margin;
  const scoreWidth = scoreMaxX - scoreX;
  const rankingLayouts = presentation.standings.map((item) => {
    const components = getOfficialScoreComponents(item);
    const scoreLayout = layoutOfficialScoreComponents(components, scoreWidth);
    const tieBreakStats = buildTieBreakStats(item);
    const tieLines = tieBreakStats.length ? wrapExportText(tieBreakStats.join(' · '), 66, 3) : [];
    const scoreStartOffset = 140;
    const scoreLastBaseline = scoreLayout.lines.length
      ? scoreStartOffset + (scoreLayout.lines.length - 1) * scoreLayout.lineHeight
      : 0;
    const tieStartOffset = tieLines.length
      ? (scoreLayout.lines.length ? scoreLastBaseline + 44 : scoreStartOffset)
      : 0;
    const tieLastBaseline = tieLines.length ? tieStartOffset + (tieLines.length - 1) * 31 : 0;
    const contentBottom = tieLines.length
      ? tieLastBaseline + 20
      : scoreLayout.lines.length
        ? scoreLastBaseline + 24
        : 118;
    const rowHeight = Math.max(168, contentBottom + 34);
    return { item, scoreLayout, tieLines, rowHeight, scoreStartOffset, tieStartOffset };
  });
""",
"""  const rankingRankCenterX = margin + 32;
  const rankingAvatarX = margin + 78;
  const rankingAvatarSize = 82;
  const rankingContentX = rankingAvatarX + rankingAvatarSize + 24;
  const rankingTotalRight = width - margin;
  const rankingTotalColumnWidth = 118;
  const rankingContentRight = rankingTotalRight - rankingTotalColumnWidth - 24;
  const rankingContentWidth = rankingContentRight - rankingContentX;
  const rankingLayouts = presentation.standings.map((item) => layoutOfficialRankingRow(item, rankingContentWidth));
""",
'replace ranking layout calculation',
)

replace_once(
"""    <circle cx="218" cy="${y + 204}" r="170" fill="#D9B35F" opacity="0.07" filter="url(#championGlow)"/>
    <text x="${width - margin}" y="${y + championHeight - 26}" text-anchor="end" font-family="${officialSvgFont}" font-size="340" font-weight="900" fill="#D9B35F" opacity="0.045" letter-spacing="-24">01</text>
    <text x="${championInfoX}" y="${y + 54}" font-family="${officialSvgFont}" font-size="22" font-weight="900" fill="${gold}" letter-spacing="2.4">ЧЕМПИОН ТУРНИРА</text>
""",
"""    <circle cx="218" cy="${y + 204}" r="170" fill="#D9B35F" opacity="0.07" filter="url(#championGlow)"/>
    <text x="${championInfoX}" y="${y + 54}" font-family="${officialSvgFont}" font-size="22" font-weight="900" fill="${gold}" letter-spacing="2.4">ЧЕМПИОН ТУРНИРА</text>
""",
'remove champion decorative 01',
)

replace_once(
"""  rankingLayouts.forEach((layout, index) => {
    const { item, scoreLayout, tieLines, rowHeight, scoreStartOffset, tieStartOffset } = layout;
    const rowY = y;
    const accent = item.display_place === 1 ? gold : item.display_place === 2 ? silver : item.display_place === 3 ? bronze : '#8B8580';
    const name = wrapExportText(item.display_name, 24, 1)[0];
    if (item.display_place <= 3) {
      svg += `<rect x="${margin}" y="${rowY + 18}" width="4" height="${rowHeight - 36}" fill="${accent}" opacity="0.82"/>`;
    }
    svg += `<line x1="${margin}" y1="${rowY}" x2="${width - margin}" y2="${rowY}" stroke="rgba(255,255,255,0.085)" stroke-width="1"/>
      <text x="${margin + 32}" y="${rowY + 73}" text-anchor="middle" font-family="${officialSvgFont}" font-size="40" font-weight="900" fill="${accent}" font-variant-numeric="tabular-nums">${String(item.display_place).padStart(2, '0')}</text>
      ${officialAvatarSvg(item.avatar_data_url, item.display_name, margin + 78, rowY + 26, 82, `standing-${index}`, item.display_place <= 3 ? accent : '#39353B', item.display_place <= 3 ? 2.5 : 1.5)}
      <text x="${scoreX}" y="${rowY + 56}" font-family="${officialSvgFont}" font-size="36" font-weight="900" fill="${warmWhite}">${escapeXml(name)}</text>
      <text x="${scoreX}" y="${rowY + 96}" font-family="${officialSvgFont}" font-size="27" font-weight="650" fill="#AAA39A">${escapeXml(formatWinsSummary(item.wins, item.games_played))}</text>
      <text x="${width - margin}" y="${rowY + 66}" text-anchor="end" font-family="${officialSvgFont}" font-size="50" font-weight="900" fill="${item.display_place <= 3 ? accent : warmWhite}" font-variant-numeric="tabular-nums">${formatPosterNumber(item.total_points)}</text>
      ${officialScoreComponentsSvg(scoreLayout, scoreX, rowY + scoreStartOffset)}`;

    if (tieLines.length) {
      svg += officialSvgTextLines(tieLines, scoreX, rowY + tieStartOffset, 31, `font-family="${officialSvgFont}" font-size="23" font-weight="600" fill="#746E68"`);
    }
    y += rowHeight;
  });
""",
"""  rankingLayouts.forEach((layout, index) => {
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
""",
'render stable ranking grid',
)

# Signed numeric values in score layouts should use tabular numerals consistently.
replace_once(
"""      svg += `<text x="${cx}" y="${y + lineIndex * layout.lineHeight}" font-family="${officialSvgFont}" font-size="${layout.fontSize}" font-weight="650" fill="${officialScoreColor(item.kind)}">${escapeXml(item.text)}</text>`;
""",
"""      svg += `<text x="${cx}" y="${y + lineIndex * layout.lineHeight}" font-family="${officialSvgFont}" font-size="${layout.fontSize}" font-weight="650" fill="${officialScoreColor(item.kind)}" font-variant-numeric="tabular-nums">${escapeXml(item.text)}</text>`;
""",
'tabular score numerals',
)

PATH.write_text(text, encoding='utf-8')
print('patched', PATH)
