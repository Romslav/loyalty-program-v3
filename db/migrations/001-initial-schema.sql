-- ============================================================================
-- LOYALTY PROGRAM PLATFORM v3.0
-- COMPLETE DATABASE SCHEMA
-- 23 Tables across 7 Layers
-- ============================================================================

-- Create Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- LAYER 1: IDENTITY & VERIFICATION
-- ============================================================================

-- 1.1 GUESTS - Global guest profiles (one record per guest)
CREATE TABLE IF NOT EXISTS guests (
    id VARCHAR(255) PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    dateOfBirth DATE,
    telegramId VARCHAR(255),
    source VARCHAR(50) DEFAULT 'web', -- telegram, web, qr, sms
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    isVerified BOOLEAN DEFAULT false,
    language VARCHAR(5) DEFAULT 'ru',
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_guests_phone ON guests(phone);
CREATE INDEX idx_guests_telegramid ON guests(telegramId);
CREATE INDEX idx_guests_createdat ON guests(createdat);

-- 1.2 GUESTCHILDREN - Child profiles for personalization
CREATE TABLE IF NOT EXISTS guestChildren (
    id VARCHAR(255) PRIMARY KEY,
    guestId VARCHAR(255) NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    restaurantId VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    dateOfBirth DATE,
    gender VARCHAR(10), -- M, F, OTHER
    allergies TEXT,
    preferences JSONB DEFAULT '{}',
    addedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_guestChildren_guestId ON guestChildren(guestId);
CREATE INDEX idx_guestChildren_dateOfBirth ON guestChildren(dateOfBirth);

-- 1.3 GUESTRESTAURANTS - Guest-restaurant mapping with balance tracking
CREATE TABLE IF NOT EXISTS guestRestaurants (
    id VARCHAR(255) PRIMARY KEY,
    guestId VARCHAR(255) NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    restaurantId VARCHAR(255) NOT NULL,
    balancePoints INT DEFAULT 0,
    tier VARCHAR(20) DEFAULT 'BRONZE', -- BRONZE, SILVER, GOLD, PLATINUM, VIP
    tierProgression INT DEFAULT 0,
    visitsCount INT DEFAULT 0,
    totalSpentRubles DECIMAL(12,2) DEFAULT 0,
    lastVisitAt TIMESTAMP,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    isActive BOOLEAN DEFAULT true, -- false = FROZEN (inactive 3+ months)
    isBlocked BOOLEAN DEFAULT false, -- manual block (fraud)
    blockReason VARCHAR(255),
    blockedBy VARCHAR(255),
    blockedAt TIMESTAMP,
    UNIQUE(guestId, restaurantId)
);

CREATE INDEX idx_guestRestaurants_restaurantId ON guestRestaurants(restaurantId);
CREATE INDEX idx_guestRestaurants_tier ON guestRestaurants(tier);
CREATE INDEX idx_guestRestaurants_isActive ON guestRestaurants(isActive);
CREATE INDEX idx_guestRestaurants_lastVisitAt ON guestRestaurants(lastVisitAt);
CREATE INDEX idx_guestRestaurants_balancePoints ON guestRestaurants(balancePoints);

-- 1.4 PHONEVERIFICATION - SMS verification tracking
CREATE TABLE IF NOT EXISTS phoneVerification (
    id VARCHAR(255) PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    verificationCode VARCHAR(6) NOT NULL,
    attempts INT DEFAULT 0,
    maxAttempts INT DEFAULT 3,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiresAt TIMESTAMP,
    verified BOOLEAN DEFAULT false,
    verifiedAt TIMESTAMP,
    usedForGuestId VARCHAR(255) REFERENCES guests(id)
);

CREATE INDEX idx_phoneVerification_phone ON phoneVerification(phone);
CREATE INDEX idx_phoneVerification_expiresAt ON phoneVerification(expiresAt);

-- 1.5 CARDIDENTIFIERS - QR codes and 6-digit codes for card access
CREATE TABLE IF NOT EXISTS cardIdentifiers (
    id VARCHAR(255) PRIMARY KEY,
    guestRestaurantId VARCHAR(255) NOT NULL REFERENCES guestRestaurants(id) ON DELETE CASCADE,
    restaurantId VARCHAR(255) NOT NULL,
    qrToken VARCHAR(255) UNIQUE,
    sixDigitCode VARCHAR(6),
    cardType VARCHAR(20) DEFAULT 'DIGITAL', -- PHYSICAL, DIGITAL
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    isActive BOOLEAN DEFAULT true,
    invalidatedByTxId VARCHAR(255),
    invalidatedAt TIMESTAMP,
    updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurantId, sixDigitCode)
);

CREATE INDEX idx_cardIdentifiers_qrToken ON cardIdentifiers(qrToken);
CREATE INDEX idx_cardIdentifiers_sixDigitCode ON cardIdentifiers(sixDigitCode);
CREATE INDEX idx_cardIdentifiers_restaurantId ON cardIdentifiers(restaurantId);
CREATE INDEX idx_cardIdentifiers_isActive ON cardIdentifiers(isActive);

-- ============================================================================
-- LAYER 2: TRANSACTIONS & POINTS
-- ============================================================================

-- 2.1 TRANSACTIONS - All transaction records
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(255) PRIMARY KEY,
    guestRestaurantId VARCHAR(255) NOT NULL REFERENCES guestRestaurants(id),
    restaurantId VARCHAR(255) NOT NULL,
    transactionType VARCHAR(50) NOT NULL, -- SALE, REDEMPTION, MANUALCREDIT, MANUALDEBIT, TIERUPGRADE, EXPIRATION, REFERRALCREDIT
    amountRubles DECIMAL(10,2),
    pointsAwarded INT DEFAULT 0,
    pointsBefore INT DEFAULT 0,
    pointsAfter INT DEFAULT 0,
    tierBefore VARCHAR(20),
    tierAfter VARCHAR(20),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    createdBy VARCHAR(255),
    posId VARCHAR(255),
    cardCodeUsed VARCHAR(6)
);

