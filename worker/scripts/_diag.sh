#!/usr/bin/env bash
# Ground truth: read each wiring slot directly, surfacing revert reasons instead of blanks.
set -u
RPC=https://rpc.cc3-testnet.creditcoin.network
ENG=0x134476ff6d5efb0b422dcd3b92dcd61413880d92
MKT=0x6e7104ca5c114dd8b2656a4ae3b138b7ea81d5a6
REG=0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b
LEND=0x0030b013cc9fa3c49fd62306ce679d1419beadfb
CHAL=0xba898a248e478976b2513b6ae1adde2fb498b451

probe() {
  local label="$1" addr="$2" sig="$3"
  local out
  out=$(cast call "$addr" "$sig" --rpc-url "$RPC" 2>&1)
  if echo "$out" | grep -qiE "error|revert|invalid"; then
    printf "  %-30s REVERT/ERR: %s\n" "$label" "$(echo "$out" | head -2 | tr '\n' ' ')"
  else
    printf "  %-30s %s\n" "$label" "$out"
  fi
}

echo "=== engine wiring ==="
probe "engine.market"            "$ENG" "market()(address)"
probe "engine.challengeManager"  "$ENG" "challengeManager()(address)"
probe "engine.lendingAdapter"    "$ENG" "lendingAdapter()(address)"
probe "engine.owner"             "$ENG" "owner()(address)"
probe "engine.nextTokenId?"      "$ENG" "nextCoverageId()(uint256)"

echo
echo "=== market wiring ==="
probe "market.offerRegistry"     "$MKT" "offerRegistry()(address)"

echo
echo "=== registry wiring ==="
probe "registry.market"          "$REG" "market()(address)"
probe "registry.OWNER"           "$REG" "OWNER()(address)"
probe "registry.nextOfferId"     "$REG" "nextOfferId()(uint256)"

echo
echo "=== module identity ==="
probe "lending.ENGINE"           "$LEND" "ENGINE()(address)"
probe "lending.TOKEN"            "$LEND" "TOKEN()(address)"
probe "challenge.ENGINE"         "$CHAL" "ENGINE()(address)"

echo
echo "=== deployer ==="
echo "  0xF4c5E73FAA62e2A8f4d5B8d44a8AA62811696549"
