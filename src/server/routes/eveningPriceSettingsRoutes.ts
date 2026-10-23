import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { loadPriceSettings, savePriceSettings } from '../services/eveningPriceSettingsService.ts';
const router = Router();
router.use(requireOrganizerAuth);
router.get('/', async (req, res) => { try { res.json(await loadPriceSettings(req.db)); } catch { res.status(500).json({ error: 'Не удалось загрузить цены' }); } });
router.put('/', async (req, res) => { try { res.json(await savePriceSettings(req.db, req.body)); } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Не удалось сохранить цены' }); } });
export default router;
