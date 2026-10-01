import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import {
  NOIR_EXPORT_COLORS as C,
  NOIR_EXPORT_LAYOUT,
  renderNoirExportBackground,
  renderNoirExportBrandHeader,
  renderNoirExportFooter,
} from '../../lib/exportNoirTheme.ts';
import type { BlankSeat, EveningSummary, GameBlank, SummaryPlayer } from './clubResultData.ts';

// The club chat pictures (owner, 2026-10-01), in the same noir style as the tournament game blank.

const W = NOIR_EXPORT_LAYOUT.width;
const M = NOIR_EXPORT_LAYOUT.margin;
const ROLE_LABELS: Record<string, string> = { citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' };
const ROLE_COLORS: Record<string, string> = { citizen: '#F87171', sheriff: '#FBBF24', mafia: '#A1A1AA', don: '#C4B5FD' };
const ROLE_BEST: Record<string, string> = { citizen: 'ЛУЧШИЙ МИРНЫЙ', sheriff: 'ЛУЧШИЙ ШЕРИФ', mafia: 'ЛУЧШАЯ МАФИЯ', don: 'ЛУЧШИЙ ДОН' };
const RED = '#E63261';
const BLACK = '#C4B5FD';

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);
const pointsText = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  const text = String(Math.abs(rounded)).replace('.', ',');
  return rounded > 0 ? `+${text}` : rounded < 0 ? `−${text}` : '0';
};

let clipCounter = 0;
function avatar(x: number, y: number, size: number, nickname: string, dataUrl: string | null) {
  const id = `av${clipCounter += 1}`;
  const r = size / 2;
  const letter = esc((nickname.trim()[0] || '?').toUpperCase());
  return `<clipPath id="${id}"><circle cx="${x + r}" cy="${y + r}" r="${r}"/></clipPath>
    <circle cx="${x + r}" cy="${y + r}" r="${r}" fill="url(#monogramGradient)" stroke="${C.wineSoft}" stroke-width="2"/>
    <text x="${x + r}" y="${y + r + size * 0.16}" text-anchor="middle" font-size="${Math.round(size * 0.42)}" font-weight="700" fill="${C.warmText}">${letter}</text>
    ${dataUrl ? `<image href="${dataUrl}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>
    <circle cx="${x + r}" cy="${y + r}" r="${r - 1}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>` : ''}`;
}

function seatEvents(seat: BlankSeat) {
  const events: Array<{ text: string; color: string }> = [];
  if (seat.firstKilled) events.push({ text: 'Первый убитый', color: '#22D3EE' });
  if (seat.bestMoveSeats.length) events.push({ text: `Лучший ход: ${seat.bestMoveSeats.join(', ')}`, color: '#FBBF24' });
  if (seat.fouls) events.push({ text: `Фолы: ${seat.fouls}`, color: C.mutedText });
  if (seat.technicalFouls) events.push({ text: `Техфолы: ${seat.technicalFouls}`, color: '#F87171' });
  if (seat.removed) events.push({ text: 'Удалён', color: '#F87171' });
  return events;
}

