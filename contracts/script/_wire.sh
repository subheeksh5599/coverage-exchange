#!/usr/bin/env bash
# Complete the wiring that the forge script's failed transactions left undone.
#
# Explicit gas limits throughout: CC3's JSON-RPC omits `mixHash` on blocks, which breaks alloy's
# block parsing and therefore gas estimation. The estimator is the reason two script transactions
# reverted, so nothing here is left to estimation.
set -euo pipefail
RPC=https://rpc.cc3-testnet.creditcoin.network
PK=$(grep '^DEPLOYER_PRIVATE_KEY=' ~/coverage-exchange/.env | cut -d= -f2- | tr -d '"'"'"' \r')
FROM=$(cast wallet address --private-key "$PK")

ENG=0x134476ff6d5efb0b422dcd3b92dcd61413880d92
MKT=0x6e7104ca5c114dd8b2656a4ae3b138b7ea81d5a6
CHAL=0xba898a248e478976b2513b6ae1adde2fb498b451
LEND=0x0030b013cc9fa3c49fd62306ce679d1419beadfb
REG=0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b

echo "from: $FROM"
echo

echo "market.owner() -> $(cast call $MKT 'owner()(address)' --rpc-url $RPC)"
echo

# 1. wireModules — engine slots are all zero, so this is legal (it reverts if any is already set)
echo "=== engine.wireModules(market, challengeManager, lendingAdapter) ==="
cast send "$ENG" "wireModules(address,address,address)" "$MKT" "$CHAL" "$LEND" \
  --private-key "$PK" --rpc-url "$RPC" --gas-limit 600000 2>&1 | grep -E "^(status|transactionHash|gasUsed)" || true

echo
echo "=== market.setOfferRegistry(registry) ==="
cast send "$MKT" "setOfferRegistry(address)" "$REG" \
  --private-key "$PK" --rpc-url "$RPC" --gas-limit 300000 2>&1 | grep -E "^(status|transactionHash|gasUsed)" || true

echo
echo "=== verify ==="
echo "  engine.market           $(cast call $ENG 'market()(address)' --rpc-url $RPC)"
echo "  engine.challengeManager $(cast call $ENG 'challengeManager()(address)' --rpc-url $RPC)"
echo "  engine.lendingAdapter   $(cast call $ENG 'lendingAdapter()(address)' --rpc-url $RPC)"
echo "  market.offerRegistry    $(cast call $MKT 'offerRegistry()(address)' --rpc-url $RPC)"
echo "  registry.market         $(cast call $REG 'market()(address)' --rpc-url $RPC)"
