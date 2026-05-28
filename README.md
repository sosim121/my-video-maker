# Local Video Maker

스크립트를 입력하면 자동으로 씬을 나누고, Google Translate TTS로 한국어/영어 음성을 생성한 뒤, 씬마다 이미지·영상을 넣어 MP4로 렌더링하는 로컬 웹앱입니다. Remotion으로 헤드리스 렌더링하고 Express 5 + React 19 + Vite로 구성되어 있습니다.

## 주요 기능

- 스크립트 입력 → 줄 단위 자동 씬 분할
- 한국어/영어 자동 감지 + Google Translate TTS 자동 생성 (씬별 병렬 처리)
- 전체 나레이션 MP3/M4A 업로드 시 씬 길이 자동 분배
- 씬별 배경 이미지·영상 업로드
- 9:16 (portrait) / 16:9 (landscape) 화면비 선택
- 실시간 미리보기 (Remotion Player) + MP4 H.264 내보내기
- 한국어 파일명, 동시 업로드 안전 처리

## 필수 환경

- **Node.js 18 이상** (LTS 권장)
- **Google Chrome** 또는 **Microsoft Edge** (Remotion 렌더링에 필요)
- macOS · Windows · Linux 모두 지원

## 빠른 시작

### macOS / Linux

```bash
git clone https://github.com/sosim121/my-video-maker.git
cd my-video-maker
./start.sh
```

`start.sh`가 자동으로 `npm install`, `npm run build`, 서버 실행, 브라우저 오픈까지 처리합니다.

### Windows

`start.bat` 파일을 더블클릭하세요. 의존성 설치 → 빌드 → 서버 실행 → 브라우저 오픈이 자동으로 진행됩니다.

### 수동 실행 (개발 모드)

```bash
npm install
npm run dev    # Vite HMR 사용, http://127.0.0.1:5173
```

### 수동 실행 (프로덕션 모드)

```bash
npm install
npm run build
npm run start:built    # 빌드 결과물을 그대로 사용
# 또는
npm run start          # 빌드 + 서버 실행 한번에
```

## 환경 변수

| 변수 | 용도 | 기본값 |
|------|------|--------|
| `PORT` | 서버 포트 | `5173` |
| `NODE_ENV` | `production` 으로 설정하면 프로덕션 모드 (또는 CLI `--production`) | (미설정 = dev) |
| `REMOTION_BROWSER_EXECUTABLE` | Chrome/Chromium 실행 경로 강제 지정 | 자동 탐지 |
| `PUPPETEER_EXECUTABLE_PATH` | 대체 Chrome 경로 (Docker 등) | 자동 탐지 |

Chrome 자동 탐지가 실패하면 위 환경 변수로 직접 지정할 수 있습니다.

```bash
# macOS 예시
export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Windows (PowerShell)
$env:REMOTION_BROWSER_EXECUTABLE="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

## 사용 흐름

1. 브라우저에서 `http://127.0.0.1:5173` 접속
2. 왼쪽 패널에 스크립트 입력 (줄바꿈으로 씬 구분)
3. **초기 영상 생성** 버튼 → 씬 자동 분할 + TTS 자동 생성
4. 오른쪽 씬 편집 패널에서 씬별 텍스트·길이·이미지·영상 조정
5. 가운데 미리보기에서 실시간 확인
6. **mp4 내보내기** 버튼 → 렌더링 시작 → 완료 후 다운로드

## API 엔드포인트

모든 응답은 JSON. 오류 시 `{ "error": "메시지" }` 형식.

