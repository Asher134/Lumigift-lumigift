/**
 * BullMQ queue for retrying failed gift-invitation SMS sends.
 *
 * Issue #580: SMS failures in invitation.service.ts were silently dropped
 * with fire-and-forget .catch(). This queue adds:
 *   - Up to 3 attempts with exponential backoff
 *   - sms_failed_at timestamp recorded in DB after all retries exhausted
 *   - Pino error log (+ optional Sentry capture) on final failure
 */

import { Queue, Worker, Job } from "bullmq";
import { sendGiftInvitation } from "@/lib/sms";
import { logger } from "@/lib/logger";
import pool from "@/lib/db";

export const SMS_RETRY_QUEUE = "sms-retry";

export interface SmsRetryJobData {
  /** E.164-formatted recipient phone number */
  recipientPhone: string;
  /** The 64-char hex invitation token */
  invitationToken: string;
  /** Display name of the gift sender */
  senderName: string;
  /** gift_invitations.id — used to record sms_failed_at in DB */
  invitationId: string;
}

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  password: process.env.REDIS_PASSWORD,
};

// ─── Queue singleton ──────────────────────────────────────────────────────────

let _queue: Queue | null = null;

export function getSmsRetryQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(SMS_RETRY_QUEUE, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 }, // 5s, 10s, 20s
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });
  }
  return _queue;
}

/**
 * Enqueues an SMS retry job.
 * Uses a deterministic jobId so the same invitation is never queued twice.
 */
export async function enqueueSmsRetry(data: SmsRetryJobData): Promise<string> {
  const queue = getSmsRetryQueue();
  const job = await queue.add("send-invitation-sms", data, {
    jobId: `sms:${data.invitationId}`,
  });
  return job.id!;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function createSmsRetryWorker(): Worker {
  const log = logger.child({ service: "sms-retry-worker" });

  const worker = new Worker(
    SMS_RETRY_QUEUE,
    async (job: Job<SmsRetryJobData>) => {
      const { recipientPhone, invitationToken, senderName, invitationId } = job.data;

      log.info(
        { invitationId, attempt: job.attemptsMade + 1 },
        "sms-retry worker: attempting SMS send"
      );

      await sendGiftInvitation(recipientPhone, invitationToken, senderName);

      log.info({ invitationId }, "sms-retry worker: SMS sent successfully");
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;

    const isTerminal = job.attemptsMade >= (job.opts.attempts ?? 3);
    if (!isTerminal) {
      log.warn(
        { jobId: job.id, invitationId: job.data.invitationId, attempt: job.attemptsMade, err: err.message },
        "sms-retry worker: attempt failed — will retry"
      );
      return;
    }

    // All retries exhausted — record failure in DB and emit alert
    log.error(
      { jobId: job.id, invitationId: job.data.invitationId, attemptsMade: job.attemptsMade, err: err.message },
      "sms-retry worker: all retries exhausted — recording sms_failed_at"
    );

    try {
      await pool.query(
        `UPDATE gift_invitations
            SET sms_failed_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [job.data.invitationId]
      );
    } catch (dbErr) {
      log.error(
        { jobId: job.id, invitationId: job.data.invitationId, dbErr },
        "sms-retry worker: failed to write sms_failed_at to DB"
      );
    }

    // Optional Sentry capture — only imported when SENTRY_DSN is set
    if (process.env.SENTRY_DSN) {
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureException(err, {
          tags: { queue: SMS_RETRY_QUEUE },
          extra: { invitationId: job.data.invitationId, attemptsMade: job.attemptsMade },
        });
      } catch {
        // Sentry is optional — ignore import errors
      }
    }
  });

  return worker;
}
