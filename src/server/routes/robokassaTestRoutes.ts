import express, { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId, isTestEnvironmentRequest } from '../auth.ts';
import { loadRobokassaTestConfig } from '../services/robokassaTestAdapter.ts';
import { confirmTestEveningPayment, createTestEveningCheckout, getTestInvoice } from '../services/robokassaTestPaymentService.ts';

export function robokassaTestAvailable(): boolean {
  try { return Boolean(loadRobokassaTestConfig()); } catch { return false; }
}

export function createRobokassaTestRoutes(getTestDb: () => Promise<DatabaseWrapper>) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  router.post('/test/checkout/:participantId', async (req, res) => {
    const playerId = getPlayerSessionId(req);
    if (!playerId) return res.status(401).json({ error: 'Нужно войти в кабинет' });
    if (!isTestEnvironmentRequest(req)) return res.status(403).json({ error: 'Тестовая оплата доступна только в тестовом кабинете' });
    if (!robokassaTestAvailable()) return res.status(503).json({ error: 'Тестовая оплата ещё не настроена' });
    const config = loadRobokassaTestConfig()!;
    const checkout = await createTestEveningCheckout(await getTestDb(), config, playerId, String(req.params.participantId));
    return res.json(checkout);
  });

  router.get('/test/invoices/:id', async (req, res) => {
    const playerId = getPlayerSessionId(req);
    if (!playerId) return res.status(401).json({ error: 'Нужно войти в кабинет' });
    if (!isTestEnvironmentRequest(req)) return res.status(403).json({ error: 'Нужен тестовый кабинет' });
    const invoice = await getTestInvoice(await getTestDb(), playerId, String(req.params.id));
    if (!invoice) return res.status(404).json({ error: 'Тестовый платёж не найден' });
    return res.json({ test: true, ...invoice });
  });

  // Provider calls have no player cookie. Never select the DB from a cookie or request parameter here.
  router.post('/result', express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 }), async (req, res) => {
    if (!req.is('application/x-www-form-urlencoded')) return res.status(415).type('text').send('Form required');
    if (!req.body || Object.values(req.body).some(value => typeof value !== 'string')) return res.status(400).type('text').send('Invalid parameters');
    if (!robokassaTestAvailable()) return res.status(503).type('text').send('Test payment unavailable');
    const ack = await confirmTestEveningPayment(await getTestDb(), loadRobokassaTestConfig()!, req.body);
    if (!ack) return res.status(400).type('text').send('Invalid test payment');
    return res.type('text').send(ack);
  });

  for (const outcome of ['success', 'fail']) {
    router.get(`/${outcome}`, (req, res) => {
      const id = typeof req.query.InvId === 'string' && /^[1-9][0-9]{0,14}$/.test(req.query.InvId) ? req.query.InvId : '';
      // Both redirects only reopen the wallet. Only the signed ResultURL confirms the payment.
      return res.redirect(303, `/player/wallet?robokassa_test_return=${outcome}${id ? `&robokassa_test_invoice=${id}` : ''}`);
    });
  }
  return router;
}
