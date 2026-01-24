import express, { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';

const router: Router = express.Router();

// Get subscription
router.get('/:restaurantId', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    logger.info('Subscription fetched', { restaurantId });

    // TODO: Implement subscription query
    res.json({
      success: true,
      data: {
        tier: 'PRO',
        monthlyPrice: 67000,
        maxRestaurants: 5,
        maxGuests: 5000,
      },
    });
  } catch (error) {
    logger.error('Subscription fetch error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch subscription',
      },
    });
  }
});

// Update subscription
router.put('/:restaurantId', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { newTier } = req.body;

    if (!newTier) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TIER',
          message: 'newTier is required',
        },
      });
    }

    logger.info('Subscription updated', { restaurantId, newTier });

    // TODO: Implement subscription upgrade/downgrade logic
    res.json({
      success: true,
      data: {
        message: 'Subscription updated',
        newTier,
      },
    });
  } catch (error) {
    logger.error('Subscription update error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update subscription',
      },
    });
  }
});

export default router;
