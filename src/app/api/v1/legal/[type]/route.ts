import { NextRequest, NextResponse } from "next/server";
import { getLatestLegalDocument } from "@/server/services/legal.service";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
): Promise<NextResponse> {
  const { type } = await params;
  const docType = type as "tos" | "privacy";

  if (!["tos", "privacy"].includes(docType)) {
    return NextResponse.json({ success: false, error: "Invalid document type" }, { status: 400 });
  }

  const doc = await getLatestLegalDocument(docType);

  if (!doc) {
    return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json<ApiResponse<{ version: string; content: string }>>({
    success: true,
    data: { version: doc.version, content: doc.content },
  });
}

export const GET = withErrorHandler(handler);
