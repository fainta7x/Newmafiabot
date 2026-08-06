import type {
  PlayerResultData,
  TournamentGameProtocolData
} from '../../../../lib/api';

export interface ProtocolLocalBackup {
  updatedAt: string;
  protocol: TournamentGameProtocolData;
  playerResults: PlayerResultData[];
}

export const getProtocolBackupKey = (gameId: string): string =>
  `tournament_protocol_backup_${gameId}`;

export const findUnclassifiedTechFouls = (
  playerResults: PlayerResultData[]
): Record<string, number> => {
  const unclassified: Record<string, number> = {};

  playerResults.forEach((player) => {
    const total = player.technical_fouls || 0;
    const classified =
      (player.minor_technical_fouls || 0) +
      (player.major_technical_fouls || 0);

    if (total > classified) {
      unclassified[player.participant_id] = total;
    }
  });

  return unclassified;
};

export const hasUnclassifiedTechFouls = (
  playerResults: PlayerResultData[]
): boolean =>
  playerResults.some(
    (player) =>
      (player.technical_fouls || 0) >
      (player.minor_technical_fouls || 0) +
        (player.major_technical_fouls || 0)
  );

export const serializeProtocolLocalBackup = (
  protocol: TournamentGameProtocolData,
  playerResults: PlayerResultData[],
  updatedAt = new Date().toISOString()
): string =>
  JSON.stringify({
    updatedAt,
    protocol,
    playerResults
  });

export const serializeBlockedProtocolBackup = (
  protocol: TournamentGameProtocolData,
  playerResults: PlayerResultData[],
  timestamp = new Date().toISOString()
): string =>
  JSON.stringify({
    protocol,
    player_results: playerResults,
    timestamp,
    version: '1.0'
  });

export const parseRestorableProtocolBackup = (
  serializedBackup: string | null,
  protocolStatus: TournamentGameProtocolData['status'],
  serverUpdatedAt?: string | null
): ProtocolLocalBackup | null => {
  if (!serializedBackup || protocolStatus !== 'draft') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(serializedBackup);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const backup = parsed as Partial<ProtocolLocalBackup>;
    if (
      typeof backup.updatedAt !== 'string' ||
      !backup.protocol ||
      !Array.isArray(backup.playerResults)
    ) {
      return null;
    }

    const backupTimestamp = new Date(backup.updatedAt).getTime();
    const serverTimestamp = new Date(serverUpdatedAt || 0).getTime();

    if (!(backupTimestamp > serverTimestamp)) {
      return null;
    }

    return backup as ProtocolLocalBackup;
  } catch {
    return null;
  }
};
