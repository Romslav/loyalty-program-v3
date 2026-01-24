import { Request, Response, NextFunction } from 'express';
import { AppError, IApiResponse } from '@types/index';
import { logger } from '@utils/logger';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  logger.error('Error occurred', {
    path: req.path,
    method: req.method,
    error: err.message,
  });

  if (err instanceof AppError) {
    const response: IApiResponse<null> = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      timestamp: new Date(),
    };
    return res.status(err.statusCode).json(response);
  }

  const response: IApiResponse<null> = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    },
    timestamp: new Date(),
  };
  res.status(500).json(response);
};
