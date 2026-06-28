import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { recordLegalAcceptance, getLatestLegalDocument } from "@/server/services/legal.service";
import { withErrorHandler, validateRequest } from "@/server/middleware";
import type { ApiResponse } from "@/types";

import { z } from "zod";

const acceptSchema = z.object({
  documentType: z.enum(["tos", "privacy"]),
});

async function handler(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const validation = validateRequest(acceptSchema, body);
  if (!validation.success) return validation.errorResponse;

  const docType = body.documentType as "tos" | "privacy";
  const doc = await getLatestLegalDocument(docType);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  await recordLegalAcceptance(session.user.id, docType, doc.version);

  return NextResponse.json<ApiResponse<{ message: string }>>({
    success: true,
    data: { message: "Acceptance recorded" },
  });
}

export const POST = withErrorHandler(handler);
