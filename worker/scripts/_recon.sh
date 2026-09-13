#!/usr/bin/env bash
set -u
cd ~/coverage-exchange
RPC=https://rpc.cc3-testnet.creditcoin.network

echo "=== which *_PRIVATE_KEY / *_ADDRESS vars exist ==="
grep -oE '^[A-Z_]+_(PRIVATE_KEY|ADDRESS)=' .env | sort -u

echo
echo "=== address for each key var, and its CC3 balance ==="
for name in $(grep -oE '^[A-Z_]+_PRIVATE_KEY=' .env | sed 's/_PRIVATE_KEY=//' | sort -u); do
  pk=$(grep "^${name}_PRIVATE_KEY=" .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
  if [ -z "$pk" ]; then echo "  $name: (empty)"; continue; fi
  a=$(cast wallet address --private-key "$pk" 2>/dev/null)
  if [ -z "$a" ]; then echo "  $name: (bad key)"; continue; fi
  b=$(cast balance "$a" --rpc-url "$RPC" --ether 2>/dev/null)
  printf "  %-22s %s  %s CTC\n" "$name" "$a" "$b"
done

echo
echo "=== the deployer key file ==="
if [ -f ~/coverexchange-deployer.key ]; then
  a=$(cast wallet address --private-key "$(cat ~/coverexchange-deployer.key | tr -d ' \r\n')" 2>/dev/null)
  b=$(cast balance "$a" --rpc-url "$RPC" --ether 2>/dev/null)
  echo "  file deployer  $a  $b CTC"
fi
