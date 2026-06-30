import { NextRequest, NextResponse } from "next/server";
import { contributeSchema } from "@/types/schemas";
import { initiateContribution } from "@/server/services/group-gift.service";
import { withErrorHandler, withCsrf, createErrorResponse } from "@/server/middleware";
import { getCorrelationId } from "@/lib/logger";
import type { ApiResponse, GroupContribution } from "@/types";

export const POST = withErrorHandler(
  withCsrf(async (req: NextRequest, context: any) => {
    const correlationId = getCorrelationId(req.headers);
    const { id } = await context.params;

    const body = await req.json().catch(() => ({}));
    const parsed = contributeSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues[0].message,
        correlationId,
        400
      );
    }

    const { contribution, paymentUrl } = await initiateContribution(id, parsed.data);

    return NextResponse.json<
      ApiResponse<{ contribution: GroupContribution; paymentUrl: string }>
    >(
      { success: true, data: { contribution, paymentUrl } },
      { status: 201 }
    );
  })
);
