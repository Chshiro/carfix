import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  users,
  providers,
  providerAvailability,
  providerCapabilities,
  serviceRequests,
  orders,
  disputes,
  adminAuditLogs,
} from '../../db/schema/index';
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from '../errors';
import { PaymentService } from './payment.service';
import { revokeAllUserSessions } from '../auth/session';

export interface MarketplaceMetrics {
  activeRequestsCount: number;
  activeOrdersCount: number;
  completedOrdersCount: number;
  totalGmvTiyn: number;
  onlineProvidersCount: number;
  totalProvidersCount: number;
  totalCustomersCount: number;
  openDisputesCount?: number;
}

export interface ProviderAdminItem {
  id: string;
  userId: string;
  businessName: string;
  providerType: string;
  verificationLevel: string;
  verificationStatus: string;
  idCardNumber: string | null;
  taxNumberIin: string | null;
  rating: number;
  completedJobs: number;
  isOnline: boolean;
  isBlocked: boolean;
  blockReason: string | null;
  phone: string;
  capabilities: string[];
  createdAt: Date;
}

export interface UpdateProviderVerificationInput {
  verificationLevel?: 'LEVEL_1_VERIFIED_SERVICE' | 'LEVEL_2_VERIFIED_MASTER' | 'LEVEL_3_NEW_PROVIDER';
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  idCardNumber?: string;
  taxNumberIin?: string;
  isBlocked?: boolean;
  blockReason?: string;
  notes?: string;
  adminId?: string;
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

export interface LiveDispatchOrderLocation {
  orderId: string;
  requestId: string;
  status: string;
  category: string;
  customer: {
    id: string;
    phone: string;
    location: { lat: number; lng: number };
  };
  provider: {
    id: string;
    businessName: string;
    phone: string;
    location: { lat: number; lng: number } | null;
    isOnline: boolean;
  } | null;
  agreedAmountTiyn: number | null;
  createdAt: Date;
}

export interface DisputeAdminItem {
  id: string;
  orderId: string;
  openedByUserId: string;
  openedByPhone: string;
  reason: string;
  status: string;
  resolutionNotes: string | null;
  refundAmountTiyn: number | null;
  adminId: string | null;
  category: string;
  providerBusinessName: string;
  orderStatus: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

/**
 * Validates Kazakhstan 12-digit IIN (Individual Identification Number)
 * according to the official two-pass checksum algorithm (КГД МФ РК).
 */
export function validateKazakhstanIin(iin: string): boolean {
  if (!iin || typeof iin !== 'string') return false;
  const cleaned = iin.trim();
  if (!/^\d{12}$/.test(cleaned)) return false;

  const digits = cleaned.split('').map(Number);

  // Check valid century/gender digit (1-6)
  const centuryGender = digits[6];
  if (centuryGender < 1 || centuryGender > 6) return false;

  // Pass 1
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  let sum1 = 0;
  for (let i = 0; i < 11; i++) {
    sum1 += digits[i] * w1[i];
  }
  let k = sum1 % 11;

  if (k === 10) {
    // Pass 2
    const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
    let sum2 = 0;
    for (let i = 0; i < 11; i++) {
      sum2 += digits[i] * w2[i];
    }
    k = sum2 % 11;
  }

  if (k === 10) return false;

  return digits[11] === k;
}

export class AdminService {
  static validateKazakhstanIin = validateKazakhstanIin;
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

    // 7. Open Disputes
    const [openDisp] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(disputes)
      .where(eq(disputes.status, 'OPEN'));

    return {
      activeRequestsCount: activeReqs?.count || 0,
      activeOrdersCount: activeOrds?.count || 0,
      completedOrdersCount: completedOrds?.count || 0,
      totalGmvTiyn: completedOrds?.totalGmv || 0,
      onlineProvidersCount: onlineProvs?.count || 0,
      totalProvidersCount: totalProvs?.count || 0,
      totalCustomersCount: totalCusts?.count || 0,
      openDisputesCount: openDisp?.count || 0,
    };
  }

  /**
   * Alias for getMarketplaceMetrics matching Stage 1 requirements.
   */
  static async getLiveDispatchMetrics(): Promise<MarketplaceMetrics> {
    return this.getMarketplaceMetrics();
  }

