// Identity & Verification Types
export interface IGuestProfile {
  id: string;
  phone: string;
  name: string;
  email?: string;
  dateOfBirth?: Date;
  telegramId?: string;
  source: 'telegram' | 'web' | 'qr' | 'sms';
  isVerified: boolean;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGuestChild {
  id: string;
  guestId: string;
  name: string;
  dateOfBirth: Date;
  gender?: 'M' | 'F' | 'OTHER';
  allergies?: string[];
  preferences?: Record<string, any>;
}

export interface IGuestRestaurant {
  id: string;
  guestId: string;
  restaurantId: string;
  balancePoints: number;
  tier: TierLevel;
  visitsCount: number;
  totalSpentRubles: number;
  lastVisitAt?: Date;
  isActive: boolean;
  isBlocked: boolean;
  blockedReason?: string;
}

export interface ICardIdentifier {
  id: string;
  guestRestaurantId: string;
  qrToken: string;
  sixDigitCode: string;
  cardType: 'PHYSICAL' | 'DIGITAL';
  isActive: boolean;
  createdAt: Date;
  invalidatedAt?: Date;
}

// Transaction Types
export type TransactionType = 'SALE' | 'REDEMPTION' | 'MANUALCREDIT' | 'MANUALDEBIT' | 'TIERUPGRADE' | 'EXPIRATION' | 'REFERRALCREDIT';

export interface ITransaction {
  id: string;
  guestRestaurantId: string;
  restaurantId: string;
  transactionType: TransactionType;
  amountRubles: number;
  pointsAwarded: number;
  pointsBefore: number;
  pointsAfter: number;
  tierBefore: TierLevel;
  tierAfter: TierLevel;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  createdBy?: string;
}

// Tier & Loyalty Types
export type TierLevel = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'VIP';

export interface ITierDefinition {
  id: string;
  restaurantId: string;
  tier: TierLevel;
  minPoints: number;
  maxPoints: number;
  discountPercent: number;
  description?: string;
}

export interface ILoyaltyCustomization {
  id: string;
  restaurantId: string;
  systemType: 'DISCOUNT' | 'ACCUMULATION';
  expirationDays: number;
  referralBonusPoints: number;
  minPointsForRedemption: number;
  maxPointsPerTransaction?: number;
}

// Restaurant & PoS Types
export interface IRestaurant {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  systemType: 'DISCOUNT' | 'ACCUMULATION';
  subscriptionTier: SubscriptionTier;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPointOfSale {
  id: string;
  restaurantId: string;
  name: string;
  address: string;
  phone?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  posType?: string;
  capacity?: number;
  isActive: boolean;
  createdAt: Date;
}

// Marketing & Campaigns
export type CampaignType = 'WELCOME' | 'TIER_UPGRADE' | 'BIRTHDAY' | 'SEASONAL' | 'REFERRAL' | 'REACTIVATION';

export interface IMarketingCampaign {
  id: string;
  restaurantId: string;
  campaignType: CampaignType;
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  bonusPoints?: number;
  discountPercent?: number;
  targetTiers?: TierLevel[];
  budget?: number;
  spentAmount?: number;
  isActive: boolean;
}

// Subscription Types
export type SubscriptionTier = 'FREE' | 'CUSTOM' | 'STANDARD' | 'PRO' | 'ULTIMA';

export interface ISubscription {
  id: string;
  restaurantId: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
  maxRestaurants: number;
  maxGuests: number;
  features: string[];
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  autoRenew: boolean;
}

// User & RBAC
export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'GUEST';

export interface IUser {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  name: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStaffRestaurant {
  userId: string;
  restaurantId: string;
  canCreateCampaigns: boolean;
  canEditCard: boolean;
  canConfigurePOS: boolean;
  canViewAnalytics: boolean;
  assignedAt: Date;
}

// API Response Types
export interface IApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
}

export interface IPaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  timestamp: Date;
}

// Error Types
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400,
    public details?: any,
  ) {
    super(message);
  }
}