CREATE INDEX idx_transactions_guestRestaurantId ON transactions(guestRestaurantId);
CREATE INDEX idx_transactions_restaurantId ON transactions(restaurantId);
CREATE INDEX idx_transactions_transactionType ON transactions(transactionType);
CREATE INDEX idx_transactions_createdat ON transactions(createdat);

-- 2.2 TIERUPGRADES - Tier change history
CREATE TABLE IF NOT EXISTS tierUpgrades (
    id VARCHAR(255) PRIMARY KEY,
    guestRestaurantId VARCHAR(255) NOT NULL REFERENCES guestRestaurants(id),
    tierFrom VARCHAR(20),
    tierTo VARCHAR(20),
    balanceAtUpgrade INT,
    triggeredByTransactionId VARCHAR(255) REFERENCES transactions(id),
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    bonusPointsAwarded INT DEFAULT 0
);

CREATE INDEX idx_tierUpgrades_guestRestaurantId ON tierUpgrades(guestRestaurantId);
CREATE INDEX idx_tierUpgrades_createdat ON tierUpgrades(createdat);

-- 2.3 POINTSEXPIRATION - Track expiring points
CREATE TABLE IF NOT EXISTS pointsExpiration (
    id VARCHAR(255) PRIMARY KEY,
    guestRestaurantId VARCHAR(255) NOT NULL REFERENCES guestRestaurants(id),
    pointsAmount INT,
    expiresAt TIMESTAMP,
    expiredAt TIMESTAMP,
    isExpired BOOLEAN DEFAULT false,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pointsExpiration_expiresAt ON pointsExpiration(expiresAt);
CREATE INDEX idx_pointsExpiration_guestRestaurantId ON pointsExpiration(guestRestaurantId);

-- 2.4 MANUALCREDIT - Manual point credit records
CREATE TABLE IF NOT EXISTS manualCredit (
    id VARCHAR(255) PRIMARY KEY,
    guestRestaurantId VARCHAR(255) NOT NULL REFERENCES guestRestaurants(id),
    restaurantId VARCHAR(255) NOT NULL,
    pointsAmount INT NOT NULL,
    reason VARCHAR(255), -- Compensation, Promo, Correction, Other
    comment TEXT,
    createdBy VARCHAR(255) NOT NULL,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sentNotification BOOLEAN DEFAULT false
);

CREATE INDEX idx_manualCredit_guestRestaurantId ON manualCredit(guestRestaurantId);
CREATE INDEX idx_manualCredit_createdat ON manualCredit(createdat);

-- 2.5 REDEMPTIONITEMS - Catalog of items that can be redeemed
CREATE TABLE IF NOT EXISTS redemptionItems (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    pointsCost INT NOT NULL,
    description TEXT,
    imageUrl VARCHAR(500),
    maxRedemptionsPerGuest INT DEFAULT -1, -- -1 = unlimited
    expiresAt TIMESTAMP,
    isActive BOOLEAN DEFAULT true,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_redemptionItems_restaurantId ON redemptionItems(restaurantId);
CREATE INDEX idx_redemptionItems_isActive ON redemptionItems(isActive);

-- ============================================================================
-- LAYER 3: LOYALTY CONFIGURATION
-- ============================================================================

-- 3.1 RESTAURANTS - Restaurant networks
CREATE TABLE IF NOT EXISTS restaurants (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    phone VARCHAR(20),
    email VARCHAR(255),
    logoUrl VARCHAR(500),
    primaryColor VARCHAR(7), -- hex color
    secondaryColor VARCHAR(7),
    systemType VARCHAR(50) DEFAULT 'DISCOUNT', -- DISCOUNT, ACCUMULATION
    subscriptionTier VARCHAR(50) DEFAULT 'FREE', -- FREE, CUSTOM, STANDARD, PRO, ULTIMA
    isActive BOOLEAN DEFAULT true,
    ownerId VARCHAR(255),
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_restaurants_isActive ON restaurants(isActive);
CREATE INDEX idx_restaurants_subscriptionTier ON restaurants(subscriptionTier);
CREATE INDEX idx_restaurants_ownerId ON restaurants(ownerId);

-- 3.2 POINTSOFSALE - Physical locations / PoS terminals
CREATE TABLE IF NOT EXISTS pointsOfSale (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    posType VARCHAR(100), -- iiko, RKeeper, Other
    capacity INT,
    isActive BOOLEAN DEFAULT true,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pointsOfSale_restaurantId ON pointsOfSale(restaurantId);
CREATE INDEX idx_pointsOfSale_isActive ON pointsOfSale(isActive);

-- 3.3 TIERDEFINITIONS - Tier configuration
CREATE TABLE IF NOT EXISTS tierDefinitions (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL, -- BRONZE, SILVER, GOLD, PLATINUM, VIP
    minPoints INT NOT NULL,
    maxPoints INT NOT NULL,
    discountPercent DECIMAL(5,2) NOT NULL, -- 5, 10, 15, 20, 25
    description VARCHAR(255),
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurantId, tier)
);

CREATE INDEX idx_tierDefinitions_restaurantId ON tierDefinitions(restaurantId);

-- 3.4 LOYALTYCUSTOMIZATION - System settings per restaurant
CREATE TABLE IF NOT EXISTS loyaltyCustomization (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
    systemType VARCHAR(50) DEFAULT 'DISCOUNT',
    expirationDays INT DEFAULT 90,
    referralBonusPoints INT DEFAULT 500,
    minPointsForRedemption INT DEFAULT 100,
    maxPointsPerTransaction INT,
    allowedChannels JSONB DEFAULT '["telegram", "web", "qr"]', -- telegram, web, qr, sms
    notificationChannels JSONB DEFAULT '["telegram"]',
    smsNotificationsEnabled BOOLEAN DEFAULT false,
    emailNotificationsEnabled BOOLEAN DEFAULT false,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loyaltyCustomization_restaurantId ON loyaltyCustomization(restaurantId);

-- 3.5 LOYALTYCARDDESIGN - Visual customization
CREATE TABLE IF NOT EXISTS loyaltyCardDesign (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
    backgroundColor VARCHAR(7),
    textColor VARCHAR(7),
    accentColor VARCHAR(7),
    logoUrl VARCHAR(500),
    backgroundImageUrl VARCHAR(500),
    backgroundVideoUrl VARCHAR(500),
    fontFamily VARCHAR(100) DEFAULT 'Arial',
    cornerRadius INT DEFAULT 10,
    showQrCode BOOLEAN DEFAULT true,
    showSixDigitCode BOOLEAN DEFAULT true,
    customCss TEXT,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loyaltyCardDesign_restaurantId ON loyaltyCardDesign(restaurantId);

-- ============================================================================
-- LAYER 4: MARKETING & CAMPAIGNS
-- ============================================================================

-- 4.1 MARKETINGCAMPAIGNS - Promotion rules
CREATE TABLE IF NOT EXISTS marketingCampaigns (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    campaignType VARCHAR(50) NOT NULL, -- WELCOME, TIER_UPGRADE, BIRTHDAY, SEASONAL, REFERRAL, REACTIVATION
    name VARCHAR(255) NOT NULL,
    description TEXT,
    startDate TIMESTAMP,
    endDate TIMESTAMP,
    bonusPoints INT,
    discountPercent DECIMAL(5,2),
    targetTiers JSONB, -- ["BRONZE", "SILVER"]
    budget DECIMAL(10,2),
    spentAmount DECIMAL(10,2) DEFAULT 0,
    isActive BOOLEAN DEFAULT true,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_marketingCampaigns_restaurantId ON marketingCampaigns(restaurantId);
CREATE INDEX idx_marketingCampaigns_isActive ON marketingCampaigns(isActive);
CREATE INDEX idx_marketingCampaigns_endDate ON marketingCampaigns(endDate);

-- 4.2 CAMPAIGNRULES - Specific conditions for campaigns
CREATE TABLE IF NOT EXISTS campaignRules (
    id VARCHAR(255) PRIMARY KEY,
    campaignId VARCHAR(255) NOT NULL REFERENCES marketingCampaigns(id) ON DELETE CASCADE,
    ruleType VARCHAR(100), -- min_purchase, min_points, tier_match, etc
    ruleValue JSONB,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_campaignRules_campaignId ON campaignRules(campaignId);

-- 4.3 REFERRALPROGRAM - Referral tracking
CREATE TABLE IF NOT EXISTS referralProgram (
    id VARCHAR(255) PRIMARY KEY,
    referrerId VARCHAR(255) NOT NULL REFERENCES guests(id),
    referredGuestId VARCHAR(255) NOT NULL REFERENCES guests(id),
    restaurantId VARCHAR(255) NOT NULL,
    bonusPointsAwarded INT DEFAULT 0,
    referredGuestBonusPoints INT DEFAULT 0,
    referredGuestFirstPurchaseDate TIMESTAMP,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_referralProgram_referrerId ON referralProgram(referrerId);
CREATE INDEX idx_referralProgram_restaurantId ON referralProgram(restaurantId);

-- 4.4 GUESTNOTIFICATIONS - Notification history
CREATE TABLE IF NOT EXISTS guestNotifications (
    id VARCHAR(255) PRIMARY KEY,
    guestRestaurantId VARCHAR(255) NOT NULL REFERENCES guestRestaurants(id),
    notificationType VARCHAR(100), -- welcome, tier_upgrade, birthday, campaign, etc
    channel VARCHAR(50), -- telegram, sms, email
    content TEXT NOT NULL,
    sentAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deliveredAt TIMESTAMP,
    readAt TIMESTAMP,
    isDelivered BOOLEAN DEFAULT false
);

CREATE INDEX idx_guestNotifications_guestRestaurantId ON guestNotifications(guestRestaurantId);
CREATE INDEX idx_guestNotifications_sentAt ON guestNotifications(sentAt);
CREATE INDEX idx_guestNotifications_channel ON guestNotifications(channel);

-- ============================================================================
-- LAYER 5: SUBSCRIPTIONS & BILLING
-- ============================================================================

-- 5.1 SUBSCRIPTIONS - Billing records
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
    tier VARCHAR(50) NOT NULL, -- FREE, CUSTOM, STANDARD, PRO, ULTIMA
    monthlyPrice DECIMAL(10,2),
    maxRestaurants INT,
    maxGuests INT,
    features JSONB DEFAULT '[]',
    startDate TIMESTAMP,
    endDate TIMESTAMP,
    isActive BOOLEAN DEFAULT true,
    autoRenew BOOLEAN DEFAULT true,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_tier ON subscriptions(tier);
CREATE INDEX idx_subscriptions_isActive ON subscriptions(isActive);
CREATE INDEX idx_subscriptions_endDate ON subscriptions(endDate);

-- 5.2 SUBSCRIPTIONFEATURES - Feature mapping
CREATE TABLE IF NOT EXISTS subscriptionFeatures (
    id VARCHAR(255) PRIMARY KEY,
    subscriptionId VARCHAR(255) NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    featureName VARCHAR(255) NOT NULL,
    featureValue VARCHAR(255),
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptionFeatures_subscriptionId ON subscriptionFeatures(subscriptionId);

-- 5.3 INVOICES - Billing records
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL REFERENCES restaurants(id),
    subscriptionId VARCHAR(255) NOT NULL REFERENCES subscriptions(id),
    invoiceNumber VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    taxAmount DECIMAL(10,2) DEFAULT 0,
    totalAmount DECIMAL(10,2) NOT NULL,
    period_start DATE,
    period_end DATE,
    dueDate DATE,
    paidAt TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending', -- pending, paid, overdue, cancelled
    paymentMethod VARCHAR(50),
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_restaurantId ON invoices(restaurantId);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_dueDate ON invoices(dueDate);

-- ============================================================================
-- LAYER 6: INTEGRATIONS & WEBHOOKS
-- ============================================================================

-- 6.1 POSINTEGRATIONS - POS system configuration
CREATE TABLE IF NOT EXISTS posIntegrations (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    posSystem VARCHAR(100) NOT NULL, -- iiko, RKeeper, etc
    apiUrl VARCHAR(500),
    apiKey VARCHAR(500),
    apiSecret VARCHAR(500),
    webhookUrl VARCHAR(500),
    lastSyncAt TIMESTAMP,
    isActive BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posIntegrations_restaurantId ON posIntegrations(restaurantId);

-- 6.2 WEBHOOKLOGS - Webhook history
CREATE TABLE IF NOT EXISTS webhookLogs (
    id VARCHAR(255) PRIMARY KEY,
    posIntegrationId VARCHAR(255) REFERENCES posIntegrations(id),
    eventType VARCHAR(100),
    requestPayload JSONB,
    responsePayload JSONB,
    statusCode INT,
    isSuccessful BOOLEAN,
    errorMessage TEXT,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhookLogs_posIntegrationId ON webhookLogs(posIntegrationId);
CREATE INDEX idx_webhookLogs_createdat ON webhookLogs(createdat);

-- 6.3 INTEGRATIONEVENTS - Event tracking
CREATE TABLE IF NOT EXISTS integrationEvents (
    id VARCHAR(255) PRIMARY KEY,
    restaurantId VARCHAR(255) NOT NULL REFERENCES restaurants(id),
    eventType VARCHAR(100),
    eventData JSONB,
    processed BOOLEAN DEFAULT false,
    processedAt TIMESTAMP,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_integrationEvents_restaurantId ON integrationEvents(restaurantId);
CREATE INDEX idx_integrationEvents_processed ON integrationEvents(processed);

-- ============================================================================
-- LAYER 7: SECURITY & AUDIT
-- ============================================================================

-- 7.1 AUDITLOG - Comprehensive audit trail
CREATE TABLE IF NOT EXISTS auditLog (
    id VARCHAR(255) PRIMARY KEY,
    userId VARCHAR(255),
    action VARCHAR(100), -- CREATE, UPDATE, DELETE, TRANSACTION_SALE, etc
    resourceType VARCHAR(100), -- GUEST, RESTAURANT, TRANSACTION, etc
    resourceId VARCHAR(255),
    restaurantId VARCHAR(255),
    oldValue JSONB,
    newValue JSONB,
    ipAddress VARCHAR(45),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'SUCCESS', -- SUCCESS, FAILED, PENDING
    errorInfo TEXT
);

CREATE INDEX idx_auditLog_userId ON auditLog(userId);
CREATE INDEX idx_auditLog_action ON auditLog(action);
CREATE INDEX idx_auditLog_resourceType ON auditLog(resourceType);
CREATE INDEX idx_auditLog_restaurantId ON auditLog(restaurantId);
CREATE INDEX idx_auditLog_timestamp ON auditLog(timestamp);
CREATE INDEX idx_auditLog_status ON auditLog(status);

-- 7.2 USERS - Staff accounts
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    passwordHash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- OWNER, MANAGER, CASHIER, GUEST
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    isActive BOOLEAN DEFAULT true,
    lastLoginAt TIMESTAMP,
    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    twoFactorEnabled BOOLEAN DEFAULT false,
    twoFactorSecret VARCHAR(255)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_isActive ON users(isActive);

-- 7.3 STAFFRESTAURANTS - Staff permissions per restaurant
CREATE TABLE IF NOT EXISTS staffRestaurants (
    id VARCHAR(255) PRIMARY KEY,
    userId VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    restaurantId VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    canCreateCampaigns BOOLEAN DEFAULT false,
    canEditCard BOOLEAN DEFAULT false,
    canConfigurePOS BOOLEAN DEFAULT false,
    canViewAnalytics BOOLEAN DEFAULT false,
    canManageGuests BOOLEAN DEFAULT false,
    canManualCredit BOOLEAN DEFAULT false,
    canManualDebit BOOLEAN DEFAULT false,
    assignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(userId, restaurantId)
);

CREATE INDEX idx_staffRestaurants_userId ON staffRestaurants(userId);
CREATE INDEX idx_staffRestaurants_restaurantId ON staffRestaurants(restaurantId);

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- Active guests per restaurant
CREATE VIEW v_active_guests_per_restaurant AS
SELECT
    r.id,
    r.name,
    COUNT(DISTINCT gr.guestId) as active_guests,
    COUNT(DISTINCT CASE WHEN gr.tier = 'VIP' THEN gr.guestId END) as vip_guests,
    SUM(gr.balancePoints) as total_points,
    AVG(gr.totalSpentRubles) as avg_spent
FROM restaurants r
LEFT JOIN guestRestaurants gr ON r.id = gr.restaurantId AND gr.isActive = true
GROUP BY r.id, r.name;

-- Revenue by subscription tier
CREATE VIEW v_revenue_by_tier AS
SELECT
    s.tier,
    COUNT(DISTINCT s.restaurantId) as restaurant_count,
    SUM(s.monthlyPrice) as monthly_revenue,
    AVG(s.monthlyPrice) as avg_price
FROM subscriptions s
WHERE s.isActive = true
GROUP BY s.tier;

-- Recent transactions
CREATE VIEW v_recent_transactions AS
SELECT
    t.id,
    t.createdat,
    t.transactionType,
    t.amountRubles,
    t.pointsAwarded,
    r.name as restaurant_name,
    gr.tier
FROM transactions t
JOIN guestRestaurants gr ON t.guestRestaurantId = gr.id
JOIN restaurants r ON t.restaurantId = r.id
ORDER BY t.createdat DESC
LIMIT 1000;

-- ============================================================================
-- FUNCTIONS FOR AUTOMATIC UPDATES
-- ============================================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updatedAt = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for guests
CREATE TRIGGER trigger_guests_update
BEFORE UPDATE ON guests
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Trigger for guestRestaurants
CREATE TRIGGER trigger_guestRestaurants_update
BEFORE UPDATE ON guestRestaurants
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

COMMIT;
