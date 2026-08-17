import fs from 'node:fs';

const changes = [
  ['src/components/LiveGameEngine/CenterPanel.tsx', '  handleStartZeroNightTimer,\n', ''],
  ['src/components/crm/CommerceAdminCRM.tsx', "import React, { useEffect, useState } from 'react';", "import { useEffect, useState } from 'react';"],
  ['src/components/crm/EveningGameRegistrationDashboard.tsx', "import React, { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';"],
  ['src/components/crm/EveningInviteAudienceManager.tsx', "import React, { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';"],
  ['src/components/crm/EveningRosterSlotEditor.tsx', "import React, { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';"],
  ['src/components/crm/EveningSlotPlannerCard.tsx', "import React, { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';"],
  ['src/components/crm/OrganizerCommandCenter.tsx', '  Clock3, Gamepad2, MessageCircle, RefreshCw, UserCheck, Users,\n', '  Clock3, Gamepad2, MessageCircle, RefreshCw, UserCheck,\n'],
  ['src/components/player/PlayerWalletHub.tsx', 'export default function PlayerWalletHub({\n  data,\n  tokenBalance,', 'export default function PlayerWalletHub({\n  tokenBalance,'],
  ['src/db/mergeMillourtDuplicateMigration.ts', "const norm = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('ru-RU');\n", ''],
  ['src/server/routes/eveningSlotRoutes.ts', "import { Router } from 'express';", "import { Router, type Request, type Response } from 'express';"],
  ['src/server/routes/eveningSlotRoutes.ts', 'const requirePlayer = async (req: any, res: any) => {', 'const requirePlayer = async (req: Request, res: Response) => {'],
  ['src/server/routes/gamesRoutes.ts', "import { getDb } from '../../db/index.ts';", "import { getDb, type DatabaseWrapper } from '../../db/index.ts';"],
  ['src/server/routes/gamesRoutes.ts', 'db.transaction(async (tx: any) =>', 'db.transaction(async (tx: DatabaseWrapper) =>'],
  ['src/server/routes/tournamentsRoutes.ts', 'db.transaction(async (tx: any) =>', 'db.transaction(async (tx: DatabaseWrapper) =>', true],
  ['src/server/routes/playerCareerProfileRoutes.ts', "import { loadCompletedGameSnapshots, type AnalyticsPlayerResult } from '../services/clubGameAnalyticsService.ts';", "import { loadCompletedGameSnapshots } from '../services/clubGameAnalyticsService.ts';"],
  ['src/server/routes/playerInsightsRoutes.ts', "type Role = typeof ROLES[number];\n", ''],
  ['src/server/services/eveningSlotPlanningService.ts', 'db.transaction(async (tx: any) =>', 'db.transaction(async (tx: DatabaseWrapper) =>'],
  ['src/server/services/eveningAnnouncementTrackingService.ts', "import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';\n\ntype Db = any;", "import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';\nimport type { DatabaseWrapper } from '../../db/index.ts';\n\ntype Db = DatabaseWrapper;"],
  ['src/tests/CenterPanelVotingFlow.test.tsx', "import React from 'react';\n", ''],
  ['src/tests/eveningRoster.test.ts', '  updated_at: \'\',\n  ...patch,\n});', "  updated_at: '',\n  ...patch,\n  response_status: patch.response_status ?? 'unanswered',\n});"],
  ['src/tests/seatingExport.test.ts', "      judge_name: 'Судья 1',\n      status:", "      judge_name: 'Судья 1',\n      judge_player_id: null,\n      status:"],
  ['src/tests/tournamentResultsExport.test.ts', "        judge_name: 'Чагин',\n        status:", "        judge_name: 'Чагин',\n        judge_player_id: null,\n        status:"],
  ['src/scripts/createGitCheckpoint.ts', 'export async function runGitCheckpointScript(): Promise<boolean> {', 'export async function runGitCheckpointScript(_options?: { dbPath?: string; targetB64Path?: string }): Promise<boolean> {'],
  ['src/server/routes/playerGameDetailRoutes.ts', '      const bestMoves = (modernBestMoves.length ? modernBestMoves : legacyBestMove).map((move: any) => ({', '      const bestMoves: Array<{ participant_id: string; source: string | null; seat_numbers: number[] }> = (modernBestMoves.length ? modernBestMoves : legacyBestMove).map((move: any) => ({'],
  ['src/server/services/clubGameProtocolService.ts', '    const seats = Array.isArray(move?.seat_numbers) ? move.seat_numbers.map(Number) : [];', '    const seats: number[] = Array.isArray(move?.seat_numbers) ? move.seat_numbers.map(Number) : [];'],
  ['src/server/services/clubGameProtocolService.ts', '  const previousByParticipant = new Map(previousResults.map((result: any) => [String(result.participant_id || \'\'), result]));', "  const previousByParticipant = new Map<string, any>(previousResults.map((result: any) => [String(result.participant_id || ''), result]));"],
];

for (const [file, from, to, all = false] of changes) {
  const before = fs.readFileSync(file, 'utf8');
  if (!before.includes(from)) throw new Error(`Expected text not found in ${file}: ${JSON.stringify(from)}`);
  const after = all ? before.split(from).join(to) : before.replace(from, to);
  fs.writeFileSync(file, after);
  console.log(`updated ${file}`);
}
