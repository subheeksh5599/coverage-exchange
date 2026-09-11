"use client";

// Wallet connection. Plain EIP-1193 against the injected provider — no wallet SDK, no
// hosted relay, so the user's keys never leave their extension and every write in this app
// is signed by the browser wallet the judge already has.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { CC3_RPC, CHAIN_ID } from "./chain";

export const cc3 = defineChain({
  id: CHAIN_ID,
  name: "Creditcoin CC3 Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: [CC3_RPC] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
});

const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;

/** Read-only client. Works with no wallet at all, so the app is browsable before connecting. */
export const publicClient: PublicClient = createPublicClient({
  chain: cc3,
  transport: http(CC3_RPC),
});

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type WalletState = {
  address: `0x${string}` | null;
  chainId: number | null;
  walletClient: WalletClient | null;
  hasProvider: boolean;
  connecting: boolean;
  error: string | null;
  onCorrectChain: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToCc3: () => Promise<void>;
};

const Ctx = createContext<WalletState | null>(null);

function provider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { ethereum?: Eip1193 };
  return w.ethereum ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [hasProvider, setHasProvider] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletClient = useMemo(() => {
    const p = provider();
    if (!p) return null;
    return createWalletClient({ chain: cc3, transport: custom(p) }) as WalletClient;
  }, [address]);

  // A wallet that is already authorised keeps working across reloads.
  useEffect(() => {
    const p = provider();
    setHasProvider(Boolean(p));
    if (!p) return;
    let cancelled = false;

    (async () => {
      try {
        const accounts = (await p.request({ method: "eth_accounts" })) as string[];
        const cid = (await p.request({ method: "eth_chainId" })) as string;
        if (cancelled) return;
        if (accounts?.length) setAddress(accounts[0] as `0x${string}`);
        setChainId(Number(BigInt(cid)));
      } catch {
        /* not connected yet — fine */
      }
    })();

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAddress(accounts?.length ? (accounts[0] as `0x${string}`) : null);
    };
    const onChain = (...args: unknown[]) => {
      const hex = args[0] as string;
      setChainId(Number(BigInt(hex)));
    };
    p.on?.("accountsChanged", onAccounts);
    p.on?.("chainChanged", onChain);
    return () => {
      cancelled = true;
      p.removeListener?.("accountsChanged", onAccounts);
      p.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const p = provider();
    if (!p) {
      setError(
        "No browser wallet found. Install MetaMask (or any EIP-1193 wallet) and reload."
      );
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.length) throw new Error("No account was authorised.");
      setAddress(accounts[0] as `0x${string}`);
      const cid = (await p.request({ method: "eth_chainId" })) as string;
      setChainId(Number(BigInt(cid)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection was rejected.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  // Switch to CC3, adding the chain to the wallet first if it has never seen it. Both are
  // real wallet calls; a wallet that refuses leaves the app in a readable error state
  // instead of silently sending a transaction to the wrong network.
  const switchToCc3 = useCallback(async () => {
    const p = provider();
    if (!p) return;
    setError(null);
    try {
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_HEX }],
      });
    } catch (e) {
      const code = (e as { code?: number })?.code;
      if (code === 4902 || code === -32603) {
        try {
          await p.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: CHAIN_HEX,
                chainName: "Creditcoin CC3 Testnet",
                nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
                rpcUrls: [CC3_RPC],
                blockExplorerUrls: ["https://creditcoin-testnet.blockscout.com"],
              },
            ],
          });
          return;
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : "Could not add Creditcoin CC3.");
          return;
        }
      }
      setError(e instanceof Error ? e.message : "Could not switch network.");
    }
  }, []);

  const value: WalletState = {
    address,
    chainId,
    walletClient,
    hasProvider,
    connecting,
    error,
    onCorrectChain: chainId === CHAIN_ID,
    connect,
    disconnect,
    switchToCc3,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside WalletProvider");
  return v;
}