  /**
   * Fetches active orders and requests with GPS coordinates for Dispatch Live Map.
   */
  static async getAllActiveOrdersWithLocations(): Promise<LiveDispatchOrderLocation[]> {
    const activeOrders = await db
      .select({
        orderId: orders.id,
        requestId: orders.requestId,
        status: orders.status,
        agreedAmountTiyn: orders.agreedAmountTiyn,
        createdAt: orders.createdAt,
        category: serviceRequests.category,
        requestLocation: serviceRequests.location,
        customerUserId: users.id,
        customerPhone: users.phone,
        providerId: providers.id,
        providerBusinessName: providers.businessName,
        providerPhone: sql<string>`(SELECT phone FROM users WHERE users.id = ${providers.userId})`,
        providerLocation: providerAvailability.location,
        providerIsOnline: providerAvailability.isOnline,
      })
      .from(orders)
      .innerJoin(serviceRequests, eq(orders.requestId, serviceRequests.id))
      .innerJoin(users, eq(orders.customerId, users.id))
      .innerJoin(providers, eq(orders.providerId, providers.id))
      .leftJoin(providerAvailability, eq(providers.id, providerAvailability.providerId))
      .where(
        inArray(orders.status, [
          'PROVIDER_SELECTED',
          'EN_ROUTE',
          'ARRIVED',
          'IN_PROGRESS',
        ])
      )
      .orderBy(desc(orders.createdAt));

    return activeOrders.map((o) => ({
      orderId: o.orderId,
      requestId: o.requestId,
      status: o.status,
      category: o.category,
      customer: {
        id: o.customerUserId,
        phone: o.customerPhone,
        location: {
          lat: o.requestLocation.lat,
          lng: o.requestLocation.lng,
        },
      },
      provider: o.providerId
        ? {
            id: o.providerId,
            businessName: o.providerBusinessName,
            phone: o.providerPhone || '',
            location: o.providerLocation
              ? {
                  lat: o.providerLocation.lat,
                  lng: o.providerLocation.lng,
                }
              : null,
            isOnline: o.providerIsOnline ?? false,
          }
        : null,
      agreedAmountTiyn: o.agreedAmountTiyn,
      createdAt: o.createdAt,
    }));
  }

  /**
   * Lists providers with relational user, availability, and capability details.
   */
  static async listProviders(filters?: {
    verificationLevel?: string;
    verificationStatus?: string;
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
        verificationStatus: providers.verificationStatus,
        idCardNumber: providers.idCardNumber,
        taxNumberIin: providers.taxNumberIin,
        blockReason: providers.blockReason,
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
      verificationStatus: p.verificationStatus,
      idCardNumber: p.idCardNumber,
      taxNumberIin: p.taxNumberIin,
      rating: p.rating,
      completedJobs: p.completedJobs,
      isOnline: p.isOnline ?? false,
      isBlocked: p.isBlocked,
      blockReason: p.blockReason,
      phone: p.phone,
      capabilities: capsByProvider.get(p.id) || [],
      createdAt: p.createdAt,
    }));

    if (filters?.verificationLevel) {
      result = result.filter((p) => p.verificationLevel === filters.verificationLevel);
    }
    if (filters?.verificationStatus) {
      result = result.filter((p) => p.verificationStatus === filters.verificationStatus);
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
   * Validates Kazakhstan 12-digit IIN (Individual Identification Number)
   * according to the official two-pass checksum algorithm (КГД МФ РК).
   */
  static validateIin(iin: string): boolean {
    return validateKazakhstanIin(iin);
  }

  /**
   * Verifies or rejects a master provider profile.
   */
  static async verifyMaster(
    providerId: string,
    status: 'VERIFIED' | 'REJECTED' | 'PENDING',
    notes?: string,
    adminId?: string
  ): Promise<ProviderAdminItem> {
    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId));

    if (!provider) {
      throw new NotFoundError(`Provider with ID '${providerId}' not found`);
    }

    if (status === 'VERIFIED' && provider.taxNumberIin) {
      if (!validateKazakhstanIin(provider.taxNumberIin)) {
        throw new ValidationError('Некорректный ИИН мастера (ошибка контрольного разряда РК)');
      }
    }

    const now = new Date();
    const verificationLevel =
      status === 'VERIFIED' ? 'LEVEL_2_VERIFIED_MASTER' : provider.verificationLevel;

