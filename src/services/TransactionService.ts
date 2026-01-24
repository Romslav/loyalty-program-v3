import { query } from '@config/database';
import { logger } from '@utils/logger';
import { ITransaction, TransactionType, TierLevel } from '@types/index';
import { v4 as uuidv4 } from 'uuid';

export class TransactionService {
  /**
   * Create a SALE transaction with point calculation
   * Formula: pointsAwarded = amountRubles + (amountRubles × discountPercent / 100)
   */
  async createSaleTransaction(
    guestRestaurantId: string,
    restaurantId: string,
    amountRubles: number,
    cardCodeUsed?: string,
  ): Promise<ITransaction> {
    const txId = `tx_${uuidv4()}`;

    try {
      // 1. Get guest current state
      const guestResult = await query(
        `SELECT balancePoints, tier FROM guestRestaurants WHERE id = $1`,
        [guestRestaurantId],
      );

      if (guestResult.rows.length === 0) {
        throw new Error('Guest not found');
      }

      const { balancePoints: pointsBefore, tier: tierBefore } = guestResult.rows[0];

      // 2. Get tier definition for discount
      const tierResult = await query(
        `SELECT discountPercent FROM tierDefinitions WHERE restaurantId = $1 AND tier = $2`,
        [restaurantId, tierBefore],
      );

      const discountPercent = tierResult.rows[0]?.discountPercent || 5;

      // 3. Calculate points
      const pointsAwarded = Math.floor(amountRubles + (amountRubles * discountPercent) / 100);
      const pointsAfter = pointsBefore + pointsAwarded;

      // 4. Determine new tier
      const tierResult2 = await query(
        `SELECT tier FROM tierDefinitions 
         WHERE restaurantId = $1 AND minPoints <= $2 AND maxPoints > $2 
         ORDER BY minPoints DESC LIMIT 1`,
        [restaurantId, pointsAfter],
      );

      const tierAfter: TierLevel = tierResult2.rows[0]?.tier || tierBefore;

      // 5. Create transaction record
      await query(
        `INSERT INTO transactions 
        (id, guestRestaurantId, restaurantId, transactionType, amountRubles, pointsAwarded, 
         pointsBefore, pointsAfter, tierBefore, tierAfter, cardCodeUsed, createdat)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          txId,
          guestRestaurantId,
          restaurantId,
          'SALE',
          amountRubles,
          pointsAwarded,
          pointsBefore,
          pointsAfter,
          tierBefore,
          tierAfter,
          cardCodeUsed,
        ],
      );

      // 6. Update guest balance and tier
      await query(
        `UPDATE guestRestaurants SET balancePoints = $1, tier = $2, lastVisitAt = NOW(), visitsCount = visitsCount + 1, totalSpentRubles = totalSpentRubles + $3 
         WHERE id = $4`,
        [pointsAfter, tierAfter, amountRubles, guestRestaurantId],
      );

      // 7. Handle tier upgrade
      if (tierAfter !== tierBefore) {
        await query(
          `INSERT INTO tierUpgrades (id, guestRestaurantId, tierFrom, tierTo, balanceAtUpgrade, triggeredByTransactionId, createdat)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [uuidv4(), guestRestaurantId, tierBefore, tierAfter, pointsAfter, txId],
        );
      }

      // 8. Regenerate card codes
      await this.regenerateCardCodes(guestRestaurantId);

      logger.info('SALE transaction created', {
        transactionId: txId,
        guestRestaurantId,
        amountRubles,
        pointsAwarded,
        tierBefore,
        tierAfter,
      });

      return {
        id: txId,
        guestRestaurantId,
        restaurantId,
        transactionType: 'SALE',
        amountRubles,
        pointsAwarded,
        pointsBefore,
        pointsAfter,
        tierBefore,
        tierAfter,
        createdAt: new Date(),
      };
    } catch (error) {
      logger.error('Error creating SALE transaction', { guestRestaurantId, error });
      throw error;
    }
  }

  /**
   * Create MANUALCREDIT transaction (admin operation)
   */
  async createManualCredit(
    guestRestaurantId: string,
    restaurantId: string,
    pointsAmount: number,
    reason: string,
    createdBy: string,
    comment?: string,
  ): Promise<ITransaction> {
    const txId = `tx_${uuidv4()}`;

    try {
      // 1. Get guest current state
      const guestResult = await query(
        `SELECT balancePoints, tier FROM guestRestaurants WHERE id = $1`,
        [guestRestaurantId],
      );

      const { balancePoints: pointsBefore, tier: tierBefore } = guestResult.rows[0];
      const pointsAfter = pointsBefore + pointsAmount;

      // 2. Determine new tier
      const tierResult = await query(
        `SELECT tier FROM tierDefinitions 
         WHERE restaurantId = $1 AND minPoints <= $2 AND maxPoints > $2 
         ORDER BY minPoints DESC LIMIT 1`,
        [restaurantId, pointsAfter],
      );

      const tierAfter: TierLevel = tierResult.rows[0]?.tier || tierBefore;

      // 3. Create transaction
      await query(
        `INSERT INTO transactions 
        (id, guestRestaurantId, restaurantId, transactionType, pointsAwarded, pointsBefore, pointsAfter, tierBefore, tierAfter, createdBy, createdat, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)`,
        [txId, guestRestaurantId, restaurantId, 'MANUALCREDIT', pointsAmount, pointsBefore, pointsAfter, tierBefore, tierAfter, createdBy, comment],
      );

      // 4. Update guest
      await query(
        `UPDATE guestRestaurants SET balancePoints = $1, tier = $2 WHERE id = $3`,
        [pointsAfter, tierAfter, guestRestaurantId],
      );

      // 5. Create manual credit record
      await query(
        `INSERT INTO manualCredit (id, guestRestaurantId, restaurantId, pointsAmount, reason, comment, createdBy, createdat)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [uuidv4(), guestRestaurantId, restaurantId, pointsAmount, reason, comment, createdBy],
      );

      // 6. Regenerate card codes
      await this.regenerateCardCodes(guestRestaurantId);

      logger.info('MANUALCREDIT transaction created', {
        transactionId: txId,
        guestRestaurantId,
        pointsAmount,
        reason,
      });

      return {
        id: txId,
        guestRestaurantId,
        restaurantId,
        transactionType: 'MANUALCREDIT',
        pointsAwarded: pointsAmount,
        pointsBefore,
        pointsAfter,
        tierBefore,
        tierAfter,
        description: comment,
        createdAt: new Date(),
        createdBy,
      };
    } catch (error) {
      logger.error('Error creating MANUALCREDIT transaction', error);
      throw error;
    }
  }

  /**
   * Get transaction history for a guest
   */
  async getTransactionHistory(
    guestRestaurantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ transactions: ITransaction[]; total: number }> {
    try {
      const result = await query(
        `SELECT * FROM transactions 
         WHERE guestRestaurantId = $1 
         ORDER BY createdat DESC 
         LIMIT $2 OFFSET $3`,
        [guestRestaurantId, limit, offset],
      );

      const countResult = await query(
        `SELECT COUNT(*) as total FROM transactions WHERE guestRestaurantId = $1`,
        [guestRestaurantId],
      );

      return {
        transactions: result.rows,
        total: parseInt(countResult.rows[0].total),
      };
    } catch (error) {
      logger.error('Error fetching transaction history', error);
      throw error;
    }
  }

  /**
   * Regenerate QR code and 6-digit code after transaction
   */
  private async regenerateCardCodes(guestRestaurantId: string): Promise<void> {
    try {
      const newQrToken = `qr_${uuidv4()}`;
      const newSixDigitCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Invalidate old codes
      await query(
        `UPDATE cardIdentifiers SET isActive = false, invalidatedAt = NOW() 
         WHERE guestRestaurantId = $1 AND isActive = true`,
        [guestRestaurantId],
      );

      // Create new codes
      const grResult = await query(
        `SELECT restaurantId FROM guestRestaurants WHERE id = $1`,
        [guestRestaurantId],
      );

      if (grResult.rows.length === 0) return;

      const restaurantId = grResult.rows[0].restaurantId;

      await query(
        `INSERT INTO cardIdentifiers (id, guestRestaurantId, restaurantId, qrToken, sixDigitCode, isActive, createdat)
         VALUES ($1, $2, $3, $4, $5, true, NOW())`,
        [uuidv4(), guestRestaurantId, restaurantId, newQrToken, newSixDigitCode],
      );

      logger.debug('Card codes regenerated', { guestRestaurantId });
    } catch (error) {
      logger.error('Error regenerating card codes', error);
      // Don't throw - regeneration failure shouldn't block transaction
    }
  }
}

export const transactionService = new TransactionService();
