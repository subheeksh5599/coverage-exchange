// GENERATED FILE — DO NOT EDIT.
// Written by web/scripts/gen-evidence.mjs from evidence.json + worker/evidence/*.json.
// Regenerate with: npm run gen:evidence   (runs automatically on dev and build)
//
// Every value below was produced by a command in this repository. The UI has no hardcoded
// on-chain facts of its own, so it cannot drift from what was actually measured.

// Sourced from evidence.json, NOT from the clock: the output must be byte-identical for identical
// inputs, or the CI staleness gate would fail on every run and teach everyone to ignore it.
export const GENERATED_AT = "2026-09-10" as const;

export const CONTRACTS = {
  token: "0x7bde1e22355677cf4ac461fec92f534dda2117b7",
  adapter: "0x5800fe651f37fc22ba0ce5e5b407c0b88a59ca63",
  engine: "0xca5e3b0076673cd64a1655221305e66f2056d2bb",
  market: "0xb4569dc8827a8e573f2bb34b7f68a7ecf078b0e1",
  challengeManager: "0x5218279fd26e9b544c27e21acb1bfc9e325a5937",
  lendingAdapter: "0xf6931e84078c7fffc4f24c18bb15850ce7a1d967",
  predicateProhibitedRecipient: "0x52a200d46c73695c746c31d76f9150a22c20fca1",
  predicateAmountAboveLimit: "0xba7469150da333bb8d2848e1a86aa80c212011ef",
  predicateAmountBelowFloor: "0x6728d18271470ea888ae23df99fcf4a70f3a3b2b",
} as const;

export const EXPLORER_ADDRESS = "https://creditcoin-testnet.blockscout.com/address/" as const;
export const EXPLORER_TX = "https://creditcoin-testnet.blockscout.com/tx/" as const;

export const DEMO_TXS = {
  underwriterDeposit: "0xf22e94ab103c1f2592aaec814ea4aa57719165b4e59d788c176ef58233e68189",
  liquidityDeposit: "0x21b7a644a2211c0a329880fa9b162cf077ef1e8dcf15addda646587706cf05d8",
  purchase: "0x1a9aece9e5b5cfea1ca86554ea6d02d73f427fdfce8ecee05b302dbb1a9ed0a5",
  draw: "0x84c5783f762076fea37d6371c9ccd9ed7a926f7ad5124333392eed819dfe87be",
  counterexample: "0x5930a7e3e29f6394839dd34c6688a501778ad2b928c6877b95a44ecdd326686f",
  secondPurchase: "0x72fca7de0c524f96a72184f521e56a5dc665ef795cd7c523502664525ecba2d6",
  repay: "0x4401c55ca230dbd3ce39ea65e280a32b33380f91b5d66aeef1bcefdc4c93ff1a",
  settlement: "0x508dc45c0a7b613813bec6f84aea4b4ca506f2b4a06fe0a7d3ebfeb78c5273b2",
  failedDrawAfterBreach: "0xb62ce5ed691e7521c2c05430c1fc8c5069d42ff649dc0db7680056df8969fbfa",
  failedReplay: "0x65a8bc7f34a90538964342617ca75cc097f7d1bc3cbdd1c6e650898cb9772be7",
} as const;

export const COVERAGE_IDS = {
  breached: "10",
  settled: "11",
} as const;

export const ATTACKS = [
  {
    "what": "draw against an unknown position",
    "err": "UnknownCoverage(999999)",
    "tx": null
  },
  {
    "what": "draw as a different counterparty",
    "err": "NotTheCounterparty()",
    "tx": null
  },
  {
    "what": "draw above the position maximum",
    "err": "CoverageNotValid(CAPACITY_EXCEEDED)",
    "tx": null
  },
  {
    "what": "underwriter withdraws the locked bond",
    "err": "InsufficientFreeBalance(2904000000000, 2904000000001)",
    "tx": null
  },
  {
    "what": "create a position with bond < exposure",
    "err": "BondBelowExposure(1000000, 10000000000)",
    "tx": null
  },
  {
    "what": "stranger calls wireModules",
    "err": "OwnableUnauthorizedAccount(0xc0443353515d8998DE0B8cA0549a6dD2E02f1130)",
    "tx": null
  },
  {
    "what": "challenge with a fabricated proof",
    "err": "Error(Merkle proof validation failed)",
    "tx": null
  },
  {
    "what": "challenge with a real proof, wrong chainKey",
    "err": "WrongChain(1, 3)",
    "tx": null
  },
  {
    "what": "challenge with a valid proof outside the window",
    "err": "BlockOutsideWindow(11671129, 11671130, 11671230)",
    "tx": null
  },
  {
    "what": "challenge with proof of a reverted source tx",
    "err": "TransactionFailed(0)",
    "tx": null
  },
  {
    "what": "replay the counterexample on a breached position",
    "err": "NotLive()",
    "tx": "0x65a8bc7f34a90538964342617ca75cc097f7d1bc3cbdd1c6e650898cb9772be7"
  },
  {
    "what": "draw against a breached position",
    "err": "CoverageNotValid(STATUS_BREACHED)",
    "tx": "0xb62ce5ed691e7521c2c05430c1fc8c5069d42ff649dc0db7680056df8969fbfa"
  },
  {
    "what": "settle a breached position",
    "err": "OutstandingExposure(10000000000)",
    "tx": null
  },
  {
    "what": "settle with exposure outstanding",
    "err": "OutstandingExposure(4000000000)",
    "tx": null
  },
  {
    "what": "re-run the one-time module wiring",
    "err": "ModulesAlreadyWired()",
    "tx": null
  }
] as const;

export const MEASURED = {
  forgeTests: 71,
  attackCount: 15,
  attacksRefused: 15,
  liveChecks: 7,
  liveChecksTotal: 7,
  deployChecks: 19,
  contractsVerified: 9,
  contractsTotal: 9,
  batchSaving5: 30.1,
  batchSaving10: 22.5,
  demoSeconds: 225,
  demoTxCount: 16,
  demoTotalGas: 2623406,
  refusedDrawGas: 195748,
  refusedReplayGas: 266336,
  gasDraw: 288092,
  gasChallenge: 396004,
  gasPurchase: 371652,
  gasSettlement: 181412,
  /** Bond seized by the challenger in the recorded demo, in whole tokens. */
  bondPaid: "12,000",
  maxExposure: "10,000",
  premium: "56",
} as const;

export const SOURCE_EVIDENCE = {
  "tx": "0x19c528d3175bfc9d7cd0b1b7285fa07113054c5585eb8dead195b977edbc88a1",
  "block": 11671180,
  "explorer": "https://sepolia.etherscan.io/tx/"
} as const;