export function gameBlankSvg(blank: GameBlank) {
  clipCounter = 0;
  const headerHeight = 268;
  const rowHeight = 112;
  const height = headerHeight + blank.seats.length * rowHeight + 40 + NOIR_EXPORT_LAYOUT.footerHeight;
  const winnerText = blank.winnerTeam === 'red' ? 'ПОБЕДА КРАСНЫХ' : blank.winnerTeam === 'black' ? 'ПОБЕДА ЧЁРНЫХ' : 'ИГРА ЗАВЕРШЕНА';
  const winnerColor = blank.winnerTeam === 'red' ? RED : blank.winnerTeam === 'black' ? BLACK : C.mutedText;
  const subtitle = [clip(blank.eveningTitle, 34), blank.dateLabel].filter(Boolean).join(' · ');

  const rows = blank.seats.map((seat, index) => {
    const y = headerHeight + index * rowHeight;
    const events = seatEvents(seat);
    // One text line with tspans: the renderer places each event after the previous one.
    const eventsSvg = events.length
      ? `<text x="${M + 152}" y="${y + 86}" font-size="21" font-weight="600">${events.map((event, i) => `<tspan${i ? ' dx="26"' : ''} fill="${event.color}">${esc(event.text)}</tspan>`).join('')}</text>`
      : '';
    const roleColor = seat.role ? ROLE_COLORS[seat.role] || C.mutedText : C.mutedText;
    const right = blank.scored && seat.points != null
      ? `<text x="${W - M}" y="${y + 52}" text-anchor="end" font-size="40" font-weight="700" fill="${C.warmText}">${esc(pointsText(seat.points))}</text>
         <text x="${W - M}" y="${y + 80}" text-anchor="end" font-size="15" font-weight="600" letter-spacing="2" fill="${C.subduedText}">БАЛЛЫ</text>`
      : seat.won ? `<text x="${W - M}" y="${y + 58}" text-anchor="end" font-size="22" font-weight="700" letter-spacing="2" fill="#34D399">ПОБЕДА</text>` : '';
    return `<rect x="${M}" y="${y + 6}" width="${W - M * 2}" height="${rowHeight - 12}" rx="20" fill="${seat.won ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.02)'}"/>
      <text x="${M + 22}" y="${y + 62}" font-size="22" font-weight="700" fill="${C.subduedText}">${String(seat.seat).padStart(2, '0')}</text>
      ${avatar(M + 62, y + 20, 72, seat.nickname, seat.avatar)}
      <text x="${M + 152}" y="${y + 50}" font-size="30" font-weight="700" fill="${C.warmText}">${esc(clip(seat.nickname, 22))}${seat.role ? `<tspan dx="18" font-size="18" letter-spacing="2" fill="${roleColor}">${esc((ROLE_LABELS[seat.role] || seat.role).toUpperCase())}</tspan>` : ''}</text>
      ${eventsSvg}
      ${right}`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
  ${renderNoirExportBackground(W, height)}
  ${renderNoirExportBrandHeader('ИТОГИ ИГРЫ')}
  <text x="${M}" y="176" font-size="64" font-weight="700" fill="${C.warmText}">ИГРА №${esc(blank.gameNumber)}</text>
  <text x="${M}" y="222" font-size="24" font-weight="500" fill="${C.mutedText}">${esc(subtitle)}</text>
  <text x="${W - M}" y="168" text-anchor="end" font-size="30" font-weight="700" letter-spacing="1" fill="${winnerColor}">${winnerText}</text>
  ${blank.ppk ? `<text x="${W - M}" y="200" text-anchor="end" font-size="19" font-weight="600" fill="${C.mutedText}">по ППК</text>` : ''}
  ${blank.judge ? `<text x="${W - M}" y="222" text-anchor="end" font-size="21" font-weight="500" fill="${C.mutedText}">Судья · ${esc(clip(blank.judge, 24))}</text>` : ''}
  <line x1="${M}" y1="${headerHeight - 8}" x2="${W - M}" y2="${headerHeight - 8}" stroke="${C.divider}" stroke-width="1"/>
  ${rows}
  ${renderNoirExportFooter(W, height, blank.scored ? 'баллы за игру без Ci' : 'клубная игра')}
</svg>`;
}

function personRow(x: number, y: number, width: number, label: string, person: SummaryPlayer | null, accent: string) {
  if (!person) {
    return `<text x="${x}" y="${y + 30}" font-size="18" font-weight="700" letter-spacing="2" fill="${accent}">${esc(label)}</text>
      <text x="${x}" y="${y + 72}" font-size="24" font-weight="500" fill="${C.subduedText}">—</text>`;
  }
  return `<text x="${x}" y="${y + 30}" font-size="18" font-weight="700" letter-spacing="2" fill="${accent}">${esc(label)}</text>
    ${avatar(x, y + 46, 64, person.nickname, person.avatar)}
    <text x="${x + 80}" y="${y + 74}" font-size="27" font-weight="700" fill="${C.warmText}">${esc(clip(person.nickname, Math.floor((width - 80) / 17)))}</text>
    <text x="${x + 80}" y="${y + 104}" font-size="20" font-weight="600" fill="${C.mutedText}">${esc(`${person.value} ${person.detail}`)}</text>`;
}

export function eveningSummarySvg(summary: EveningSummary) {
  clipCounter = 0;
  const leaders = summary.scored ? summary.bestAverage : summary.mostWins;
  const leadersTitle = summary.scored ? 'ЛУЧШИЙ СРЕДНИЙ БАЛЛ' : 'БОЛЬШЕ ВСЕХ ПОБЕД';
  const secondary = summary.scored ? summary.mostWins : [];
  const top = 340;
  const leadersHeight = 70 + Math.max(1, leaders.length) * 104;
  const secondaryHeight = secondary.length ? 70 + secondary.length * 104 : 0;
  const rolesTop = top + leadersHeight + secondaryHeight + 30;
  const height = rolesTop + 2 * 150 + 40 + NOIR_EXPORT_LAYOUT.footerHeight;
  const medal = [C.gold, C.silver, C.bronze];

  const list = (title: string, items: SummaryPlayer[], y0: number) => `
    <text x="${M}" y="${y0 + 36}" font-size="19" font-weight="700" letter-spacing="3" fill="#D7A0AE">${esc(title)}</text>
    ${items.map((item, index) => {
      const y = y0 + 60 + index * 104;
      return `<rect x="${M}" y="${y}" width="${W - M * 2}" height="92" rx="20" fill="rgba(255,255,255,${index === 0 ? 0.06 : 0.03})"/>
        <text x="${M + 26}" y="${y + 58}" font-size="30" font-weight="700" fill="${medal[index] || C.mutedText}">${index + 1}</text>
        ${avatar(M + 70, y + 12, 68, item.nickname, item.avatar)}
        <text x="${M + 158}" y="${y + 58}" font-size="30" font-weight="700" fill="${C.warmText}">${esc(clip(item.nickname, 24))}</text>
        <text x="${W - M - 26}" y="${y + 50}" text-anchor="end" font-size="34" font-weight="700" fill="${C.warmText}">${esc(item.value)}</text>
        <text x="${W - M - 26}" y="${y + 76}" text-anchor="end" font-size="17" font-weight="600" fill="${C.subduedText}">${esc(item.detail)}</text>`;
    }).join('') || `<text x="${M}" y="${y0 + 100}" font-size="24" fill="${C.subduedText}">—</text>`}`;

  const roleCells = summary.bestByRole.map((entry, index) => {
    const column = index % 2; const row = Math.floor(index / 2);
    const cellWidth = (W - M * 2 - 24) / 2;
    const x = M + column * (cellWidth + 24);
    const y = rolesTop + 50 + row * 150;
    return `<rect x="${x}" y="${y}" width="${cellWidth}" height="136" rx="22" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.07)"/>
      ${personRow(x + 24, y + 4, cellWidth - 48, ROLE_BEST[entry.role], entry.player, ROLE_COLORS[entry.role])}`;
  }).join('');

  const stat = (x: number, label: string, value: string, color: string) => `
    <text x="${x}" y="${top - 84}" font-size="17" font-weight="700" letter-spacing="2" fill="${C.subduedText}">${esc(label)}</text>
    <text x="${x}" y="${top - 40}" font-size="40" font-weight="700" fill="${color}">${esc(value)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
  ${renderNoirExportBackground(W, height)}
  ${renderNoirExportBrandHeader('ИТОГИ ВЕЧЕРА')}
  <text x="${M}" y="168" font-size="52" font-weight="700" fill="${C.warmText}">${esc(clip(summary.eveningTitle, 28))}</text>
  ${summary.dateLabel ? `<text x="${M}" y="208" font-size="24" font-weight="500" fill="${C.mutedText}">${esc(summary.dateLabel)}</text>` : ''}
  ${stat(M, 'ИГР', String(summary.games), C.warmText)}
  ${stat(M + 200, 'КРАСНЫЕ : ЧЁРНЫЕ', `${summary.redWins} : ${summary.blackWins}`, C.warmText)}
  ${stat(M + 560, 'ИГРОКОВ', String(summary.players), C.warmText)}
  ${list(leadersTitle, leaders, top)}
  ${secondary.length ? list('БОЛЬШЕ ВСЕХ ПОБЕД', secondary, top + leadersHeight) : ''}
  <text x="${M}" y="${rolesTop + 30}" font-size="19" font-weight="700" letter-spacing="3" fill="#D7A0AE">ЛУЧШИЕ ПО РОЛЯМ</text>
  ${roleCells}
  ${renderNoirExportFooter(W, height, summary.scored ? 'средний балл = сумма баллов / число игр' : 'клубный вечер')}
</svg>`;
}

const FONT_DIRS = [path.resolve(process.cwd(), 'fonts'), path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../fonts')];
const FONT_FILES = ['Montserrat-Medium.ttf', 'Montserrat-SemiBold.ttf', 'Montserrat-Bold.ttf']
  .map((name) => FONT_DIRS.map((dir) => path.join(dir, name)).find((file) => fs.existsSync(file)))
  .filter((file): file is string => Boolean(file));

export function renderPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: FONT_FILES.length === 0, defaultFontFamily: 'Montserrat', sansSerifFamily: 'Montserrat' },
    fitTo: { mode: 'width', value: W },
  });
  return resvg.render().asPng();
}
