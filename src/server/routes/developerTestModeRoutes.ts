import { createHash, randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Response } from 'express';
import type { AuthenticatedRequest } from '../auth.ts';

const router = Router();
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

const SCENARIOS = [
  { id: 'empty', label: 'Пустая сессия', phase: 'setup', detail: 'Без игровых событий. Проверка оболочки и переходов.' },
  { id: 'day-speech', label: 'Дневная речь', phase: 'day', detail: 'Контракт для проверки речи и дневных контролов.' },
  { id: 'voting', label: 'Голосование', phase: 'voting', detail: 'Контракт для проверки номинаций и голосования.' },
  { id: 'night', label: 'Ночь', phase: 'night', detail: 'Контракт для проверки ночной фазы и статусов.' },
  { id: 'closeout', label: 'Завершение', phase: 'closeout', detail: 'Контракт для проверки завершения и итоговых экранов.' },
] as const;

type ScenarioId = typeof SCENARIOS[number]['id'];

type TestSession = {
  id: string;
  label: string;
  scenario: ScenarioId;
  phase: string;
  created_at: string;
  expires_at: string;
  storage: 'memory-only';
  production_writes: false;
};

const sessions = new Map<string, TestSession>();

function organizerCredential(req: AuthenticatedRequest): string | null {
  const cookie = req.cookies?.organizer_token;
  if (typeof cookie === 'string' && cookie) return cookie;
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const header = req.headers['x-organizer-token'];
  return typeof header === 'string' && header ? header : null;
}

function strictOrganizer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'ORGANIZER') {
    return res.status(401).json({ error: 'Тестовый режим доступен только организатору' });
  }
  if (!organizerCredential(req)) {
    return res.status(401).json({ error: 'Не найдена активная сессия организатора' });
  }
  return next();
}

function sessionKey(req: AuthenticatedRequest): string {
  return createHash('sha256').update(organizerCredential(req) || '').digest('hex');
}

function activeSession(req: AuthenticatedRequest): TestSession | null {
  const key = sessionKey(req);
  const session = sessions.get(key) || null;
  if (!session) return null;
  if (Date.parse(session.expires_at) <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  return session;
}

const safety = {
  storage: 'memory-only',
  production_writes: false,
  database_mutations: false,
  real_evening_mutations: false,
  ttl_minutes: SESSION_TTL_MS / 60_000,
};

router.use(strictOrganizer);

router.get('/session', (req: AuthenticatedRequest, res) => {
  res.json({ active: activeSession(req), scenarios: SCENARIOS, safety });
});

router.post('/session', (req: AuthenticatedRequest, res) => {
  const scenario = String(req.body?.scenario || '').trim() as ScenarioId;
  const contract = SCENARIOS.find((item) => item.id === scenario);
  if (!contract) return res.status(400).json({ error: 'Неизвестный тестовый сценарий' });

  const now = new Date();
  const session: TestSession = {
    id: randomUUID(),
    label: '[TEST] Сессия организатора',
    scenario,
    phase: contract.phase,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    storage: 'memory-only',
    production_writes: false,
  };
  sessions.set(sessionKey(req), session);
  res.status(201).json({ active: session, scenarios: SCENARIOS, safety });
});

router.delete('/session', (req: AuthenticatedRequest, res) => {
  const current = activeSession(req);
  const requestedId = String(req.body?.session_id || '').trim();
  if (!current) return res.status(404).json({ error: 'Активная тестовая сессия не найдена' });
  if (!requestedId || requestedId !== current.id) {
    return res.status(409).json({ error: 'Для сброса требуется идентификатор активной тестовой сессии' });
  }
  sessions.delete(sessionKey(req));
  return res.status(204).end();
});

export default router;
