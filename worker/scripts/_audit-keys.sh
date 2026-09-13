#!/usr/bin/env bash
# Find any private-key material that is tracked by git, present in history, or sitting in files
# that a commit could pick up. Nothing is printed but locations and character counts.
set -u
cd ~/coverage-exchange

echo "=== 1. are broadcast/ and cache/ ignored? (forge writes the deployer key there) ==="
for d in contracts/broadcast contracts/cache broadcast cache; do
  if [ -e "$d" ]; then
    printf "  %-24s " "$d"
    git check-ignore -q "$d" && echo "IGNORED" || echo "*** NOT IGNORED ***"
  fi
done

echo
echo "=== 2. any tracked file with a key-shaped literal? ==="
hits=$(git grep -lIE '(PRIVATE_KEY|MNEMONIC)[[:space:]]*[:=][[:space:]]*["'"'"']?0x[0-9a-fA-F]{64}' -- . 2>/dev/null)
if [ -z "$hits" ]; then echo "  none"; else echo "$hits" | sed 's/^/  /'; fi

echo
echo "=== 3. any tracked .env at all? ==="
git ls-files | grep -E '(^|/)\.env' | grep -v example || echo "  none"

echo
echo "=== 4. do the forge artifacts on disk hold the key, and are they ignored? ==="
for f in contracts/broadcast/Deploy.s.sol/102031/run-latest.json contracts/cache/Deploy.s.sol/102031/run-latest.json; do
  [ -f "$f" ] || continue
  n=$(grep -oE '"privateKey":"0x[0-9a-fA-F]{64}"' "$f" 2>/dev/null | wc -l)
  printf "  %-60s %s key field(s)  " "$f" "$n"
  git check-ignore -q "$f" && echo "IGNORED" || echo "*** NOT IGNORED ***"
done

echo
echo "=== 5. full history: any commit that ever added a 64-hex key literal? ==="
if git log --all --pretty=format:%H | head -200 >/dev/null 2>&1; then
  found=$(git rev-list --all 2>/dev/null | while read -r c; do
    git grep -lIE '0x[0-9a-fA-F]{64}' "$c" -- '*.env' '.env' 2>/dev/null
  done | sort -u)
  [ -z "$found" ] && echo "  no .env file ever committed" || echo "$found" | sed 's/^/  /'
fi

echo
echo "=== 6. files on disk that would leak if committed later ==="
for f in .env contracts/.env worker/.env web/.env; do
  [ -f "$f" ] || continue
  printf "  %-18s " "$f"
  git check-ignore -q "$f" && echo "IGNORED" || echo "*** NOT IGNORED ***"
done
