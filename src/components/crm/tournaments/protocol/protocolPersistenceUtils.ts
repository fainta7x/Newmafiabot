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
  _serializedBackup: string | null,
  _protocolStatus: TournamentGameProtocolData['status'],
  _serverUpdatedAt?: string | null
): ProtocolLocalBackup | null => {
  // The server database is canonical. Telegram/WebView localStorage can survive
  // deployments and retain an older tournament draft with a newer client-side
  // timestamp. Automatically replaying that draft over the server can therefore
  // roll corrected scores back. Keep local backups only as an emergency artifact;
  // never apply them automatically over data returned by the server.
  return null;
};
