import { Router } from 'express';
import playerSelfCoreRoutes from './playerSelfCoreRoutes.ts';
import playerEventCalendarRoutes from './playerEventCalendarRoutes.ts';
import playerEveningSlotRoutes from './playerEveningSlotRoutes.ts';
import playerProfileIntegrityRoutes from './playerProfileIntegrityRoutes.ts';
import playerProfilePrivacyRoutes from './playerProfilePrivacyRoutes.ts';
import premiumPlayerProfileRoutes from './premiumPlayerProfileRoutes.ts';
import playerNotificationPreferenceRoutes from './playerNotificationPreferenceRoutes.ts';

const router = Router();
router.use(playerSelfCoreRoutes);
router.use(playerEventCalendarRoutes);
router.use(playerEveningSlotRoutes);
router.use(playerProfileIntegrityRoutes);
router.use(playerProfilePrivacyRoutes);
router.use(premiumPlayerProfileRoutes);
router.use(playerNotificationPreferenceRoutes);

export default router;