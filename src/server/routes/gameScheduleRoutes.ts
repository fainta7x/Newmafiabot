import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { GameScheduleError, WEEKDAY_NAMES, loadGameSchedule, saveGameSchedule, scheduleTimes } from '../services/gameScheduleSettingsService.ts';

/** CRM «Ещё → Расписание игр»: the day and the time of the regular games. */
const router = Router();
router.use(requireOrganizerAuth);

const view = (schedule: Awaited<ReturnType<typeof loadGameSchedule>>) => ({ ...schedule, weekday_name: WEEKDAY_NAMES[schedule.weekday], times: scheduleTimes(schedule) });
router.get('/', async (req, res) => { try { res.json(view(await loadGameSchedule(req.db))); } catch { res.status(500).json({ error: 'Не удалось загрузить расписание' }); } });
router.put('/', async (req, res) => {
  try {
    const saved = await saveGameSchedule(req.db, req.body);
    res.json({ ...view(saved.schedule), upcoming_on_old_day: saved.upcoming_on_old_day });
  } catch (error) {
    if (error instanceof GameScheduleError) return res.status(error.statusCode).json({ error: error.message });
    res.status(500).json({ error: 'Не удалось сохранить расписание' });
  }
});
export default router;
