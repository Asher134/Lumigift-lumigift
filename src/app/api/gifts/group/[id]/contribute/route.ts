import { NextRequest, NextResponse } from "next/server";
import { contributeSchema } from "@/types/schemas";
import { initiateContribution } from "@/server/services/group-gift.service";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse, GroupContribution } from "@/types";

export const POST = withErrorHandler(async (req: NextRequest, context: any) => {
  const { id } = await context.params;

  const body = await req.json().catch(() => ({}));
  const parsed = contributeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }


  const { contribution, paymentUrl } = await initiateContribution(id, parsed.data);

  return NextResponse.json<
    ApiResponse<{ contribution: GroupContribution; paymentUrl: string }>
  >(
    { success: true, data: { contribution, paymentUrl } },
    { status: 201 }
  );
});
