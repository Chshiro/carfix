import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  wallets,
  transactions,
  paymentInvoices,
  orders,
  providers,
  users,
} from '../../db/schema/index';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CreateHoldInput {
  orderId: string;
  customerId: string;
  amountTiyn: number;
  paymentMethod?: 'KASPI_QR' | 'BANK_CARD' | 'CASH';
}

export interface SplitResult {
  orderId: string;
  invoiceId: string;
  totalAmountTiyn: number;
  platformFeeTiyn: number;
  providerNetTiyn: number;
  providerWalletBalanceTiyn: number;
}

export interface WalletStatement {
  walletId: string;
  userId: string;
  balanceTiyn: number;
  frozenTiyn: number;
  transactions: Array<{
    id: string;
    type: string;
    amountTiyn: number;
    feeTiyn: number;
    status: string;
    orderId: string | null;
    createdAt: Date;
  }>;
}

export class PaymentService {
  /**
   * Generates simulated Kaspi QR payment payload and deep-link.
   */
  static generateKaspiPaymentPayload(invoiceId: string, amountTiyn: number): {
    qrUrl: string;
    deeplink: string;
    expiresInSeconds: number;
  } {
    const amountKzt = Math.round(amountTiyn / 100);
    const deeplink = `kaspi://pay?service_id=carfix_astana&invoice=${invoiceId}&amount=${amountKzt}`;
    // SVG Data URI for instantaneous client QR rendering
    const qrUrl = `https://pay.kaspi.kz/pay/carfix?invoice=${invoiceId}&amount=${amountKzt}`;
    return {
      qrUrl,
      deeplink,
      expiresInSeconds: 300,
    };
  }

