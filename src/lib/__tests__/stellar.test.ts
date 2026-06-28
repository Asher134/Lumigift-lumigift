// src/lib/__tests__/stellar.test.ts
import { loadAccount, getUsdcBalance, sendUsdcPayment, establishUsdcTrustline } from '@/lib/stellar';
import { serverConfig } from '@/server/config';

jest.mock('@/server/config', () => ({
  serverConfig: {
    stellar: {
      horizonUrl: 'https://horizon-testnet.stellar.org',
      serverSecretKey: 'SC_SECRET',
      network: 'testnet'
    },
    usdc: {
      assetCode: 'USDC',
      issuer: 'GUSDCISSUER'
    }
  }
}));

// Mock the Stellar SDK
jest.mock('@stellar/stellar-sdk', () => {
  const mockLoadAccount = jest.fn();
  const mockSubmitTransaction = jest.fn();
  const Server = jest.fn().mockImplementation(() => ({
    loadAccount: mockLoadAccount,
    submitTransaction: mockSubmitTransaction,
  }));
  const Keypair = {
    fromSecret: jest.fn((secret) => {
      if (secret === 'invalid') throw new Error('Invalid secret');
      return { publicKey: () => 'G' + secret };
    }),
    fromPublicKey: jest.fn((pk) => {
      if (pk === 'invalid') throw new Error('Invalid PK');
      return { publicKey: () => pk };
    })
  };
  const Asset = jest.fn();
  const TransactionBuilder = jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      sign: jest.fn(),
      toXDR: jest.fn().mockReturnValue('signed-xdr')
    })
  }));
  const Operation = {
    payment: jest.fn((params) => params)
  };
  const BASE_FEE = 100;
  const Networks = { PUBLIC: 'Public Global Network', TESTNET: 'Test Network' };

  return {
    Horizon: { Server },
    Keypair,
    Asset,
    TransactionBuilder,
    Operation,
    BASE_FEE,
    Networks,
    __esModule: true,
  };
});

const { Horizon } = require('@stellar/stellar-sdk');

describe('stellar.ts integration functions', () => {
  const mockServerInstance = new Horizon.Server();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loadAccount returns proper shape', async () => {
    const fakeAccount = {
      sequence: '12345',
      balances: [
        { asset_type: 'native', balance: '100.0' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GUSDCISSUER', balance: '42.5' },
      ]
    };
    mockServerInstance.loadAccount.mockResolvedValue(fakeAccount);

    const result = await loadAccount('GABC');
    expect(result).toEqual({
      publicKey: 'GABC',
      sequence: '12345',
      balances: [
        { assetCode: 'XLM', assetIssuer: undefined, balance: '100.0' },
        { assetCode: 'USDC', assetIssuer: 'GUSDCISSUER', balance: '42.5' }
      ]
    });
    expect(mockServerInstance.loadAccount).toHaveBeenCalledWith('GABC');
  });

  test('getUsdcBalance returns the USDC balance when present', async () => {
    const fakeAccount = {
      balances: [
        { asset_type: 'native', balance: '100.0' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GUSDCISSUER', balance: '13.37' }
      ]
    };
    mockServerInstance.loadAccount.mockResolvedValue(fakeAccount);
    const bal = await getUsdcBalance('GDEF');
    expect(bal).toBe('13.37');
  });

  test('getUsdcBalance returns "0" when no USDC trustline', async () => {
    const fakeAccount = { balances: [{ asset_type: 'native', balance: '5' }] };
    mockServerInstance.loadAccount.mockResolvedValue(fakeAccount);
    const bal = await getUsdcBalance('GXYZ');
    expect(bal).toBe('0');
  });

  test('getUsdcBalance returns "0" on loadAccount error (network timeout)', async () => {
    mockServerInstance.loadAccount.mockRejectedValue(new Error('Timeout'));
    const bal = await getUsdcBalance('GXYZ');
    expect(bal).toBe('0');
  });

  test('sendUsdcPayment successful flow', async () => {
    // mock loadAccount for the server escrow account
    mockServerInstance.loadAccount.mockResolvedValue({});
    // mock submitTransaction to return a hash
    mockServerInstance.submitTransaction.mockResolvedValue({ hash: 'txhash123' });
    const result = await sendUsdcPayment('GRECIPIENT', '10.0');
    expect(result).toBe('txhash123');
    expect(mockServerInstance.loadAccount).toHaveBeenCalled();
    expect(mockServerInstance.submitTransaction).toHaveBeenCalled();
  });

  test('sendUsdcPayment throws on insufficient balance', async () => {
    mockServerInstance.loadAccount.mockResolvedValue({});
    mockServerInstance.submitTransaction.mockRejectedValue(new Error('insufficient balance'));
    await expect(sendUsdcPayment('GRECIPIENT', '1000')).rejects.toThrow('insufficient balance');
  });

  test('establishUsdcTrustline successful transaction', async () => {
    const mockKeypair = { publicKey: () => 'GKEY', };
    const { Keypair } = require('@stellar/stellar-sdk');
    Keypair.fromSecret.mockReturnValue(mockKeypair);
    mockServerInstance.loadAccount.mockResolvedValue({});
    mockServerInstance.submitTransaction.mockResolvedValue({ hash: 'trusthash' });
    const hash = await establishUsdcTrustline('SSECRET');
    expect(hash).toBe('trusthash');
    expect(Keypair.fromSecret).toHaveBeenCalledWith('SSECRET');
  });
});
