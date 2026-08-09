import fs from 'fs';
import path from 'path';

export interface RepositoryPlayerAvatarAsset {
  player_id: string;
  nickname: string;
  file: string;
  sha256: string;
  width: number;
  height: number;
}

export const CURRENT_TOURNAMENT_AVATAR_ASSETS: RepositoryPlayerAvatarAsset[] = [
  { player_id: 'a20493c8-5f4d-4b52-aa2e-ad3803b4b1c5', nickname: 'Богданчик', file: 'bogdanchik.jpg', sha256: '147f673cf7e84b6683a1a4ef67b95546756912e50772f7e698307dc205149c40', width: 2048, height: 1381 },
  { player_id: '8bfdce84-30af-4feb-a3dd-cc31c8e3962b', nickname: 'Вид', file: 'vid.jpg', sha256: '56454f86ac9f04cf4b5f44f467b566c988037d5370bf903fa7856494cb54fe03', width: 2048, height: 1381 },
  { player_id: '8f1a08a4-885e-4ec0-bddd-6877d664c0d8', nickname: 'Денди', file: 'dendi.jpg', sha256: 'd7397466bff921dc2b64451c8497acda7e9b2ed964950b472b424f0201adde4b', width: 2048, height: 1381 },
  { player_id: '8e805b16-6198-47c5-99db-e9a2679e291f', nickname: 'Джава', file: 'java.jpg', sha256: 'd4a028976aa9a9fdc0c51d4ed8cf0adb57c72e8b0e7f299f7d2721fcad1577e7', width: 2048, height: 1387 },
  { player_id: '470fea5a-d175-48bd-bb59-b7103277bd19', nickname: 'Знак', file: 'znak.jpg', sha256: '2fe5cdeb4c2571fd6fa903c6b36706b19258a784f4600285191df9931a4cdfcc', width: 1700, height: 2048 },
  { player_id: 'b47f10d9-c14a-4aa1-bc3c-9347cacaf28b', nickname: 'Матроскина', file: 'matroskina.jpg', sha256: 'b9098c69e63b6df524b5cb607fa0c5d25b865e564d8a00462a16bc23bc4ad70d', width: 2048, height: 1354 },
  { player_id: 'b53a8fb8-5c34-4a81-9ee2-08b8a40a1f28', nickname: 'Насон', file: 'nason.jpg', sha256: 'b539a85198efaed9d3adb01c01980a7a80b74d1e54ecbc29940b5675e1fcc540', width: 2048, height: 1768 },
  { player_id: '6fdb127a-a1e7-47b0-95eb-96c9b5082811', nickname: 'Пристань', file: 'pristan.jpg', sha256: 'aac89c307d4717a568d29d2ef982fa08280939fbd0a7110d0b28a2d1570842f1', width: 2048, height: 1381 },
  { player_id: '62fef3e1-99d9-4787-be4c-b76cc013a8e3', nickname: 'Спящий', file: 'spyashchiy.jpg', sha256: '59796f046a11d31bcec038626c233dea4ba26c9a360a6094c43cc896ccd27a0f', width: 2048, height: 1380 },
  { player_id: '3e3597f2-f173-4334-ba50-43b1cfb8d151', nickname: 'Фандорин', file: 'fandorin.jpg', sha256: '464c35e221488cf7beefba5e0ff80e7ddb170b31d3bbdba528d8f53f07e601a3', width: 2048, height: 1849 },
];

const byPlayerId = new Map(CURRENT_TOURNAMENT_AVATAR_ASSETS.map((asset) => [asset.player_id, asset]));

export const getRepositoryPlayerAvatarAsset = (playerId: string): RepositoryPlayerAvatarAsset | null =>
  byPlayerId.get(playerId) || null;

export function resolveRepositoryPlayerAvatarPath(playerId: string, rootDir = process.cwd()): string | null {
  const asset = getRepositoryPlayerAvatarAsset(playerId);
  if (!asset) return null;
  const candidates = [
    path.join(rootDir, 'public', 'player-avatars', asset.file),
    path.join(rootDir, 'dist', 'player-avatars', asset.file),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}
