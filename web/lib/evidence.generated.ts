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
  token: "0x52474e7bf6d210775c1d5051f2141b0242387e31",
  adapter: "0x85bc11a15c2c6387590f16c32683bc92d8254d25",
  engine: "0x134476ff6d5efb0b422dcd3b92dcd61413880d92",
  market: "0x6e7104ca5c114dd8b2656a4ae3b138b7ea81d5a6",
  challengeManager: "0xba898a248e478976b2513b6ae1adde2fb498b451",
  lendingAdapter: "0x0030b013cc9fa3c49fd62306ce679d1419beadfb",
  offerRegistry: "0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b",
  predicateProhibitedRecipient: "0xe84561ffa91c067823abb8d713c5a41eb13b1412",
  predicateAmountAboveLimit: "0xf4dbf50c5d00607a9fb0fb357ca4b8ab558e38cf",
  predicateAmountBelowFloor: "0x954af4f87c623a103d76cab64ece21e808f38dcd",
} as const;

export const EXPLORER_ADDRESS = "https://creditcoin-testnet.blockscout.com/address/" as const;
export const EXPLORER_TX = "https://creditcoin-testnet.blockscout.com/tx/" as const;

export const DEMO_TXS = {
  underwriterDeposit: "0xcddbcfc96dd2988c56bae036547f005cd01f35dbaf875733a83777cb96dd7fc4",
  liquidityDeposit: "0x2b7ca0955219a42b6ed4547b7916a6bf7e741df5753007a7ee3a5593c57bf8d3",
  purchase: "0x33373409bd9c0ee92f3f918896b313446c0a54b41eaa5e6d8ff48d2618416217",
  draw: "0xee7a68c5f4055832c0c552508ce2c0953dde6bf9c02baa6afdd55cd4a521ef44",
  counterexample: "0xe4b2311756815b206d308e4b4c40915c9b53655cf76a53b1a7d0a1adb456db99",
  secondPurchase: "0xce0261ff5524a7386911199e5bba767b6f7ad581f662a72b92d62b2615f2f5c2",
  repay: "0xe28ce4a4981046f3b358db2e974fdbb0a62d41a39e0201b5825535177c8d842c",
  settlement: "0x93bdf6cbbd31ec0353516773ffc316c279c1a756fd87f07e503d416d10806d15",
  failedDrawAfterBreach: "0xb62ce5ed691e7521c2c05430c1fc8c5069d42ff649dc0db7680056df8969fbfa",
  failedReplay: "0x65a8bc7f34a90538964342617ca75cc097f7d1bc3cbdd1c6e650898cb9772be7",
} as const;

export const COVERAGE_IDS = {
  breached: "3",
  settled: "4",
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
  contractsVerified: 10,
  contractsTotal: 10,
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
  "tx": "0xb231b241066865ba30aa0cd21a178a1070b31d0002768f8387625729f8626925",
  "block": 11696257,
  "explorer": "https://sepolia.etherscan.io/tx/"
} as const;
