import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { orders, providers, reviews, users } from '../../db/schema/index';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors';
import { AuthUser } from '../auth';

export interface CreateReviewInput {
  rating: number;
  comment?: string;
}

export class ReviewService {
  /**
   * Submit a 1-5 star review for a completed order.
   * Enforces bidirectional participant permissions and recalculates aggregate provider rating.
   */
  static async createReview(
    orderId: string,
    input: { rating: number; comment?: string },
    currentUser: AuthUser
  ) {
    if (currentUser.isBlocked) {
      throw new ForbiddenError('User account is blocked');
    }

    const { rating, comment } = input;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ConflictError('Review rating must be an integer between 1 and 5');
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (order.status !== 'COMPLETED') {
      throw new ConflictError(
        `Reviews can only be submitted for completed orders (current status: '${order.status}')`
      );
    }

    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, order.providerId));

    if (!provider) {
      throw new NotFoundError('Provider not found for this order');
    }

    // Determine sender and target
    const isCustomer = order.customerId === currentUser.id;
    const isProvider = provider.userId === currentUser.id;
    const isAdmin = currentUser.roles.includes('admin');

    if (!isCustomer && !isProvider && !isAdmin) {
      throw new ForbiddenError('Only participants of this order can submit a review');
    }

    const fromUserId = currentUser.id;
    const toUserId = isCustomer ? provider.userId : order.customerId;

    try {
      return await db.transaction(async (tx) => {
        const [newReview] = await tx
          .insert(reviews)
          .values({
            orderId: order.id,
            fromUserId,
            toUserId,
            rating,
            comment: comment ? comment.trim() : null,
          })
          .returning();

        // If Customer reviewed Provider, recalculate provider's aggregate rating
        if (isCustomer) {
          const [ratingStats] = await tx
            .select({
              avgRating: sql<number>`AVG(${reviews.rating})::numeric(10,2)`,
              count: sql<number>`COUNT(${reviews.id})::int`,
            })
            .from(reviews)
            .where(eq(reviews.toUserId, provider.userId));

          const calculatedRating = ratingStats?.avgRating
            ? Math.round(Number(ratingStats.avgRating) * 100)
            : rating * 100;

          await tx
            .update(providers)
            .set({
              rating: calculatedRating,
              updatedAt: new Date(),
            })
            .where(eq(providers.id, provider.id));
        }

        return newReview;
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        throw new ConflictError('You have already submitted a review for this order');
      }
      throw err;
    }
  }

  /**
   * Get all reviews submitted for a specific order
   */
  static async getReviewsForOrder(orderId: string, currentUser: AuthUser) {
    if (currentUser.isBlocked) {
      throw new ForbiddenError('User account is blocked');
    }

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

    const isCustomer = order.customerId === currentUser.id;
    const isProvider = provider?.userId === currentUser.id;
    const isAdmin = currentUser.roles.includes('admin');

    if (!isCustomer && !isProvider && !isAdmin) {
      throw new ForbiddenError('You do not have permission to view reviews for this order');
    }

    const orderReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.orderId, orderId))
      .orderBy(reviews.createdAt);

    return orderReviews;
  }
}
