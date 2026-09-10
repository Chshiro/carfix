import { eq, and, ne } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  orders,
  orderStatusHistory,
  providerOffers,
  providers,
  serviceRequests,
  users,
} from '../../db/schema/index';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors';
import { AuthUser } from '../auth';

export interface SelectOfferInput {
  requestId: string;
  offerId: string;
}

export class OrderService {
  /**
   * 11-Step Canonical Atomic Offer Selection:
   * BEGIN
   * 1. SELECT service_request FOR UPDATE (row lock)
   * 2. Verify ownership (customer owner or admin)
   * 3. Verify request status allows selection (PUBLISHED or OFFERS_RECEIVED)
   * 4. Verify request is not expired (expiresAt > NOW())
   * 5. SELECT provider_offer FOR UPDATE (row lock) & verify offer belongs to request
   * 6. Verify offer is still selectable (status = SUBMITTED)
   * 7. Verify provider remains eligible & not blocked
   * 8. Create Order record (status = PROVIDER_SELECTED)
   * 9. Mark selected offer as ACCEPTED
   * 10. Mark other submitted offers for this request as REJECTED
   * 11. Update request status to PROVIDER_SELECTED & insert initial order_status_history
   * COMMIT
   */
  static async selectOffer(input: SelectOfferInput, currentUser: AuthUser) {
    const { requestId, offerId } = input;

    return await db.transaction(async (tx) => {
      // 1. SELECT service_request FOR UPDATE
      const [request] = await tx
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, requestId))
        .for('update');

      if (!request) {
        throw new NotFoundError('Service request not found');
      }

      // 2. IDOR / Ownership Check
      const isOwner = request.customerId === currentUser.id;
      const isAdmin = currentUser.roles.includes('admin');
      if (!isOwner && !isAdmin) {
        throw new ForbiddenError('Only the customer who created this request can select an offer');
      }

      // 3. Verify request status allows selection
      if (request.status !== 'PUBLISHED' && request.status !== 'OFFERS_RECEIVED') {
        throw new ConflictError(
          `Cannot select offer: request is in status '${request.status}'`
        );
      }

      // 4. Expiration check during offer selection
      if (new Date(request.expiresAt).getTime() <= Date.now()) {
        throw new ConflictError('Cannot select offer: request has expired');
      }

      // 5. Verify offer belongs to this request & lock offer row
      const [offer] = await tx
        .select()
        .from(providerOffers)
        .where(
          and(
            eq(providerOffers.id, offerId),
            eq(providerOffers.requestId, requestId)
          )
        )
        .for('update');

      if (!offer) {
        throw new NotFoundError('Offer not found for this request');
      }

      // 6. Verify offer is still selectable
      if (offer.status !== 'SUBMITTED') {
        throw new ConflictError(
          `Cannot select offer: offer is already in status '${offer.status}'`
        );
      }

      // 7. Verify provider remains eligible & not blocked
      const [provider] = await tx
        .select()
        .from(providers)
        .where(eq(providers.id, offer.providerId));

      if (!provider) {
        throw new NotFoundError('Selected provider not found');
      }

      const [providerUser] = await tx
        .select()
        .from(users)
        .where(eq(users.id, provider.userId));

      if (!providerUser || providerUser.isBlocked) {
        throw new ConflictError('Selected provider is no longer active or is blocked');
      }

      const now = new Date();

      // 8. Create Order record
      const [order] = await tx
        .insert(orders)
        .values({
          requestId: request.id,
          offerId: offer.id,
          customerId: request.customerId,
          providerId: offer.providerId,
          status: 'PROVIDER_SELECTED',
          agreedPricingMode: offer.pricingMode,
          agreedAmountTiyn: offer.amountTiyn ?? null,
          agreedMinTiyn: offer.minAmountTiyn ?? null,
          agreedMaxTiyn: offer.maxAmountTiyn ?? null,
          cancellationReason: null,
          cancelledBy: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // 9. Mark selected offer as ACCEPTED
      await tx
        .update(providerOffers)
        .set({ status: 'ACCEPTED', updatedAt: now })
        .where(eq(providerOffers.id, offer.id));

      // 10. Mark all other submitted offers for this request as REJECTED
      await tx
        .update(providerOffers)
        .set({ status: 'REJECTED', updatedAt: now })
        .where(
          and(
            eq(providerOffers.requestId, request.id),
            ne(providerOffers.id, offer.id),
            eq(providerOffers.status, 'SUBMITTED')
          )
        );

      // 11. Update request status to PROVIDER_SELECTED & record history
      await tx
        .update(serviceRequests)
        .set({ status: 'PROVIDER_SELECTED', updatedAt: now })
        .where(eq(serviceRequests.id, request.id));

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: 'PROVIDER_SELECTED',
        actorId: currentUser.id,
        actorRole: currentUser.roles.includes('admin') ? 'admin' : 'motorist',
        note: 'Offer accepted by customer',
        createdAt: now,
      });

      return {
        order,
        provider: {
          id: provider.id,
          businessName: provider.businessName,
          providerType: provider.providerType,
          rating: Number(provider.rating) / 100,
        },
        offer: {
          id: offer.id,
          pricingMode: offer.pricingMode,
          amountTiyn: offer.amountTiyn,
          minAmountTiyn: offer.minAmountTiyn,
          maxAmountTiyn: offer.maxAmountTiyn,
          etaMinutes: offer.etaMinutes,
        },
      };
    });
  }

  static async getOrderById(orderId: string, currentUser: AuthUser) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, order.providerId));

    // Anti-IDOR check: customer or provider or admin
    const isCustomer = order.customerId === currentUser.id;
    const isProvider = provider?.userId === currentUser.id;
    const isAdmin = currentUser.roles.includes('admin');

    if (!isCustomer && !isProvider && !isAdmin) {
      throw new ForbiddenError('You do not have permission to view this order');
    }

    const [offer] = await db
      .select()
      .from(providerOffers)
      .where(eq(providerOffers.id, order.offerId));

    const [request] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, order.requestId));

    return {
      order,
      provider: provider
        ? {
            id: provider.id,
            businessName: provider.businessName,
            providerType: provider.providerType,
            rating: Number(provider.rating) / 100,
          }
        : null,
      offer,
      request,
    };
  }
}
