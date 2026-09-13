#!/usr/bin/env bash
# Deploy the full contract set (including the market layer) to CC3 testnet.
#
# The previous deployment predated OfferRegistry, so this is a full redeploy rather than an
# addition: CoverageMarket must ship with purchaseOffer/purchaseAggregated built in, because the
# deployed one does not have them and OfferRegistry alone cannot be wired into it.
set -euo pipefail
cd ~/coverage-exchange/contracts

RPC=https://rpc.cc3-testnet.creditcoin.network
DEPLOYER_PK=$(grep '^DEPLOYER_PRIVATE_KEY=' ~/coverage-exchange/.env | cut -d= -f2- | tr -d '"'"'"' \r')

if [ -z "$DEPLOYER_PK" ]; then echo "no DEPLOYER_PRIVATE_KEY in .env"; exit 1; fi

echo "deployer: $(cast wallet address --private-key "$DEPLOYER_PK")"
echo "balance : $(cast balance "$(cast wallet address --private-key "$DEPLOYER_PK")" --rpc-url "$RPC" --ether) CTC"
echo

# CC3 headers do not populate prevrandao, so the live profile pins evm_version = london.
export FOUNDRY_PROFILE=live

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" \
  --broadcast \
  --private-key "$DEPLOYER_PK" \
  -vv 2>&1 | tee /tmp/deploy-run.log | tail -40

echo
echo "=== addresses from the run ==="
grep -E "^(DemoToken|AttestcoinAdapter|CoverageEngine|CoverageMarket|ChallengeManager|LendingAdapter|OfferRegistry|ProhibitedRecipient|AmountAboveLimit|AmountBelowFloor) " /tmp/deploy-run.log || true
