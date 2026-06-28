import { processExpiries } from "../scheduler.service";
import pool from "../../../lib/db";
import * as giftService from "../gift.service";
import * as stellarLib from "../../../lib/stellar";
import * as smsLib from "../../../lib/sms";

// Mocking dependencies
jest.mock("../../../lib/db");
jest.mock("../gift.service");
jest.mock("../../../lib/stellar");
jest.mock("../../../lib/sms");

describe("processExpiries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should process expired gifts and initiate refunds", async () => {
    const mockGifts = [
      {
        id: "gift-1",
        amount_usdc: "10.0000000",
        sender_phone: "+2348012345678",
        sender_stellar_key: "GABC...",
      },
    ];

    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockGifts });
    (giftService.updateGiftStatus as jest.Mock).mockResolvedValueOnce({});
    (stellarLib.sendUsdcPayment as jest.Mock).mockResolvedValueOnce("tx-hash");
    (smsLib.sendGiftExpiredAlert as jest.Mock).mockResolvedValueOnce({});

    const processedCount = await processExpiries();

    expect(processedCount).toBe(1);
    expect(giftService.updateGiftStatus).toHaveBeenCalledWith("gift-1", "expired");
    expect(stellarLib.sendUsdcPayment).toHaveBeenCalledWith("GABC...", "10.0000000");
    expect(smsLib.sendGiftExpiredAlert).toHaveBeenCalledWith("+2348012345678", "10.0000000");
  });

  it("should skip refund if sender has no stellar key", async () => {
    const mockGifts = [
      {
        id: "gift-2",
        amount_usdc: "5.0000000",
        sender_phone: "+2348022222222",
        sender_stellar_key: null,
      },
    ];

    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockGifts });
    (giftService.updateGiftStatus as jest.Mock).mockResolvedValueOnce({});
    (smsLib.sendGiftExpiredAlert as jest.Mock).mockResolvedValueOnce({});

    const processedCount = await processExpiries();

    expect(processedCount).toBe(1);
    expect(stellarLib.sendUsdcPayment).not.toHaveBeenCalled();
    expect(smsLib.sendGiftExpiredAlert).toHaveBeenCalledWith("+2348022222222", "5.0000000");
  });
});