| 메서드 | 경로 | 용도 |
|--------|------|------|
| `GET` | `/api/health` | 헬스 체크 |
| `GET` | `/api/voices` | 사용 가능한 TTS 음성 목록 |
| `POST` | `/api/projects` | 스크립트로 프로젝트 생성 (`{ script, aspectRatio? }`) |
| `GET` | `/api/projects/:id` | 프로젝트 조회 |
| `PATCH` | `/api/projects/:id` | 프로젝트 수정 (`{ aspectRatio?, captionStyle?, scenes? }`) |
| `POST` | `/api/projects/:id/tts` | 전 씬 TTS 자동 생성 |
| `POST` | `/api/projects/:id/narration` | 전체 나레이션 오디오 업로드 (multipart `file`) |
| `POST` | `/api/projects/:id/scenes/:sceneId/media` | 씬별 이미지·영상 업로드 (multipart `file`) |
| `POST` | `/api/projects/:id/render` | MP4 렌더링 시작 (비동기) |
| `GET` | `/api/renders/:renderId` | 렌더 작업 상태 조회 (폴링) |
| `GET` | `/api/projects/:id/export` | 완성된 MP4 다운로드 |

## 디렉토리 구조

```
my-video-maker/
├── src/
│   ├── App.jsx              UI 메인 컴포넌트
│   ├── lib/video.js         화면비·FPS 상수
│   └── remotion/            Remotion 영상 컴포지션
├── server/
│   ├── index.js             Express 라우트
│   ├── lib/
│   │   ├── tts.js           Google Translate TTS
│   │   ├── media.js         MIME·파일명 처리
│   │   ├── render.js        Remotion 번들·렌더
│   │   ├── project.js       씬 분할·타이밍
│   │   ├── browser.js       Chrome 자동 탐지
│   │   └── storage.js       파일시스템 저장
│   ├── api-smoke.test.js
│   ├── project.test.js
│   └── render-smoke.mjs
├── storage/                 (런타임 생성) 프로젝트·업로드·렌더 결과
├── dist/                    (빌드 결과물)
├── Dockerfile
├── start.sh                 macOS/Linux 시작 스크립트
└── start.bat                Windows 시작 스크립트
```

## 데이터 저장 위치

모든 데이터는 프로젝트 디렉토리 내 `storage/` 아래에 저장됩니다.

- `storage/projects/<id>.json` — 프로젝트 메타데이터
- `storage/uploads/<projectId>/` — TTS 오디오·업로드된 이미지·영상·나레이션
- `storage/renders/<projectId>-<renderId>.mp4` — 완성된 영상

## 테스트

```bash
npm test                # node:test 기반 유닛+스모크 테스트
npm run smoke:render    # 전체 렌더 파이프라인 스모크 테스트
```

## Docker 배포

```bash
docker build -t my-video-maker .
docker run -p 5173:5173 my-video-maker
```

`Dockerfile`은 `puppeteer/puppeteer:21.5.0` 기반으로 Chrome이 미리 설치된 이미지입니다.

## 트러블슈팅

**"dist/index.html이 없습니다" 오류**
프로덕션 모드 (`npm run start:built`) 실행 전 `npm run build`를 먼저 실행하세요. `npm run start`는 빌드도 자동으로 합니다.

**렌더링 시 Chrome을 찾을 수 없다는 오류**
Google Chrome 또는 Microsoft Edge를 설치하거나, `REMOTION_BROWSER_EXECUTABLE` 환경 변수로 실행 파일 경로를 직접 지정하세요.

**TTS가 작동하지 않음**
인터넷 연결을 확인하세요. Google Translate 공개 엔드포인트를 호출하므로 외부 네트워크 접근이 필요합니다.

**Windows에서 한글이 깨져 보임**
`start.bat`은 자동으로 코드 페이지를 UTF-8 (65001)로 설정합니다. 다른 방식으로 실행할 경우 콘솔 인코딩을 확인하세요.

**렌더가 계속 큐에 머무름**
서버 로그를 확인하세요. Chrome 실행 실패, 메모리 부족, 또는 잘못된 자산 URL이 원인일 수 있습니다.

## 기술 스택

- **Frontend**: React 19, Vite 7, Remotion Player
- **Backend**: Express 5, Multer, music-metadata
- **Video**: Remotion 4 (bundler + renderer)
- **TTS**: Google Translate 공개 TTS 엔드포인트
- **Test**: node:test (built-in)

## 라이선스

이 저장소의 라이선스 표기를 확인해 주세요.
