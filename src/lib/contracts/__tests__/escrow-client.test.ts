/**
 * @jest-environment node
 *
 * Unit tests for EscrowClient replay-protection logic (issue #659).
 *
 * Covers:
 * - Fresh account (sequence number) fetched before every transaction
 * - Transactions built with setTimeout (maxTime = now + 30 s)
 * - Simulation failure on bad sequence triggers a single retry with refreshed account
 */

import { EscrowClient } from "../escrow-client";

// ─── Mock @stellar/stellar-sdk ────────────────────────────────────────────────
// jest.mock is hoisted, so the factory must not reference variables defined
// outside it. We use jest.fn() inline and retrieve references afterward.

jest.mock("@stellar/stellar-sdk", () => {
  const mockBuilderInstance = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: () => "mock-xdr" }),
  };
  return {
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest.fn(),
        simulateTransaction: jest.fn(),
        sendTransaction: jest.fn(),
        getTransaction: jest.fn(),
      })),
      Api: {
        isSimulationError: jest.fn(),
        GetTransactionStatus: { NOT_FOUND: "NOT_FOUND", FAILED: "FAILED", SUCCESS: "SUCCESS" },
      },
      assembleTransaction: jest.fn().mockReturnValue({
        build: jest.fn().mockReturnValue({ toXDR: () => "assembled-xdr" }),
      }),
    },
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue("mock-operation"),
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => mockBuilderInstance),
    Networks: { TESTNET: "Test SDF Network", PUBLIC: "Public Global Stellar Network" },
    BASE_FEE: "100",
    Address: jest.fn().mockImplementation((v: string) => ({ toScVal: () => `scval:${v}` })),
    nativeToScVal: jest.fn((v: unknown) => `scval:${v}`),
    scValToNative: jest.fn((v: unknown) => v),
    xdr: { ScVal: {} },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { rpc as SorobanRpc, TransactionBuilder } from "@stellar/stellar-sdk";

const MOCK_ACCOUNT = { id: "GSOURCE", sequenceNumber: () => "100" };

function makeClient(): EscrowClient {
  return new EscrowClient({
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network",
    contractId: "CCONTRACT",
    sourcePublicKey: "GSOURCE",
  });
}

function getRpcInstance() {
  // EscrowClient creates a new Server on construction; get the last instance
  const ServerMock = SorobanRpc.Server as jest.MockedClass<typeof SorobanRpc.Server>;
  return ServerMock.mock.results[ServerMock.mock.results.length - 1].value as {
    getAccount: jest.Mock;
    simulateTransaction: jest.Mock;
  };
}

function successSim() {
  return { result: { retval: { vec: () => [{}, {}, {}, {}] } } };
}

function seqErrorSim() {
  return { error: "txBadSeq: bad sequence number" };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe("EscrowClient replay protection — fresh sequence number", () => {
  it("buildClaim calls getAccount before building", async () => {
    const client = makeClient();
    const rpc = getRpcInstance();
    rpc.getAccount.mockResolvedValue(MOCK_ACCOUNT);
    (SorobanRpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);
    rpc.simulateTransaction.mockResolvedValue(successSim());

    await client.buildClaim();

    expect(rpc.getAccount).toHaveBeenCalledWith("GSOURCE");
  });

  it("buildSetAdmin calls getAccount before building", async () => {
    const client = makeClient();
    const rpc = getRpcInstance();
    rpc.getAccount.mockResolvedValue(MOCK_ACCOUNT);
    (SorobanRpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);
    rpc.simulateTransaction.mockResolvedValue(successSim());

    await client.buildSetAdmin("GNEWADMIN");

    expect(rpc.getAccount).toHaveBeenCalledWith("GSOURCE");
  });

  it("buildInitialize calls getAccount before building", async () => {
    const client = makeClient();
    const rpc = getRpcInstance();
    rpc.getAccount.mockResolvedValue(MOCK_ACCOUNT);
    (SorobanRpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);
    rpc.simulateTransaction.mockResolvedValue(successSim());

    await client.buildInitialize(
      "GADMIN", "gift-1", "GSENDER", "GRECIPIENT", "CTOKEN",
      BigInt(1_000_000), BigInt(Math.floor(Date.now() / 1000) + 3600)
    );

    expect(rpc.getAccount).toHaveBeenCalledWith("GSOURCE");
  });
});

describe("EscrowClient replay protection — time bounds", () => {
  it("uses setTimeout(30) ensuring maxTime = now + 30 s", async () => {
    const client = makeClient();
    const rpc = getRpcInstance();
    rpc.getAccount.mockResolvedValue(MOCK_ACCOUNT);
    (SorobanRpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);
    rpc.simulateTransaction.mockResolvedValue(successSim());

    await client.buildClaim();

    const builderInstance = (TransactionBuilder as jest.Mock).mock.results.slice(-1)[0].value;
    expect(builderInstance.setTimeout).toHaveBeenCalledWith(30);
  });
});

describe("EscrowClient replay protection — sequence retry", () => {
  it("retries once when simulation returns a bad-seq error", async () => {
    const client = makeClient();
    const rpc = getRpcInstance();
    rpc.getAccount.mockResolvedValue(MOCK_ACCOUNT);

    const isSimError = SorobanRpc.Api.isSimulationError as jest.Mock;
    isSimError
      .mockReturnValueOnce(true)   // first sim → error
      .mockReturnValueOnce(false); // retry sim → success

    rpc.simulateTransaction
      .mockResolvedValueOnce(seqErrorSim()) // first attempt
      .mockResolvedValueOnce(successSim()); // retry

    const xdr = await client.buildClaim();

    // getAccount called twice: initial fetch + sequence refresh
    expect(rpc.getAccount).toHaveBeenCalledTimes(2);
    // simulateTransaction called twice: first attempt + retry
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(2);
    expect(xdr).toBe("assembled-xdr");
  });

  it("throws if second simulation also fails", async () => {
    const client = makeClient();
    const rpc = getRpcInstance();
    rpc.getAccount.mockResolvedValue(MOCK_ACCOUNT);

    (SorobanRpc.Api.isSimulationError as jest.Mock).mockReturnValue(true);
    rpc.simulateTransaction.mockResolvedValue(seqErrorSim());

    await expect(client.buildClaim()).rejects.toThrow();
  });

  it("does not retry on non-sequence simulation errors", async () => {
    const client = makeClient();
    const rpc = getRpcInstance();
    rpc.getAccount.mockResolvedValue(MOCK_ACCOUNT);

    const isSimError = SorobanRpc.Api.isSimulationError as jest.Mock;
    isSimError.mockReturnValueOnce(true);
    rpc.simulateTransaction.mockResolvedValueOnce({ error: "Error(Contract, #3)" });

    await expect(client.buildClaim()).rejects.toThrow();

    // Only one getAccount + one simulateTransaction — no retry for contract errors
    expect(rpc.getAccount).toHaveBeenCalledTimes(1);
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(1);
  });
});
