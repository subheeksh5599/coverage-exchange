#!/usr/bin/env bash
# Verify OfferRegistry, then poll the explorer until every contract reports verified.
set -u
cd ~/coverage-exchange/contracts
export CC3_EXPLORER_API_KEY="${CC3_EXPLORER_API_KEY:-blockscout-no-key-required}"
export FOUNDRY_PROFILE=live
VURL=https://creditcoin-testnet.blockscout.com/api

REG=0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b

printf "%-24s " "OfferRegistry"
out=$(forge verify-contract "$REG" "src/OfferRegistry.sol:OfferRegistry" \
    --verifier blockscout --verifier-url "$VURL" --chain 102031 --watch 2>&1)
echo "$out" | grep -qiE "successfully verified|already verified" && echo "VERIFIED" || {
  echo "FAILED"; echo "$out" | grep -iE "error|fail|reason" | head -2 | sed 's/^/    /'; }

echo
echo "=== polling the explorer (Blockscout indexes verification with a delay) ==="
CONTRACTS="DemoToken:0x52474e7bf6d210775c1d5051f2141b0242387e31
AttestcoinAdapter:0x85bc11a15c2c6387590f16c32683bc92d8254d25
CoverageEngine:0x134476ff6d5efb0b422dcd3b92dcd61413880d92
CoverageMarket:0x6e7104ca5c114dd8b2656a4ae3b138b7ea81d5a6
ChallengeManager:0xba898a248e478976b2513b6ae1adde2fb498b451
LendingAdapter:0x0030b013cc9fa3c49fd62306ce679d1419beadfb
OfferRegistry:0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b
ProhibitedRecipient:0xe84561ffa91c067823abb8d713c5a41eb13b1412
AmountAboveLimit:0xf4dbf50c5d00607a9fb0fb357ca4b8ab558e38cf
AmountBelowFloor:0x954af4f87c623a103d76cab64ece21e808f38dcd"

for attempt in 1 2 3 4 5 6; do
  ok=0; total=0; out=""
  while IFS=':' read -r n a; do
    total=$((total+1))
    v=$(curl -s -m 25 "https://creditcoin-testnet.blockscout.com/api?module=contract&action=getsourcecode&address=$a" \
        | python3 -c "import json,sys
try:
  d=json.load(sys.stdin)['result'][0]
  print('ok' if d.get('SourceCode') else 'no')
except Exception: print('no')" 2>/dev/null)
    [ "$v" = "ok" ] && ok=$((ok+1)) || out="$out $n"
    sleep 1
  done <<< "$CONTRACTS"
  echo "  attempt $attempt: $ok / $total verified${out:+   pending:$out}"
  [ "$ok" -eq "$total" ] && break
  sleep 25
done
