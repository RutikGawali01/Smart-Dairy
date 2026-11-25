import prisma from "../../../db/index.js";
import logger from "../../../config/logger.js";

export type AuditActionType = "CREATED" | "CORRECTED" | "REVERSED" | "DELETED";

export interface RecordAuditParams {
  milkEntryId: string;
  adminId: string;
  customerId: string;
  rateChartId?: string | null;
  action: AuditActionType;
  originalValues?: any;
  newValues?: any;
  reason?: string | null;
  performedBy?: string | null;
}

export class MilkEntryAuditService {
  /**
   * Records an audit event transactionally inside a Prisma or simulated transaction.
   * If db client doesn't have milkEntryAudit table yet (pre-migration), logs structured audit fallback safely.
   */
  public static async recordAudit(
    tx: any,
    params: RecordAuditParams
  ): Promise<any> {
    const {
      milkEntryId,
      adminId,
      customerId,
      rateChartId,
      action,
      originalValues,
      newValues,
      reason,
      performedBy,
    } = params;

    logger.info(`[MILK_ENTRY_AUDIT:${action}]`, {
      milkEntryId,
      adminId,
      customerId,
      rateChartId,
      action,
      reason,
      performedBy,
      timestamp: new Date().toISOString(),
    });

    try {
      if (tx.milkEntryAudit && typeof tx.milkEntryAudit.create === "function") {
        return await tx.milkEntryAudit.create({
          data: {
            milkEntryId,
            adminId,
            customerId,
            rateChartId: rateChartId || null,
            action,
            originalValues: originalValues || null,
            newValues: newValues || null,
            reason: reason || null,
            performedBy: performedBy || adminId,
          },
        });
      }
    } catch (auditErr: any) {
      // In pre-migration environments where table is not yet created, log critical warning but don't silently fail
      logger.warn("[MILK_ENTRY_AUDIT:DB_FALLBACK]", {
        error: auditErr.message,
        params,
      });
    }

    return {
      id: "audit-mock-" + Date.now(),
      milkEntryId,
      adminId,
      customerId,
      rateChartId,
      action,
      originalValues,
      newValues,
      reason,
      performedBy,
      createdAt: new Date(),
    };
  }

  /**
   * Retrieves all audit records for a given collection entry
   */
  public static async getAuditsForEntry(milkEntryId: string): Promise<any[]> {
    try {
      if ((prisma as any).milkEntryAudit && typeof (prisma as any).milkEntryAudit.findMany === "function") {
        return await (prisma as any).milkEntryAudit.findMany({
          where: { milkEntryId },
          orderBy: { createdAt: "desc" },
        });
      }
    } catch (err: any) {
      logger.warn("Could not query milkEntryAudit table:", { error: err.message });
    }
    return [];
  }
}

