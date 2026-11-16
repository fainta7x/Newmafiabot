import { Router, type Request, type Response, type NextFunction } from 'express';
import { getPlayerSessionId, type AuthenticatedRequest } from '../auth.ts';
import { DailySudokuError, loadDailySudoku, moveDailySudoku, startDailySudoku } from '../services/dailySudokuService.ts';
const router = Router();
const handle = (work: (req: AuthenticatedRequest, id: string) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  try {
    const id = getPlayerSessionId(req as AuthenticatedRequest);
    if (!id) return res.status(401).json({ error: 'Нужен профиль игрока' });
    return res.json(await work(req as AuthenticatedRequest, String(id)));
  } catch (error) { if (error instanceof DailySudokuError) return res.status(error.status).json({ error: error.message }); next(error); }
};
router.get('/daily-sudoku', handle((req, id) => loadDailySudoku(req.db!, id)));
router.post('/daily-sudoku/start', handle((req, id) => startDailySudoku(req.db!, id, req.body || {})));
router.post('/daily-sudoku/move', handle((req, id) => moveDailySudoku(req.db!, id, req.body || {})));
export default router;
