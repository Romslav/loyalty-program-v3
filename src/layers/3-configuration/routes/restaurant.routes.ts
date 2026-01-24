import express, { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';

const router: Router = express.Router();

// Get all restaurants
router.get('/', async (req: Request, res: Response) => {
  try {
    logger.info('Restaurants list fetched');

    // TODO: Implement database query
    res.json({
      success: true,
      data: [
        {
          restaurantId: 'rest_001',
          name: 'Mia Pizza',
          systemType: 'DISCOUNT',
          subscriptionTier: 'PRO',
          isActive: true,
        },
      ],
    });
  } catch (error) {
    logger.error('Restaurants fetch error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch restaurants',
      },
    });
  }
});

// Create restaurant (OWNER only)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, address, systemType } = req.body;

    if (!name || !systemType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'name and systemType are required',
        },
      });
    }

    logger.info('Restaurant created', { name, systemType });

    // TODO: Implement restaurant creation
    // - Validate system type (DISCOUNT/ACCUMULATION)
    // - Create tier definitions
    // - Create customization record
    // - Create card design
    // - Audit log

    res.json({
      success: true,
      data: {
        restaurantId: 'rest_' + Date.now(),
        name,
        systemType,
        created: true,
      },
    });
  } catch (error) {
    logger.error('Restaurant creation error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATION_ERROR',
        message: 'Failed to create restaurant',
      },
    });
  }
});

export default router;
