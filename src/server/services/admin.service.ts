import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  users,
  providers,
  providerAvailability,
  providerCapabilities,
  serviceRequests,
  orders,
} from '../../db/schema/index';
import { NotFoundError, ValidationError } from '../errors';

export interface MarketplaceMetrics {
  activeRequestsCount: number;
  activeOrdersCount: number;
  completedOrdersCount: number;
  totalGmvTiyn: number;
  onlineProvidersCount: number;
  totalProvidersCount: number;
  totalCustomersCount: number;
}

export interface ProviderAdminItem {
  id: string;
  userId: string;
  businessName: string;
  providerType: string;
  verificationLevel: string;
  rating: number;
  completedJobs: number;
  isOnline: boolean;
  isBlocked: boolean;
  phone: string;
  capabilities: string[];
  createdAt: Date;
}

export interface UpdateProviderVerificationInput {
  verificationLevel?: 'LEVEL_1_VERIFIED_SERVICE' | 'LEVEL_2_VERIFIED_MASTER' | 'LEVEL_3_NEW_PROVIDER';
  isBlocked?: boolean;
}

export interface OrderAdminItem {
  id: string;
  requestId: string;
  status: string;
  agreedPricingMode: string;
  agreedAmountTiyn: number | null;
  finalAmountTiyn: number | null;
  category: string;
  customerPhone: string;
  providerBusinessName: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AdminService {
  /**
   * Aggregates real-time marketplace metrics across Astana.
   */
  static async getMarketplaceMetrics(): Promise<MarketplaceMetrics> {
    // 1. Active Requests
    const [activeReqs] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(serviceRequests)
      .where(inArray(serviceRequests.status, ['PUBLISHED', 'OFFERS_RECEIVED']));

    // 2. Active Orders
    const [activeOrds] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(orders)
      .where(
        inArray(orders.status, [
          'PROVIDER_SELECTED',
          'EN_ROUTE',
          'ARRIVED',
          'IN_PROGRESS',
        ])
      );

    // 3. Completed Orders & GMV
    const [completedOrds] = await db
      .select({
        count: sql<number>`cast(count(*) as integer)`,
        totalGmv: sql<number>`cast(coalesce(sum(${orders.finalAmountTiyn}), 0) as integer)`,
      })
      .from(orders)
      .where(eq(orders.status, 'COMPLETED'));

    // 4. Online Providers
    const [onlineProvs] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(providerAvailability)
      .where(eq(providerAvailability.isOnline, true));

    // 5. Total Providers
    const [totalProvs] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(providers);

    // 6. Total Customers
    const [totalCusts] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(users)
      .where(sql`'motorist' = ANY(${users.roles})`);

    return {
      activeRequestsCount: activeReqs?.count || 0,
      activeOrdersCount: activeOrds?.count || 0,
      completedOrdersCount: completedOrds?.count || 0,
      totalGmvTiyn: completedOrds?.totalGmv || 0,
      onlineProvidersCount: onlineProvs?.count || 0,
      totalProvidersCount: totalProvs?.count || 0,
      totalCustomersCount: totalCusts?.count || 0,
    };
  }

  /**
   * Lists providers with relational user, availability, and capability details.
   */
  static async listProviders(filters?: {
    verificationLevel?: string;
    isOnline?: boolean;
    isBlocked?: boolean;
  }): Promise<ProviderAdminItem[]> {
    const rawProviders = await db
      .select({
        id: providers.id,
        userId: providers.userId,
        businessName: providers.businessName,
        providerType: providers.providerType,
        verificationLevel: providers.verificationLevel,
        rating: providers.rating,
        completedJobs: providers.completedJobs,
        createdAt: providers.createdAt,
        phone: users.phone,
        isBlocked: users.isBlocked,
        isOnline: providerAvailability.isOnline,
      })
      .from(providers)
      .innerJoin(users, eq(providers.userId, users.id))
      .leftJoin(
        providerAvailability,
        eq(providers.id, providerAvailability.providerId)
      )
      .orderBy(desc(providers.createdAt));

    // Fetch capabilities
    const allCaps = await db
      .select({
        providerId: providerCapabilities.providerId,
        capability: providerCapabilities.capability,
      })
      .from(providerCapabilities)
      .where(eq(providerCapabilities.isActive, true));

    const capsByProvider = new Map<string, string[]>();
    for (const cap of allCaps) {
      const list = capsByProvider.get(cap.providerId) || [];
      list.push(cap.capability);
      capsByProvider.set(cap.providerId, list);
    }

    let result: ProviderAdminItem[] = rawProviders.map((p) => ({
      id: p.id,
      userId: p.userId,
      businessName: p.businessName,
      providerType: p.providerType,
      verificationLevel: p.verificationLevel,
      rating: p.rating,
      completedJobs: p.completedJobs,
      isOnline: p.isOnline ?? false,
      isBlocked: p.isBlocked,
      phone: p.phone,
      capabilities: capsByProvider.get(p.id) || [],
      createdAt: p.createdAt,
    }));

    if (filters?.verificationLevel) {
      result = result.filter((p) => p.verificationLevel === filters.verificationLevel);
    }
    if (filters?.isOnline !== undefined) {
      result = result.filter((p) => p.isOnline === filters.isOnline);
    }
    if (filters?.isBlocked !== undefined) {
      result = result.filter((p) => p.isBlocked === filters.isBlocked);
    }

    return result;
  }

  /**
   * Updates provider verification level and/or account blocked status.
   */
  static async updateProviderVerification(
    providerId: string,
    input: UpdateProviderVerificationInput
  ): Promise<ProviderAdminItem> {
    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId));

