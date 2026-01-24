import express, { Express } from 'express';
import dotenv from 'dotenv';
import { logger } from '@utils/logger';
import { errorHandler } from '@middleware/errorHandler';
import { requestLogger } from '@middleware/requestLogger';

// Route imports
import authRoutes from '@layers/1-identity/routes/auth.routes';
import guestRoutes from '@layers/1-identity/routes/guest.routes';
import transactionRoutes from '@layers/2-transactions/routes/transaction.routes';
import restaurantRoutes from '@layers/3-configuration/routes/restaurant.routes';
import campaignRoutes from '@layers/4-marketing/routes/campaign.routes';
import subscriptionRoutes from '@layers/5-subscriptions/routes/subscription.routes';
import integrationRoutes from '@layers/6-integrations/routes/integration.routes';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(requestLogger);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    uptime: process.uptime(),
  });
});

app.get('/api/version', (req, res) => {
  res.json({
    version: '3.0.0',
    name: 'Loyalty Program Platform',
    status: 'Production-Ready',
  });
});

// API Routes - Layer 1: Identity
app.use('/api/auth', authRoutes);
app.use('/api/guests', guestRoutes);

// API Routes - Layer 2: Transactions
app.use('/api/transactions', transactionRoutes);

// API Routes - Layer 3: Configuration
app.use('/api/restaurants', restaurantRoutes);

// API Routes - Layer 4: Marketing
app.use('/api/campaigns', campaignRoutes);

// API Routes - Layer 5: Subscriptions
app.use('/api/subscriptions', subscriptionRoutes);

// API Routes - Layer 6: Integrations
app.use('/api/integrations', integrationRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Error Handler (must be last)
app.use(errorHandler);

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`System Type: ${process.env.SYSTEM_TYPE || 'DISCOUNT'}`);
  });
}

export default app;
