import { Router } from 'express';
import playerSelfCoreRoutes from './playerSelfCoreRoutes.ts';
import playerEventCalendarRoutes from './playerEventCalendarRoutes.ts';
import playerProfileIntegrityRoutes from './playerProfileIntegrityRoutes.ts';

const router = Router();
router.use(playerSelfCoreRoutes);
router.use(playerEventCalendarRoutes);
router.use(playerProfileIntegrityRoutes);

export default router;