#!/usr/bin/env bash
# ALICE has 30,000 deposited but two filled offers locked 12,000 each, leaving 6,000 free.
# Offer #3 needs a 12,000 bond, so the engine refuses it with InsufficientFreeBalance. Top her up.
set -euo pipefail
RPC=https://rpc.cc3-testnet.creditcoin.network
ENVF=~/coverage-exchange/.env
PK=$(grep '^ALICE_PRIVATE_KEY=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"' \r')
ADDR=$(cast wallet address --private-key "$PK")
TOK=0x52474e7bf6d210775c1d5051f2141b0242387e31
ENG=0x134476ff6d5efb0b422dcd3b92dcd61413880d92

echo "alice        $ADDR"
echo "free before  $(cast call $ENG 'freeBalance(address)(uint256)' "$ADDR" --rpc-url $RPC)"

for call in "faucet(address,uint256) $ADDR 50000000000" \
            "approve(address,uint256) $ENG 50000000000"; do
  set -- $call; sig=$1; shift
  cast send "$TOK" "$sig" "$@" --private-key "$PK" --rpc-url "$RPC" --gas-limit 200000 \
    2>&1 | grep -E "^status" | sed 's/^/  /'
done

cast send "$ENG" "deposit(uint256)" 30000000000 --private-key "$PK" --rpc-url "$RPC" --gas-limit 300000 \
  2>&1 | grep -E "^(status|transactionHash)" | sed 's/^/  /'

echo "free after   $(cast call $ENG 'freeBalance(address)(uint256)' "$ADDR" --rpc-url $RPC)"
