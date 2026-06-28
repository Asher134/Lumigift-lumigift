import { NextResponse } from "next/server";
import { getExchangeRate } from "@/server/services/exchange-rate.service";
import { serviceLogger } from "@/lib/logger";

const logger = serviceLogger("api/exchange-rate");

/**
 * GET /api/v1/exchange-rate
 * Returns the current NGN/USDC exchange rate.
 *
 * Optional query param: ?ngn=1000
 * If provided, also returns the USDC equivalent for that amount.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const amountNgn = parseFloat(searchParams.get("ngn") ?? "0");

    const { ngnPerUsdc, stale, source, cachedAt } = await getExchangeRate();

    const response: any = {
      success: true,
      data: {
        rate: ngnPerUsdc,
        stale,
        cachedAt,
        source,
        timestamp: Date.now(),
      },
    };

    if (amountNgn > 0) {
      response.data.amountNgn = amountNgn;
      response.data.amountUsdc = parseFloat((amountNgn / ngnPerUsdc).toFixed(2));
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error fetching exchange rate", { error });
    return NextResponse.json(
      { success: false, error: "Failed to fetch exchange rate" },
      { status: 500 }
    );
  }
}
