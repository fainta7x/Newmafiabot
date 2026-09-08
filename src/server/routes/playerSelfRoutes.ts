import { Router } from 'express';
import playerSelfCoreRoutes from './playerSelfCoreRoutes.ts';
import playerEventCalendarRoutes from './playerEventCalendarRoutes.ts';
import playerProfileIntegrityRoutes from './playerProfileIntegrityRoutes.ts';
import premiumPlayerProfileRoutes from './premiumPlayerProfileRoutes.ts';

const router = Router();
router.use(playerSelfCoreRoutes);
router.use(playerEventCalendarRoutes);
router.use(playerProfileIntegrityRoutes);
router.use(premiumPlayerProfileRoutes);

export default router;