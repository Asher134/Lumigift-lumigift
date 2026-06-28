import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandler, withCsrf } from "@/server/middleware";
import { deleteUserData } from "@/server/services/user-deletion.service";
import { sendDeletionConfirmationEmail } from "@/lib/email";
import type { ApiResponse } from "@/types";

export const DELETE = withErrorHandler(
  withCsrf(async (req: NextRequest) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = (session.user as { id: string }).id;
    const userEmail = (session.user as { email?: string }).email;
    const userName = session.user.name ?? "User";
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;

    const { requestId } = await deleteUserData(userId, ip ?? undefined);

    // Send confirmation (best-effort — don't fail the request if email fails)
    if (userEmail) {
      sendDeletionConfirmationEmail(userEmail, { recipientName: userName, requestId }).catch(
        () => void 0
      );
    }

    return NextResponse.json<ApiResponse<{ requestId: string; message: string }>>({
      success: true,
      data: {
        requestId,
        message:
          "Your personal data has been deleted in compliance with NDPR/GDPR. " +
          "Financial records are retained as required by law.",
      },
    });
  })
);
