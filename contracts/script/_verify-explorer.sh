#!/usr/bin/env bash
# Verify every contract of the new deployment on Blockscout.
#
# Three things this pins down:
#   - Blockscout on CC3 accepts verification with no API key, but foundry.toml's [etherscan] entry
#     references CC3_EXPLORER_API_KEY, so the variable must exist or forge aborts before it ever
#     reaches the verifier URL.
#   - `--constructor-args` takes ABI-ENCODED hex, not a list of values. `--guess-constructor-args`
#     reads them out of the on-chain creation code instead, which is what we want.
#   - Foundry has no built-in chain mapping for 102031, so --verifier/--verifier-url are explicit.
set -u
cd ~/coverage-exchange/contracts

export CC3_EXPLORER_API_KEY="${CC3_EXPLORER_API_KEY:-blockscout-no-key-required}"
# MUST match the profile used to deploy: the live profile pins evm_version=london, and a
# default-profile build produces different bytecode that the verifier rejects.
export FOUNDRY_PROFILE=live

VURL=https://creditcoin-testnet.blockscout.com/api

TOK=0x52474e7bf6d210775c1d5051f2141b0242387e31
ADP=0x85bc11a15c2c6387590f16c32683bc92d8254d25
ENG=0x134476ff6d5efb0b422dcd3b92dcd61413880d92
MKT=0x6e7104ca5c114dd8b2656a4ae3b138b7ea81d5a6
CHAL=0xba898a248e478976b2513b6ae1adde2fb498b451
LEND=0x0030b013cc9fa3c49fd62306ce679d1419beadfb
REG=0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b
P1=0xe84561ffa91c067823abb8d713c5a41eb13b1412
P2=0xf4dbf50c5d00607a9fb0fb357ca4b8ab558e38cf
P3=0x954af4f87c623a103d76cab64ece21e808f38dcd

verify() {  # verify <label> <path> <address>
  local label="$1" path="$2" addr="$3"
  printf "%-24s " "$label"
  out=$(forge verify-contract "$addr" "$path" \
      --verifier blockscout --verifier-url "$VURL" \
      --chain 102031 --rpc-url https://rpc.cc3-testnet.creditcoin.network --guess-constructor-args --watch 2>&1)
  if echo "$out" | grep -qiE "successfully verified|already verified|is already verified"; then
    echo "VERIFIED"
  else
    echo "FAILED"
    echo "$out" | grep -iE "error|fail|reason|invalid" | head -2 | sed 's/^/    /'
  fi
}

verify "CoverageEngine"      "src/CoverageEngine.sol:CoverageEngine"       "$ENG"
verify "CoverageMarket"      "src/CoverageMarket.sol:CoverageMarket"       "$MKT"
verify "ChallengeManager"    "src/ChallengeManager.sol:ChallengeManager"   "$CHAL"
verify "LendingAdapter"      "src/LendingAdapter.sol:LendingAdapter"       "$LEND"

echo
echo "=== explorer truth: is_verified for all ten ==="
ok=0; total=0
for pair in "DemoToken:$TOK" "AttestcoinAdapter:$ADP" "CoverageEngine:$ENG" "CoverageMarket:$MKT" \
            "ChallengeManager:$CHAL" "LendingAdapter:$LEND" "OfferRegistry:$REG" \
            "ProhibitedRecipient:$P1" "AmountAboveLimit:$P2" "AmountBelowFloor:$P3"; do
  IFS=':' read -r n a <<< "$pair"
  total=$((total+1))
  v=$(curl -s -m 25 "https://creditcoin-testnet.blockscout.com/api?module=contract&action=getsourcecode&address=$a" \
      | python3 -c "import json,sys
try:
  d=json.load(sys.stdin)['result'][0]
  print('is_verified' if d.get('SourceCode') else 'NOT_VERIFIED')
except Exception: print('?')" 2>/dev/null)
  [ "$v" = "is_verified" ] && ok=$((ok+1))
  printf "  %-22s %s\n" "$n" "$v"
done
echo
echo "  $ok / $total verified"
