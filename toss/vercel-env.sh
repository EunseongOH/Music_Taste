#!/usr/bin/env bash
# 토스 미니앱용 환경변수를 Vercel 에 넣는다.
#
# 값을 손으로 복사하지 않는다 — 인증서 base64 는 2,000자가 넘어서 붙여넣다
# 줄바꿈이나 공백이 섞이면 handshake 가 실패하고, 원인이 잘 안 보인다.
# toss/mtls-out/ 의 파일을 그대로 표준입력으로 흘려보낸다.
#
# 먼저 한 번만:
#   npx vercel login
#   npx vercel link          # 이 폴더를 Vercel 프로젝트에 연결
#
# 그다음:
#   bash toss/vercel-env.sh
#
# 값은 화면에 찍지 않는다.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mtls-out"
BRANCH="develop"   # Preview 는 이 브랜치로 좁힌다

if [ ! -d "$DIR" ]; then
  echo "값 폴더가 없습니다: $DIR"
  echo "먼저 node toss/mtls-setup.mjs <인증서.crt> <개인키.key> 를 실행하세요."
  exit 1
fi

# 이름 → 파일. Production 과 Preview(develop) 양쪽에 같은 값을 넣는다.
# TOSS_ANON_KEY_VERIFY 만 환경별로 다르게 둔다(아래에서 따로 처리).
SHARED=(
  TOSS_MTLS_CERT_BASE64
  TOSS_MTLS_KEY_BASE64
  TOSS_USER_PEPPER
)

put() { # put <이름> <환경> <파일> [브랜치]
  local name="$1" env="$2" file="$3" branch="${4:-}"
  if [ ! -f "$file" ]; then
    echo "  [건너뜀] $name — 파일 없음: $file"
    return
  fi
  # 개행이 섞이면 값이 깨진다. 마지막 줄바꿈만 떼고 그대로 흘린다.
  if printf '%s' "$(cat "$file")" | npx vercel env add "$name" "$env" $branch >/dev/null 2>&1; then
    echo "  [O] $name → $env${branch:+ ($branch)}"
  else
    echo "  [X] $name → $env${branch:+ ($branch)}  (이미 있으면 먼저 지워야 합니다:"
    echo "        npx vercel env rm $name $env${branch:+ $branch})"
  fi
}

echo
echo "Production"
for n in "${SHARED[@]}"; do put "$n" production "$DIR/$n.txt"; done
# 운영은 처음부터 검증을 강제한다.
printf 'enforce' > "$DIR/.verify-prod"
put TOSS_ANON_KEY_VERIFY production "$DIR/.verify-prod"

echo
echo "Preview ($BRANCH)"
for n in "${SHARED[@]}"; do put "$n" preview "$DIR/$n.txt" "$BRANCH"; done
# 프리뷰는 log 로 시작해 로그를 확인한 뒤 enforce 로 올린다.
put TOSS_ANON_KEY_VERIFY preview "$DIR/TOSS_ANON_KEY_VERIFY.txt" "$BRANCH"

rm -f "$DIR/.verify-prod"

echo
echo "넣은 값 확인 (값은 가려집니다):"
npx vercel env ls | grep -i toss || true
echo
echo "환경변수는 기존 배포에 적용되지 않습니다. Vercel 에서 Redeploy 하세요."
