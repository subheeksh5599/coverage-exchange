#!/usr/bin/env bash
# Verify every deployed contract on the CC3 testnet explorer (Blockscout).
#
# Foundry has no built-in explorer mapping for chain 102031, and Blockscout accepts verification
# without an API key, so the verifier URL is passed explicitly and the key is left empty.
# Run from the repository root: bash contracts/script/verify-on-explorer.sh
set -uo pipefail

: "${CC3_TESTNET_RPC_URL:=https://rpc.cc3-testnet.creditcoin.network}"
export CC3_EXPLORER_API_KEY="${CC3_EXPLORER_API_KEY:-}"

EXPLORER_API="${EXPLORER_API:-https://creditcoin-testnet.blockscout.com/api}"
EXPLORER="${EXPLORER:-https://creditcoin-testnet.blockscout.com}"

# address:ContractName:constructor-args (abi-encoded, empty when the constructor takes none)
TARGETS=(
  "0x7bde1e22355677cf4ac461fec92f534dda2117b7:DemoToken:"
  "0x5800fe651f37fc22ba0ce5e5b407c0b88a59ca63:AttestcoinAdapter:"
  "0xca5e3b0076673cd64a1655221305e66f2056d2bb:CoverageEngine:0x0000000000000000000000007bde1e22355677cf4ac461fec92f534dda2117b70000000000000000000000005800fe651f37fc22ba0ce5e5b407c0b88a59ca63"
  "0xb4569dc8827a8e573f2bb34b7f68a7ecf078b0e1:CoverageMarket:0x0000000000000000000000007bde1e22355677cf4ac461fec92f534dda2117b7000000000000000000000000ca5e3b0076673cd64a1655221305e66f2056d2bb"
  "0x5218279fd26e9b544c27e21acb1bfc9e325a5937:ChallengeManager:0x0000000000000000000000005800fe651f37fc22ba0ce5e5b407c0b88a59ca63000000000000000000000000ca5e3b0076673cd64a1655221305e66f2056d2bb"
  "0xf6931e84078c7fffc4f24c18bb15850ce7a1d967:LendingAdapter:0x0000000000000000000000007bde1e22355677cf4ac461fec92f534dda2117b7000000000000000000000000ca5e3b0076673cd64a1655221305e66f2056d2bb"
  "0x52a200d46c73695c746c31d76f9150a22c20fca1:predicates/ProhibitedRecipient:"
  "0xba7469150da333bb8d2848e1a86aa80c212011ef:predicates/AmountAboveLimit:"
  "0x6728d18271470ea888ae23df99fcf4a70f3a3b2b:predicates/AmountBelowFloor:"
)

cd "$(dirname "$0")/.." || exit 1
ok=0
for entry in "${TARGETS[@]}"; do
  addr="${entry%%:*}"; rest="${entry#*:}"; path="${rest%%:*}"; name="${path##*/}"; args="${rest#*:}"
  printf '%-22s %s  ' "$name" "$addr"
  out=$(FOUNDRY_PROFILE=live forge verify-contract "$addr" "src/${path}.sol:${name}" \
        --verifier blockscout --verifier-url "$EXPLORER_API" \
        --compiler-version 0.8.30 --num-of-optimizations 200 \
        ${args:+--constructor-args "$args"} 2>&1)
  if grep -qE "Response: .OK.|already verified|GUID:" <<<"$out"; then
    echo "submitted"
    ok=$((ok + 1))
  else
    echo "FAILED: $(tail -2 <<<"$out" | tr '\n' ' ')"
  fi
done

echo
echo "submitted $ok/${#TARGETS[@]}. Status is polled separately (verification is asynchronous):"
echo "  $EXPLORER/address/<address>#code"
