import { query } from '@config/database';
import { logger } from '@utils/logger';
import { IRestaurant, TierLevel } from '@types/index';
import { v4 as uuidv4 } from 'uuid';

export class RestaurantService {
  /**
   * Create new restaurant
   */
  async createRestaurant(
    name: string,
    address: string,
    phone: string,
    systemType: 'DISCOUNT' | 'ACCUMULATION',
    subscriptionTier: string,
    ownerId: string,
  ): Promise<IRestaurant> {
    const restaurantId = `rest_${uuidv4()}`;

    try {
      // 1. Create restaurant
      const result = await query(
        `INSERT INTO restaurants (id, name, address, phone, systemType, subscriptionTier, ownerId, createdat, updatedat, isActive)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), true)
         RETURNING *`,
        [restaurantId, name, address, phone, systemType, subscriptionTier, ownerId],
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to create restaurant');
      }

      const restaurant = result.rows[0];

      // 2. Create tier definitions
      const tiers: Array<[TierLevel, number, number, number]> = [
        ['BRONZE', 0, 5000, 5],
        ['SILVER', 5001, 10000, 10],
        ['GOLD', 10001, 15000, 15],
        ['PLATINUM', 15001, 30000, 20],
        ['VIP', 30001, 999999, 25],
      ];

      for (const [tier, minPoints, maxPoints, discount] of tiers) {
        await query(
          `INSERT INTO tierDefinitions (id, restaurantId, tier, minPoints, maxPoints, discountPercent, createdat, updatedAt)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [uuidv4(), restaurantId, tier, minPoints, maxPoints, discount],
        );
      }

      // 3. Create loyalty customization
      await query(
        `INSERT INTO loyaltyCustomization (id, restaurantId, systemType, expirationDays, referralBonusPoints, createdat, updatedAt)
         VALUES ($1, $2, $3, 90, 500, NOW(), NOW())`,
        [uuidv4(), restaurantId, systemType],
      );

      // 4. Create card design
      await query(
        `INSERT INTO loyaltyCardDesign (id, restaurantId, backgroundColor, textColor, accentColor, createdat, updatedAt)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [uuidv4(), restaurantId, '#FFFFFF', '#000000', '#FF6B6B'],
      );

      // 5. Create subscription
      await query(
        `INSERT INTO subscriptions (id, restaurantId, tier, monthlyPrice, maxRestaurants, maxGuests, isActive, autoRenew, createdat, updatedAt)
         VALUES ($1, $2, $3, 0, 1, 1000, true, true, NOW(), NOW())`,
        [uuidv4(), restaurantId, subscriptionTier],
      );

      logger.info('Restaurant created', { restaurantId, name, systemType, subscriptionTier });

      return restaurant;
    } catch (error) {
      logger.error('Error creating restaurant', { name, error });
      throw error;
    }
  }

  /**
   * Get restaurant details
   */
  async getRestaurant(restaurantId: string): Promise<IRestaurant | null> {
    try {
      const result = await query(
        'SELECT * FROM restaurants WHERE id = $1 AND isActive = true',
        [restaurantId],
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching restaurant', error);
      throw error;
    }
  }

  /**
   * Get all restaurants for owner
   */
  async getRestaurantsByOwner(ownerId: string): Promise<IRestaurant[]> {
    try {
      const result = await query(
        'SELECT * FROM restaurants WHERE ownerId = $1 AND isActive = true ORDER BY createdat DESC',
        [ownerId],
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching restaurants by owner', error);
      throw error;
    }
  }

  /**
   * Get restaurant statistics
   */
  async getRestaurantStats(restaurantId: string): Promise<any> {
    try {
      const result = await query(
        `SELECT 
          COUNT(DISTINCT gr.guestId) as total_guests,
          COUNT(DISTINCT CASE WHEN gr.isActive = true THEN gr.guestId END) as active_guests,
          COUNT(DISTINCT CASE WHEN gr.tier = 'VIP' THEN gr.guestId END) as vip_guests,
          SUM(gr.balancePoints) as total_points,
          AVG(gr.totalSpentRubles) as avg_spent,
          SUM(gr.totalSpentRubles) as total_revenue,
          COUNT(DISTINCT t.id) as total_transactions
         FROM restaurants r
         LEFT JOIN guestRestaurants gr ON r.id = gr.restaurantId
         LEFT JOIN transactions t ON gr.id = t.guestRestaurantId
         WHERE r.id = $1`,
        [restaurantId],
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching restaurant stats', error);
      throw error;
    }
  }
}

export const restaurantService = new RestaurantService();
