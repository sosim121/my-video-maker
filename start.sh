#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "========================================================"
echo "  로컬 영상 제작 웹앱 (Local Video Maker)"
echo "========================================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[오류] Node.js를 찾을 수 없습니다."
  echo "Node.js LTS (>= 18.0.0) 설치 후 다시 실행하세요."
  echo "  https://nodejs.org/ko/download/"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "[오류] Node.js 18 이상이 필요합니다. 현재: $(node -v)"
  exit 1
fi

echo "[1/4] Node $(node -v) 감지됨"

if [ ! -d node_modules ]; then
  echo "[2/4] 의존성 설치 중... (첫 실행 시 몇 분 소요)"
  npm install
else
  echo "[2/4] 의존성 확인 완료"
fi

if [ ! -f dist/index.html ]; then
  echo "[3/4] 프론트엔드 빌드 중..."
  npm run build
else
  echo "[3/4] 빌드 결과물 확인 완료"
fi

echo "[4/4] 서버 시작..."
echo
echo "브라우저: http://127.0.0.1:5173 (3초 후 자동 오픈)"
echo "종료: Ctrl+C"
echo

(sleep 3 && (open http://127.0.0.1:5173 2>/dev/null || xdg-open http://127.0.0.1:5173 2>/dev/null || true)) &

exec node server/index.js --production
