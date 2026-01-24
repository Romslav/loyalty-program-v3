import express, { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';

const router: Router = express.Router();

// Get guest profile
router.get('/:guestId', async (req: Request, res: Response) => {
  try {
    const { guestId } = req.params;
    logger.info('Guest profile fetched', { guestId });

    // TODO: Implement database query
    res.json({
      success: true,
      data: {
        guestId,
        name: 'John Doe',
        phone: '+79998887766',
        message: 'Profile retrieved',
      },
    });
  } catch (error) {
    logger.error('Profile fetch error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch profile',
      },
    });
  }
});

// Get guest balance
router.get('/:guestId/balance', async (req: Request, res: Response) => {
  try {
    const { guestId } = req.params;
    const { restaurantId } = req.query;

    logger.info('Balance fetched', { guestId, restaurantId });

    // TODO: Implement balance query
    res.json({
      success: true,
      data: {
        guestId,
        balancePoints: 5250,
        tier: 'SILVER',
        message: 'Balance retrieved',
      },
    });
  } catch (error) {
    logger.error('Balance fetch error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BALANCE_ERROR',
        message: 'Failed to fetch balance',
      },
    });
  }
});

export default router;
