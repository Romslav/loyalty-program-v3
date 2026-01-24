import { Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const level = statusCode >= 400 ? 'warn' : 'info';

    logger[level](`${req.method} ${req.path} - ${statusCode} (${duration}ms)`);
  });

  next();
};
