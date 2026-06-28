import { Queue, Worker, Job } from "bullmq";
import { processExpiries, processUnlocks, processScheduledNotifications } from "@/server/services/scheduler.service";
import { logger } from "@/lib/logger";

export const SCHEDULER_QUEUE = "scheduler-queue";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  password: process.env.REDIS_PASSWORD,
};

let _queue: Queue | null = null;

export function getSchedulerQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(SCHEDULER_QUEUE, {
      connection: redisConnection,
    });
  }
  return _queue;
}

/**
 * Initializes the scheduler by adding repeatable jobs.
 * - processExpiries: daily at midnight UTC
 * - processUnlocks: every minute
 * - processScheduledNotifications: every minute
 */
export async function initScheduler(): Promise<void> {
  const queue = getSchedulerQueue();

  // processExpiries: daily at midnight UTC
  await queue.add("processExpiries", {}, {
    repeat: { pattern: "0 0 * * *" },
    jobId: "daily-expiry",
  });

  // processUnlocks: every minute
  await queue.add("processUnlocks", {}, {
    repeat: { pattern: "* * * * *" },
    jobId: "minute-unlock",
  });

  // processScheduledNotifications: every minute
  await queue.add("processScheduledNotifications", {}, {
    repeat: { pattern: "* * * * *" },
    jobId: "minute-notifications",
  });

  logger.info("Scheduler initialized with repeatable jobs");
}

export function createSchedulerWorker(): Worker {
  return new Worker(
    SCHEDULER_QUEUE,
    async (job: Job) => {
      logger.info({ jobName: job.name }, "Scheduler worker: processing job");

      switch (job.name) {
        case "processExpiries":
          await processExpiries();
          break;
        case "processUnlocks":
          await processUnlocks();
          break;
        case "processScheduledNotifications":
          await processScheduledNotifications();
          break;
        default:
          logger.warn({ jobName: job.name }, "Unknown job name in scheduler queue");
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  );
}
