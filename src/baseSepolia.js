import { env } from './env.js';

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const DEFAULT_BASE_SEPOLIA_RPC_URL = 'https://sepolia.base.org';
export const DEFAULT_BASE_SEPOLIA_WALLET_ADDRESS = '0xD0c7ac431D98e47230EF86E3391128D3aD0C6b13';

export function getBaseSepoliaConfig() {
  return {
    networkKey: 'base-sepolia',
    networkName: 'Base Sepolia',
    chainId: env.baseSepolia.chainId,
    rpcUrl: env.baseSepolia.rpcUrl || DEFAULT_BASE_SEPOLIA_RPC_URL,
    explorerUrl: env.baseSepolia.explorerUrl || 'https://sepolia-explorer.base.org',
    walletAddress: env.baseSepolia.walletAddress || DEFAULT_BASE_SEPOLIA_WALLET_ADDRESS
  };
}

export async function readBaseSepoliaBalance({ rpcUrl, walletAddress, expectedChainId }) {
  assertAddress(walletAddress);

  const [chainIdHex, blockNumberHex, balanceWeiHex] = await Promise.all([
    rpc(rpcUrl, 'eth_chainId'),
    rpc(rpcUrl, 'eth_blockNumber'),
    rpc(rpcUrl, 'eth_getBalance', [walletAddress, 'latest'])
  ]);

  const chainId = Number(BigInt(chainIdHex));
  if (expectedChainId && chainId !== expectedChainId) {
    throw new Error(`RPC chain mismatch: expected ${expectedChainId}, received ${chainId}`);
  }

  const balanceWei = BigInt(balanceWeiHex).toString();

  return {
    chainId,
    blockNumber: Number(BigInt(blockNumberHex)),
    balanceWei,
    balanceEth: formatWeiAsEth(balanceWei)
  };
}

async function rpc(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    }),
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `RPC request failed with ${response.status}`);
  }

  return body.result;
}

function assertAddress(address) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('Invalid Base Sepolia wallet address');
  }
}

function formatWeiAsEth(value) {
  const wei = BigInt(value);
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
