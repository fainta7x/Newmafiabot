import { Router } from 'express';
import playerSelfCoreRoutes from './playerSelfCoreRoutes.ts';
import playerEventCalendarRoutes from './playerEventCalendarRoutes.ts';

const router = Router();
router.use(playerSelfCoreRoutes);
router.use(playerEventCalendarRoutes);

export default router;
