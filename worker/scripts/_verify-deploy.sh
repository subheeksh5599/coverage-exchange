#!/usr/bin/env bash
# Verify what actually landed on CC3 after the deploy attempt.
set -u
RPC=https://rpc.cc3-testnet.creditcoin.network

declare -A A=(
  [DemoToken]=0x52474e7bf6d210775c1d5051f2141b0242387e31
  [AttestcoinAdapter]=0x85bc11a15c2c6387590f16c32683bc92d8254d25
  [CoverageEngine]=0x134476ff6d5efb0b422dcd3b92dcd61413880d92
  [CoverageMarket]=0x6e7104ca5c114dd8b2656a4ae3b138b7ea81d5a6
  [ChallengeManager]=0xba898a248e478976b2513b6ae1adde2fb498b451
  [LendingAdapter]=0x0030b013cc9fa3c49fd62306ce679d1419beadfb
  [OfferRegistry]=0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b
  [ProhibitedRecipient]=0xe84561ffa91c067823abb8d713c5a41eb13b1412
  [AmountAboveLimit]=0xf4dbf50c5d00607a9fb0fb357ca4b8ab558e38cf
  [AmountBelowFloor]=0x954af4f87c623a103d76cab64ece21e808f38dcd
)

echo "=== does each address actually have code? ==="
for k in "${!A[@]}"; do
  code=$(cast code "${A[$k]}" --rpc-url "$RPC" 2>/dev/null)
  n=$(( ${#code} / 2 ))
  if [ "$n" -le 1 ]; then
    printf "  %-22s %s  NO CODE\n" "$k" "${A[$k]}"
  else
    printf "  %-22s %s  %d bytes\n" "$k" "${A[$k]}" "$n"
  fi
done

echo
echo "=== tx statuses for the two reported failures ==="
for h in 0x3bfdf01b798b64c45f05d8ef03be79c64a3f31a65795dcd60e8ff958cf54998e \
         0x09d166704530e90ed8cee5932e6094790a64dbc22622e7d1538e8e454e2e07ac; do
  r=$(cast receipt "$h" --rpc-url "$RPC" --json 2>/dev/null)
  if [ -z "$r" ]; then
    echo "  ${h:0:20}…  NO RECEIPT (never mined / dropped)"
  else
    echo "  ${h:0:20}…  $(echo "$r" | python3 -c "import json,sys;d=json.load(sys.stdin);print('status',hex(int(d['status'],16)),'block',int(d['blockNumber'],16),'gasUsed',int(d['gasUsed'],16))")"
  fi
done

echo
echo "=== wiring state ==="
ENG=0x134476ff6d5efb0b422dcd3b92dcd61413880d92
MKT=0x6e7104ca5c114dd8b2656a4ae3b138b7ea81d5a6
REG=0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b
echo "  engine.market()          $(cast call $ENG 'market()(address)' --rpc-url $RPC 2>/dev/null)"
echo "  engine.challengeManager()$(cast call $ENG 'challengeManager()(address)' --rpc-url $RPC 2>/dev/null)"
echo "  engine.lendingAdapter()  $(cast call $ENG 'lendingAdapter()(address)' --rpc-url $RPC 2>/dev/null)"
echo "  market.offerRegistry()   $(cast call $MKT 'offerRegistry()(address)' --rpc-url $RPC 2>/dev/null)"
echo "  registry.market()        $(cast call $REG 'market()(address)' --rpc-url $RPC 2>/dev/null)"
echo
echo "  expected market    $MKT"
echo "  expected registry  $REG"
