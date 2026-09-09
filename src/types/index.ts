export type UserRole = 'motorist' | 'provider' | 'admin';

export type ProviderType = 'STO' | 'INDEPENDENT_MASTER' | 'MOBILE_MASTER';

export type VerificationLevel =
  | 'LEVEL_1_VERIFIED_SERVICE'
  | 'LEVEL_2_VERIFIED_MASTER'
  | 'LEVEL_3_NEW_PROVIDER';

export type ProviderCapability =
  | 'BATTERY'
  | 'AUTO_ELECTRIC'
  | 'DIAGNOSTICS'
  | 'MECHANICAL_MINOR';

export type ServiceMode = 'MOBILE' | 'AT_LOCATION';

export type ServiceCategory =
  | 'electrical_starting'
  | 'battery_jumpstart'
  | 'mobile_mechanic';

export type PricingMode = 'fixed' | 'diagnostic_fee' | 'estimate_range';

export type OrderStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'OFFERS_RECEIVED'
  | 'PROVIDER_SELECTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'PENDING_COMPLETION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED';

export type OfferStatus = 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
