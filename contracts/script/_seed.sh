#!/usr/bin/env bash
# Seed the NEW deployment with real market supply.
#
# Roles, kept distinct so the demo reads clearly:
#   ALICE    underwriter  -> engine capital, publishes an offer
#   DEPLOYER lender       -> pool liquidity, so a draw can actually release credit
#   BOB      borrower     -> buys the offer (done later, through the UI)
#   CAROL    challenger   -> proves the counterexample (done later)
#
# Explicit gas everywhere: CC3 omits `mixHash`, which breaks gas estimation.
set -euo pipefail
RPC=https://rpc.cc3-testnet.creditcoin.network
ENVF=~/coverage-exchange/.env

pk_of() { grep "^$1_PRIVATE_KEY=" "$ENVF" | cut -d= -f2- | tr -d '"'"'"' \r'; }
addr_of() { cast wallet address --private-key "$(pk_of "$1")"; }

TOK=0x52474e7bf6d210775c1d5051f2141b0242387e31
ENG=0x134476ff6d5efb0b422dcd3b92dcd61413880d92
MKT=0x6e7104ca5c114dd8b2656a4ae3b138b7ea81d5a6
LEND=0x0030b013cc9fa3c49fd62306ce679d1419beadfb
REG=0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b
PRED_PROHIBITED=0xe84561ffa91c067823abb8d713c5a41eb13b1412

# Sepolia USDC + the ERC-20 Transfer topic0 — the evidence the predicate evaluates
SRC=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
SIG=0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
# the prohibited recipient, left-padded to bytes32 (matches predicateParams in the demo evidence)
PARAMS=0x000000000000000000000000fe3a58a4fbd2755630e341a28006989ad08cd01d

send() {  # send <keyvar> <to> <sig> <args...>
  local who="$1" to="$2" sig="$3"; shift 3
  cast send "$to" "$sig" "$@" --private-key "$(pk_of "$who")" --rpc-url "$RPC" --gas-limit 900000 2>&1 \
    | grep -E "^(status|transactionHash)" | tr '\n' ' '
  echo
}

ALICE=$(addr_of ALICE); BOB=$(addr_of BOB); CAROL=$(addr_of CAROL); DEP=$(addr_of DEPLOYER)
echo "alice   $ALICE"
echo "bob     $BOB"
echo "carol   $CAROL"
echo "deployer $DEP"
echo

M6() { python3 -c "print(int(float('$1')*10**6))"; }

echo "=== 1. ALICE funds herself and deposits engine capital ==="
send ALICE "$TOK" "faucet(address,uint256)" "$ALICE" "$(M6 60000)"
send ALICE "$TOK" "approve(address,uint256)" "$ENG" "$(M6 60000)"
send ALICE "$ENG" "deposit(uint256)" "$(M6 30000)"
echo "  alice free capacity: $(cast call $ENG 'freeBalance(address)(uint256)' "$ALICE" --rpc-url $RPC)"

echo
echo "=== 2. DEPLOYER supplies pool liquidity (the lender side) ==="
send DEPLOYER "$TOK" "faucet(address,uint256)" "$DEP" "$(M6 60000)"
send DEPLOYER "$TOK" "approve(address,uint256)" "$LEND" "$(M6 60000)"
send DEPLOYER "$LEND" "depositLiquidity(uint256)" "$(M6 50000)"
echo "  pool total liquidity: $(cast call $LEND 'totalLiquidity()(uint256)' --rpc-url $RPC)"

echo
echo "=== 3. ALICE publishes an offer: 10,000 exposure, 12,000 bond, 100-block window ==="
send ALICE "$REG" "publishOffer(address,uint64,uint64,uint256,uint256,uint64,uint64,address,bytes32,address,bytes32,uint8)" \
  "0x0000000000000000000000000000000000000000" 1 32 "$(M6 10000)" "$(M6 12000)" 100 0 "$SRC" "$SIG" "$PRED_PROHIBITED" "$PARAMS" 0

echo
echo "=== 4. state after seeding ==="
echo "  registry.nextOfferId    $(cast call $REG 'nextOfferId()(uint256)' --rpc-url $RPC)"
echo "  registry.activeOffers   $(cast call $REG 'activeOfferCount()(uint256)' --rpc-url $RPC)"
echo "  alice free capacity     $(cast call $ENG 'freeBalance(address)(uint256)' "$ALICE" --rpc-url $RPC)"
echo "  pool total liquidity    $(cast call $LEND 'totalLiquidity()(uint256)' --rpc-url $RPC)"
echo "  engine nextCoverageId   $(cast call $ENG 'nextCoverageId()(uint256)' --rpc-url $RPC)"