    if (!provider) {
      throw new NotFoundError(`Provider with ID '${providerId}' not found`);
    }

    const now = new Date();

    if (input.verificationLevel) {
      const allowedLevels = [
        'LEVEL_1_VERIFIED_SERVICE',
        'LEVEL_2_VERIFIED_MASTER',
        'LEVEL_3_NEW_PROVIDER',
      ];
      if (!allowedLevels.includes(input.verificationLevel)) {
        throw new ValidationError(`Invalid verification level '${input.verificationLevel}'`);
      }

      await db
        .update(providers)
        .set({
          verificationLevel: input.verificationLevel,
          updatedAt: now,
        })
        .where(eq(providers.id, providerId));
    }

    if (input.isBlocked !== undefined) {
      await db
        .update(users)
        .set({
          isBlocked: input.isBlocked,
          updatedAt: now,
        })
        .where(eq(users.id, provider.userId));
    }

    const [updatedList] = await this.listProviders();
    const updated = (await this.listProviders()).find((p) => p.id === providerId);
    if (!updated) {
      throw new NotFoundError('Updated provider could not be retrieved');
    }

    return updated;
  }

  /**
   * Lists orders across Astana with client and provider details.
   */
  static async listOrders(filters?: {
    status?: string;
    limit?: number;
  }): Promise<OrderAdminItem[]> {
    const query = db
      .select({
        id: orders.id,
        requestId: orders.requestId,
        status: orders.status,
        agreedPricingMode: orders.agreedPricingMode,
        agreedAmountTiyn: orders.agreedAmountTiyn,
        finalAmountTiyn: orders.finalAmountTiyn,
        category: serviceRequests.category,
        customerPhone: users.phone,
        providerBusinessName: providers.businessName,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .innerJoin(serviceRequests, eq(orders.requestId, serviceRequests.id))
      .innerJoin(users, eq(orders.customerId, users.id))
      .innerJoin(providers, eq(orders.providerId, providers.id))
      .orderBy(desc(orders.createdAt))
      .limit(filters?.limit ?? 50);

    const rows = await query;

    if (filters?.status) {
      return rows.filter((r) => r.status === filters.status);
    }

    return rows;
  }
}