    await db
      .update(providers)
      .set({
        verificationStatus: status,
        verificationLevel,
        updatedAt: now,
      })
      .where(eq(providers.id, providerId));

    if (adminId) {
      await db.insert(adminAuditLogs).values({
        adminId,
        action: 'VERIFY_MASTER',
        entityType: 'PROVIDER',
        entityId: providerId,
        payload: JSON.stringify({ status, notes, verificationLevel }),
        createdAt: now,
      });
    }

    const updated = (await this.listProviders()).find((p) => p.id === providerId);
    if (!updated) {
      throw new NotFoundError('Updated provider could not be retrieved');
    }
    return updated;
  }

  /**
   * Blocks or unblocks a user account (customer or provider).
   */
  static async blockUser(
    userId: string,
    isBlocked: boolean,
    reason?: string,
    adminId?: string
  ): Promise<void> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new NotFoundError(`User with ID '${userId}' not found`);
    }

    const now = new Date();
    await db
      .update(users)
      .set({
        isBlocked,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    // Also update provider block reason if provider
    await db
      .update(providers)
      .set({
        isBlocked,
        blockReason: isBlocked ? reason || 'Заблокирован администратором' : null,
        updatedAt: now,
      })
      .where(eq(providers.userId, userId));

    if (isBlocked) {
      // Immediately revoke all server-side sessions
      await revokeAllUserSessions(userId);
    }

    if (adminId) {
      await db.insert(adminAuditLogs).values({
        adminId,
        action: 'BLOCK_USER',
        entityType: 'USER',
        entityId: userId,
        payload: JSON.stringify({ isBlocked, reason }),
        createdAt: now,
      });
    }
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

    if (input.taxNumberIin) {
      if (!validateKazakhstanIin(input.taxNumberIin)) {
        throw new ValidationError('Некорректный ИИН РК (ошибка контрольной суммы)');
      }
    }

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

    if (input.verificationStatus) {
      await db
        .update(providers)
        .set({
          verificationStatus: input.verificationStatus,
          updatedAt: now,
        })
        .where(eq(providers.id, providerId));
    }

    if (input.idCardNumber !== undefined || input.taxNumberIin !== undefined) {
      await db
        .update(providers)
        .set({
          ...(input.idCardNumber !== undefined ? { idCardNumber: input.idCardNumber } : {}),
          ...(input.taxNumberIin !== undefined ? { taxNumberIin: input.taxNumberIin } : {}),
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

      await db
        .update(providers)
        .set({
          isBlocked: input.isBlocked,
          blockReason: input.blockReason || null,
          updatedAt: now,
        })
        .where(eq(providers.id, providerId));
    }

    if (input.adminId) {
      await db.insert(adminAuditLogs).values({
        adminId: input.adminId,
        action: 'VERIFY_MASTER',
        entityType: 'PROVIDER',
        entityId: providerId,
        payload: JSON.stringify(input),
        createdAt: now,
      });
    }

    const updated = (await this.listProviders()).find((p) => p.id === providerId);
    if (!updated) {
      throw new NotFoundError('Updated provider could not be retrieved');
    }

    return updated;
  }

  /**
   * Creates a dispute for an order with strict actor authorization.
   */
  static async createDispute(
    orderId: string,
    openedByUserId: string,
    reason: string
  ): Promise<string> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!order) {
      throw new NotFoundError(`Order with ID '${orderId}' not found`);
    }

    // Verify actor is a participant in this order (or admin)
    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, order.providerId));

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, openedByUserId));

    const isCustomer = order.customerId === openedByUserId;
    const isProvider = provider?.userId === openedByUserId;
    const isAdmin = user?.roles.includes('admin');

    if (!isCustomer && !isProvider && !isAdmin) {
      throw new ForbiddenError('You can only open a dispute for orders you participate in');
    }

    // Check if an active OPEN dispute already exists for this order
    const [existingOpenDispute] = await db
      .select({ id: disputes.id })
      .from(disputes)
      .where(
        and(
          eq(disputes.orderId, orderId),
          eq(disputes.status, 'OPEN')
        )
      );

    if (existingOpenDispute) {
      throw new ConflictError('An active dispute is already open for this order');
    }

    const [created] = await db
      .insert(disputes)
      .values({
        orderId,
        openedByUserId,
        reason: reason.trim(),
        status: 'OPEN',
      })
      .returning({ id: disputes.id });

    return created.id;
  }

  /**
   * Lists disputes with related order, customer, and provider information.
   */
  static async listDisputes(statusFilter?: string): Promise<DisputeAdminItem[]> {
    const rows = await db
      .select({
        id: disputes.id,
        orderId: disputes.orderId,
        openedByUserId: disputes.openedByUserId,
        openedByPhone: users.phone,
        reason: disputes.reason,
        status: disputes.status,
        resolutionNotes: disputes.resolutionNotes,
        refundAmountTiyn: disputes.refundAmountTiyn,
        adminId: disputes.adminId,
        createdAt: disputes.createdAt,
        resolvedAt: disputes.resolvedAt,
        category: serviceRequests.category,
        providerBusinessName: providers.businessName,
        orderStatus: orders.status,
      })
      .from(disputes)
      .innerJoin(users, eq(disputes.openedByUserId, users.id))
      .innerJoin(orders, eq(disputes.orderId, orders.id))
      .innerJoin(serviceRequests, eq(orders.requestId, serviceRequests.id))
      .innerJoin(providers, eq(orders.providerId, providers.id))
      .orderBy(desc(disputes.createdAt));

    if (statusFilter && statusFilter !== 'ALL') {
      return rows.filter((r) => r.status === statusFilter);
    }
    return rows;
  }

  /**
   * Resolves a dispute with atomic status updates, refund triggers, and audit logging.
   */
  static async resolveDispute(
    disputeId: string,
    resolution: 'RESOLVED_REFUND' | 'RESOLVED_RELEASE' | 'RESOLVED_SPLIT' | 'DISMISSED',
    refundAmountTiyn?: number,
    notes?: string,
    adminId?: string
  ): Promise<DisputeAdminItem> {
    return await db.transaction(async (tx) => {
      const [dispute] = await tx
        .select()
        .from(disputes)
        .where(eq(disputes.id, disputeId))
        .for('update');

      if (!dispute) {
        throw new NotFoundError(`Dispute with ID '${disputeId}' not found`);
      }

      if (dispute.status !== 'OPEN') {
        throw new ConflictError(`Cannot resolve dispute: it is already in status '${dispute.status}'`);
      }

      const now = new Date();

      // If resolution is REFUND, trigger atomic refund on the order
      if (resolution === 'RESOLVED_REFUND') {
        await PaymentService.refundHold(dispute.orderId, notes || 'Dispute arbitration refund', tx);
      }

      await tx
        .update(disputes)
        .set({
          status: resolution,
          resolutionNotes: notes || null,
          refundAmountTiyn: refundAmountTiyn ?? null,
          adminId: adminId || null,
          resolvedAt: now,
        })
        .where(eq(disputes.id, disputeId));

      if (adminId) {
        await tx.insert(adminAuditLogs).values({
          adminId,
          action: 'RESOLVE_DISPUTE',
          entityType: 'DISPUTE',
          entityId: disputeId,
          payload: JSON.stringify({ resolution, refundAmountTiyn, notes }),
          createdAt: now,
        });
      }

      const [updated] = await tx
        .select({
          id: disputes.id,
          orderId: disputes.orderId,
          openedByUserId: disputes.openedByUserId,
          openedByPhone: users.phone,
          reason: disputes.reason,
          status: disputes.status,
          resolutionNotes: disputes.resolutionNotes,
          refundAmountTiyn: disputes.refundAmountTiyn,
          adminId: disputes.adminId,
          createdAt: disputes.createdAt,
          resolvedAt: disputes.resolvedAt,
          category: serviceRequests.category,
          providerBusinessName: providers.businessName,
          orderStatus: orders.status,
        })
        .from(disputes)
        .innerJoin(users, eq(disputes.openedByUserId, users.id))
        .innerJoin(orders, eq(disputes.orderId, orders.id))
        .innerJoin(serviceRequests, eq(orders.requestId, serviceRequests.id))
        .innerJoin(providers, eq(orders.providerId, providers.id))
        .where(eq(disputes.id, disputeId));

      if (!updated) {
        throw new NotFoundError('Resolved dispute could not be retrieved');
      }

      return updated;
    });
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