  /**
   * Initializes payment and holds customer funds in Escrow atomically.
   */
  static async createHold(input: CreateHoldInput) {
    if (input.amountTiyn <= 0) {
      throw new ValidationError('Payment amount must be greater than 0');
    }

    return await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .for('update');

      if (!order) {
        throw new NotFoundError(`Order with ID '${input.orderId}' not found`);
      }

      if (order.customerId !== input.customerId) {
        throw new ForbiddenError('You can only pay for your own orders');
      }

      const payableStatuses = ['PROVIDER_SELECTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];
      if (!payableStatuses.includes(order.status)) {
        throw new ConflictError(`Cannot hold funds for order in '${order.status}' status`);
      }

      // Idempotency: return existing invoice if already created and active
      const [existingInvoice] = await tx
        .select()
        .from(paymentInvoices)
        .where(eq(paymentInvoices.orderId, input.orderId))
        .for('update');

      if (existingInvoice) {
        if (existingInvoice.status === 'HELD' || existingInvoice.status === 'CAPTURED') {
          const qrPayload = this.generateKaspiPaymentPayload(order.id, existingInvoice.amountTiyn);
          return {
            invoice: existingInvoice,
            kaspiPayload: qrPayload,
          };
        }
      }

      const method = input.paymentMethod || 'KASPI_QR';
      const qrPayload = this.generateKaspiPaymentPayload(order.id, input.amountTiyn);

      // Create payment invoice
      const [invoice] = await tx
        .insert(paymentInvoices)
        .values({
          orderId: input.orderId,
          customerId: input.customerId,
          amountTiyn: input.amountTiyn,
          serviceFeePercent: 12,
          paymentMethod: method,
          status: 'HELD', // Held in escrow
          externalQrUrl: qrPayload.qrUrl,
        })
        .returning();

      // Get or create wallet for customer for audit
      let [customerWallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, input.customerId))
        .for('update');

      if (!customerWallet) {
        const [newWallet] = await tx
          .insert(wallets)
          .values({
            userId: input.customerId,
            balanceTiyn: 0,
            frozenTiyn: 0,
          })
          .returning();
        customerWallet = newWallet;
      }

      // Record HOLD transaction
      await tx.insert(transactions).values({
        walletId: customerWallet.id,
        orderId: input.orderId,
        type: 'HOLD',
        amountTiyn: input.amountTiyn,
        feeTiyn: 0,
        providerPaymentId: invoice.id,
        status: 'SUCCESS',
      });

      return {
        invoice,
        kaspiPayload: qrPayload,
      };
    });
  }

  /**
   * Captures held funds, deducts 12% platform fee, and credits 88% to provider wallet.
   * Executes inside atomic transaction with row locks to prevent race conditions.
   */
  static async captureAndSplit(orderId: string, expectedProviderId?: string): Promise<SplitResult> {
    return await db.transaction(async (tx) => {
      // 1. Lock invoice with FOR UPDATE
      const [invoice] = await tx
        .select()
        .from(paymentInvoices)
        .where(eq(paymentInvoices.orderId, orderId))
        .for('update');

      if (!invoice) {
        throw new NotFoundError(`No invoice found for order '${orderId}'`);
      }

      if (invoice.status === 'CAPTURED') {
        throw new ConflictError(`Invoice for order '${orderId}' has already been captured and split`);
      }

      if (invoice.status === 'REFUNDED') {
        throw new ConflictError(`Cannot capture refunded invoice for order '${orderId}'`);
      }

      // 2. Fetch and lock order with FOR UPDATE
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update');

      if (!order) {
        throw new NotFoundError(`Order '${orderId}' not found`);
      }

      if (order.status !== 'COMPLETED') {
        throw new ConflictError('Order must be in COMPLETED status to capture funds');
      }

      if (expectedProviderId && order.providerId !== expectedProviderId) {
        throw new ForbiddenError('You are not the assigned provider for this order');
      }

      const [provider] = await tx
        .select()
        .from(providers)
        .where(eq(providers.id, order.providerId));

      if (!provider) {
        throw new NotFoundError(`Provider '${order.providerId}' not found`);
      }

      // 3. Fee arithmetic (12% Platform Fee, 88% Master Payout)
      const totalAmountTiyn = invoice.amountTiyn;
      const platformFeeTiyn = Math.round((totalAmountTiyn * invoice.serviceFeePercent) / 100);
      const providerNetTiyn = totalAmountTiyn - platformFeeTiyn;

      // 4. Update invoice to CAPTURED
      const now = new Date();
      await tx
        .update(paymentInvoices)
        .set({
          status: 'CAPTURED',
          updatedAt: now,
        })
        .where(eq(paymentInvoices.id, invoice.id));

      // 5. Get or create provider wallet
      let [providerWallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, provider.userId))
        .for('update');

      if (!providerWallet) {
        const [newW] = await tx
          .insert(wallets)
          .values({
            userId: provider.userId,
            balanceTiyn: 0,
            frozenTiyn: 0,
            updatedAt: now,
          })
          .returning();
        providerWallet = newW;
      }

      // 6. Credit provider wallet
      const newBalanceTiyn = providerWallet.balanceTiyn + providerNetTiyn;
      await tx
        .update(wallets)
        .set({
          balanceTiyn: newBalanceTiyn,
          updatedAt: now,
        })
        .where(eq(wallets.id, providerWallet.id));

      // 7. Record RELEASE transaction (88%)
      await tx.insert(transactions).values({
        walletId: providerWallet.id,
        orderId,
        type: 'RELEASE',
        amountTiyn: providerNetTiyn,
        feeTiyn: 0,
        providerPaymentId: invoice.id,
        status: 'SUCCESS',
        createdAt: now,
      });

      // 8. Record PLATFORM_FEE transaction (12%)
      await tx.insert(transactions).values({
        walletId: providerWallet.id,
        orderId,
        type: 'PLATFORM_FEE',
        amountTiyn: platformFeeTiyn,
        feeTiyn: platformFeeTiyn,
        providerPaymentId: invoice.id,
        status: 'SUCCESS',
        createdAt: now,
      });

      return {
        orderId,
        invoiceId: invoice.id,
        totalAmountTiyn,
        platformFeeTiyn,
        providerNetTiyn,
        providerWalletBalanceTiyn: newBalanceTiyn,
      };
    });
  }

  /**
   * Releases and refunds Escrow hold to the customer.
   * Can be executed within an existing transaction (externalTx) or a standalone transaction.
   */
  static async refundHold(
    orderId: string,
    reason: string,
    externalTx?: DbTransaction
  ): Promise<void> {
    const runInTx = async (tx: DbTransaction) => {
      const [invoice] = await tx
        .select()
        .from(paymentInvoices)
        .where(eq(paymentInvoices.orderId, orderId))
        .for('update');

      if (!invoice) {
        if (!externalTx) {
          throw new NotFoundError(`Invoice for order '${orderId}' not found`);
        }
        return;
      }

      if (invoice.status === 'CAPTURED') {
        throw new ConflictError('Cannot refund captured payment without dispute arbitration');
      }

      if (invoice.status === 'REFUNDED') {
        return;
      }

      const now = new Date();
      await tx
        .update(paymentInvoices)
        .set({
          status: 'REFUNDED',
          updatedAt: now,
        })
        .where(eq(paymentInvoices.id, invoice.id));

      const [customerWallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, invoice.customerId))
        .for('update');

      if (customerWallet) {
        await tx.insert(transactions).values({
          walletId: customerWallet.id,
          orderId,
          type: 'REFUND',
          amountTiyn: invoice.amountTiyn,
          feeTiyn: 0,
          providerPaymentId: reason,
          status: 'SUCCESS',
          createdAt: now,
        });
      }
    };

    if (externalTx) {
      await runInTx(externalTx);
    } else {
      await db.transaction(async (tx) => {
        await runInTx(tx);
      });
    }
  }

  /**
   * Retrieves wallet balance, frozen funds, and ledger statement.
   */
  static async getWallet(userId: string): Promise<WalletStatement> {
    let [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId));

    if (!wallet) {
      const [newWallet] = await db
        .insert(wallets)
        .values({
          userId,
          balanceTiyn: 0,
          frozenTiyn: 0,
        })
        .returning();
      wallet = newWallet;
    }

    const txs = await db
      .select({
        id: transactions.id,
        type: transactions.type,
        amountTiyn: transactions.amountTiyn,
        feeTiyn: transactions.feeTiyn,
        status: transactions.status,
        orderId: transactions.orderId,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(eq(transactions.walletId, wallet.id))
      .orderBy(desc(transactions.createdAt));

    return {
      walletId: wallet.id,
      userId: wallet.userId,
      balanceTiyn: wallet.balanceTiyn,
      frozenTiyn: wallet.frozenTiyn,
      transactions: txs,
    };
  }

  /**
   * Requests a withdrawal to Kaspi Gold / Halyk Bank.
   */
  static async requestWithdrawal(
    userId: string,
    amountTiyn: number,
    destinationType: 'KASPI_GOLD' | 'HALYK_BANK' | 'IBAN',
    destinationAccount: string
  ) {
    if (!Number.isInteger(amountTiyn) || amountTiyn < 100) {
      throw new ValidationError('Withdrawal amount must be an integer of at least 100 tiyn (1 ₸)');
    }

    if (!destinationAccount || destinationAccount.trim().length < 4) {
      throw new ValidationError('Valid card or account number is required');
    }

    return await db.transaction(async (tx) => {
      const [wallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .for('update');

      if (!wallet || wallet.balanceTiyn < amountTiyn) {
        throw new ValidationError('Insufficient wallet balance for withdrawal');
      }

      const newBalance = wallet.balanceTiyn - amountTiyn;
      const now = new Date();

      await tx
        .update(wallets)
        .set({
          balanceTiyn: newBalance,
          updatedAt: now,
        })
        .where(eq(wallets.id, wallet.id));

      const [txRecord] = await tx
        .insert(transactions)
        .values({
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amountTiyn,
          feeTiyn: 0,
          providerPaymentId: `${destinationType}:${destinationAccount.slice(-4)}`,
          status: 'SUCCESS',
          createdAt: now,
        })
        .returning();

      return {
        transactionId: txRecord.id,
        withdrawnAmountTiyn: amountTiyn,
        remainingBalanceTiyn: newBalance,
        destination: `${destinationType} (•••• ${destinationAccount.slice(-4)})`,
      };
    });
  }

  static async getInvoiceForOrder(orderId: string) {
    const [inv] = await db
      .select()
      .from(paymentInvoices)
      .where(eq(paymentInvoices.orderId, orderId))
      .limit(1);
    return inv || null;
  }
}
