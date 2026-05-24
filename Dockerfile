# Puppeteer와 Chrome이 미리 완벽하게 세팅된 공식 경량 Node.js 이미지 사용
FROM ghcr.io/puppeteer/puppeteer:21.5.0

# Puppeteer용 크롬 경로 및 포트 환경 변수 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    PORT=5173 \
    NODE_ENV=production

# 빌드 및 디렉토리 권한 획득을 위해 root 사용자로 전환
USER root

WORKDIR /app

# 패키지 의존성 파일 복사
COPY package*.json ./

# 의존성 패키지 설치
RUN npm ci

# 소스 코드 전체 복사
COPY . .

# 리액트 프론트엔드 빌드 (dist 생성)
RUN npm run build

# 포트 개방
EXPOSE 5173

# Express 프로덕션 서버 실행
CMD ["node", "server/index.js", "--production"]
