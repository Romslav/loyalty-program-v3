import express, { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';

const router: Router = express.Router();

// List campaigns
router.get('/', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.query;
    logger.info('Campaigns fetched', { restaurantId });

    // TODO: Implement campaign query
    res.json({
      success: true,
      data: [
        {
          campaignId: 'camp_001',
          name: 'Welcome Bonus',
          type: 'WELCOME',
          bonusPoints: 500,
        },
      ],
    });
  } catch (error) {
    logger.error('Campaign fetch error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch campaigns',
      },
    });
  }
});

// Create campaign
router.post('/', async (req: Request, res: Response) => {
  try {
    const { restaurantId, name, campaignType } = req.body;

    if (!restaurantId || !name || !campaignType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Required fields missing',
        },
      });
    }

    logger.info('Campaign created', { restaurantId, name, campaignType });

    // TODO: Implement campaign creation
    res.json({
      success: true,
      data: {
        campaignId: 'camp_' + Date.now(),
        name,
        created: true,
      },
    });
  } catch (error) {
    logger.error('Campaign creation error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATION_ERROR',
        message: 'Failed to create campaign',
      },
    });
  }
});

export default router;
