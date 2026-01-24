import express, { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';

const router: Router = express.Router();

// Guest registration
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { phone, name, restaurantId, source } = req.body;
    
    // Validation
    if (!phone || !name || !restaurantId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'phone, name, and restaurantId are required',
        },
      });
    }

    logger.info('Guest registration initiated', { phone, restaurantId, source });

    // TODO: Implement actual registration logic
    res.json({
      success: true,
      data: {
        guestId: 'guest_' + Date.now(),
        message: 'Registration initiated',
      },
    });
  } catch (error) {
    logger.error('Registration error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_ERROR',
        message: 'Failed to register guest',
      },
    });
  }
});

// SMS verification
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CODE',
          message: 'phone and code are required',
        },
      });
    }

    logger.info('SMS verification attempted', { phone });

    // TODO: Implement verification logic
    res.json({
      success: true,
      data: {
        verified: true,
        message: 'Phone verified',
      },
    });
  } catch (error) {
    logger.error('Verification error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: 'Verification failed',
      },
    });
  }
});

export default router;
