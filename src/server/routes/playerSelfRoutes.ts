import { Router } from 'express';
import legacyPlayerSelfRoutes from './playerSelfRoutesLegacy.ts';
import playerEventCalendarRoutes from './playerEventCalendarRoutes.ts';

const router = Router();
router.use(legacyPlayerSelfRoutes);
router.use(playerEventCalendarRoutes);

export default router;
