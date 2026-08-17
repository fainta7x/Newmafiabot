import type { DatabaseWrapper } from '../db/index.ts';

declare global {
  namespace Express {
    interface Request {
      db?: DatabaseWrapper;
    }
  }
}

export {};
