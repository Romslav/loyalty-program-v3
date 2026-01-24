import { query } from '@config/database';
import { logger } from '@utils/logger';
import { IGuestProfile, IGuestRestaurant } from '@types/index';
import { v4 as uuidv4 } from 'uuid';

export class GuestService {
  /**
   * Register a new guest
   */
  async registerGuest(
    phone: string,
    name: string,
    restaurantId: string,
    source: 'telegram' | 'web' | 'qr' | 'sms',
    email?: string,
    dateOfBirth?: Date,
  ): Promise<IGuestRestaurant> {
    const guestId = `guest_${uuidv4()}`;
    const guestRestaurantId = `gr_${uuidv4()}`;

    try {
      // 1. Check if guest already exists
      const existingGuest = await query('SELECT id FROM guests WHERE phone = $1', [phone]);

      let realGuestId: string;
      if (existingGuest.rows.length > 0) {
        realGuestId = existingGuest.rows[0].id;
        logger.info('Guest already exists', { phone });
      } else {
        // 2. Create guest profile
        await query(
          `INSERT INTO guests (id, phone, name, email, dateOfBirth, source, isVerified, createdat, updatedat, language)
           VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW(), 'ru')`,
          [guestId, phone, name, email, dateOfBirth, source],
        );
        realGuestId = guestId;
        logger.info('Guest registered', { guestId, phone, source });
      }

      // 3. Create guest-restaurant mapping
      const guestRestaurant = await query(
        `INSERT INTO guestRestaurants (id, guestId, restaurantId, balancePoints, tier, createdat, updatedat, isActive)
         VALUES ($1, $2, $3, 0, 'BRONZE', NOW(), NOW(), true)
         ON CONFLICT (guestId, restaurantId) DO UPDATE SET isActive = true, updatedat = NOW()
         RETURNING *`,
        [guestRestaurantId, realGuestId, restaurantId],
      );

      if (guestRestaurant.rows.length === 0) {
        throw new Error('Failed to create guest-restaurant mapping');
      }

      const grRecord = guestRestaurant.rows[0];

      // 4. Generate card codes
      await this.generateCardCodes(grRecord.id, restaurantId);

      logger.info('Guest-restaurant registration completed', {
        realGuestId,
        guestRestaurantId: grRecord.id,
        restaurantId,
      });

      return grRecord;
    } catch (error) {
      logger.error('Error registering guest', { phone, error });
      throw error;
    }
  }

  /**
   * Get guest profile
   */
  async getGuestProfile(guestId: string): Promise<IGuestProfile | null> {
    try {
      const result = await query('SELECT * FROM guests WHERE id = $1', [guestId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching guest profile', error);
      throw error;
    }
  }

  /**
   * Get guest balance in specific restaurant
   */
  async getGuestBalance(
    guestRestaurantId: string,
  ): Promise<{
    balancePoints: number;
    tier: string;
    visitsCount: number;
    lastVisitAt: Date | null;
  } | null> {
    try {
      const result = await query(
        `SELECT balancePoints, tier, visitsCount, lastVisitAt FROM guestRestaurants WHERE id = $1`,
        [guestRestaurantId],
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching guest balance', error);
      throw error;
    }
  }

  /**
   * Find guest by phone
   */
  async findGuestByPhone(phone: string): Promise<IGuestProfile | null> {
    try {
      const result = await query('SELECT * FROM guests WHERE phone = $1', [phone]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding guest by phone', error);
      throw error;
    }
  }

  /**
   * Get guest-restaurant records (for multi-network view)
   */
  async getGuestRestaurants(guestId: string): Promise<IGuestRestaurant[]> {
    try {
      const result = await query(
        `SELECT gr.*, r.name as restaurantName FROM guestRestaurants gr
         JOIN restaurants r ON gr.restaurantId = r.id
         WHERE gr.guestId = $1 AND gr.isActive = true
         ORDER BY gr.lastVisitAt DESC`,
        [guestId],
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching guest restaurants', error);
      throw error;
    }
  }

  /**
   * Freeze guest account (inactive for 3+ months)
   */
  async freezeInactiveGuests(): Promise<number> {
    try {
      const result = await query(
        `UPDATE guestRestaurants 
         SET isActive = false 
         WHERE isActive = true AND lastVisitAt < NOW() - INTERVAL '3 months'
         RETURNING id`,
      );
      logger.info('Froze inactive guests', { count: result.rows.length });
      return result.rows.length;
    } catch (error) {
      logger.error('Error freezing inactive guests', error);
      throw error;
    }
  }

  /**
   * Reactivate guest on next purchase
   */
  async reactivateGuest(guestRestaurantId: string): Promise<void> {
    try {
      await query(
        `UPDATE guestRestaurants SET isActive = true WHERE id = $1`,
        [guestRestaurantId],
      );
    } catch (error) {
      logger.error('Error reactivating guest', error);
      throw error;
    }
  }

  /**
   * Block guest (fraud)
   */
  async blockGuest(
    guestRestaurantId: string,
    reason: string,
    blockedBy: string,
  ): Promise<void> {
    try {
      await query(
        `UPDATE guestRestaurants 
         SET isBlocked = true, blockReason = $1, blockedBy = $2, blockedAt = NOW()
         WHERE id = $3`,
        [reason, blockedBy, guestRestaurantId],
      );
      logger.warn('Guest blocked', { guestRestaurantId, reason, blockedBy });
    } catch (error) {
      logger.error('Error blocking guest', error);
      throw error;
    }
  }

  /**
   * Generate QR code and 6-digit code for guest
   */
  private async generateCardCodes(guestRestaurantId: string, restaurantId: string): Promise<void> {
    try {
      const qrToken = `qr_${uuidv4()}`;
      const sixDigitCode = Math.floor(100000 + Math.random() * 900000).toString();

      await query(
        `INSERT INTO cardIdentifiers (id, guestRestaurantId, restaurantId, qrToken, sixDigitCode, isActive, createdat)
         VALUES ($1, $2, $3, $4, $5, true, NOW())`,
        [uuidv4(), guestRestaurantId, restaurantId, qrToken, sixDigitCode],
      );

      logger.debug('Card codes generated', { guestRestaurantId, sixDigitCode });
    } catch (error) {
      logger.error('Error generating card codes', error);
      throw error;
    }
  }
}

export const guestService = new GuestService();
