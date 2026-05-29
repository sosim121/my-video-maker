@echo off
title 로컬 영상 제작 웹앱 시작기 (Local Video Maker Launcher)
chcp 65001 > nul
setlocal

echo ========================================================
echo   로컬 영상 제작 웹앱 (Local Video Maker)
echo ========================================================
echo.

cd /d "%~dp0"

REM 1. Node.js 엔진 확인
set LOCAL_NODE=%~dp0bin\node.exe
set NPM_EXEC=npm

if exist "%LOCAL_NODE%" (
    echo [1/4] 내장 Node 엔진 활성화 완료
    set NODE_EXEC="%LOCAL_NODE%"
) else (
    node -v >nul 2>&1
    if errorlevel 1 (
        echo [경고] Node.js를 찾을 수 없습니다.
        echo Node.js LTS 버전을 설치해 주세요 (^>= 18.0.0^).
        echo.
        pause
        start https://nodejs.org/ko/download/
        exit /b 1
    )
    echo [1/4] 시스템 Node.js 엔진 감지 완료
    set NODE_EXEC=node
)

REM 2. 의존성 설치 확인
if not exist "node_modules" (
    echo [2/4] 의존성 설치 중... ^(첫 실행 시 몇 분 걸립니다^)
    call %NPM_EXEC% install
    if errorlevel 1 (
        echo [오류] npm install 실패. 인터넷 연결을 확인해 주세요.
        pause
        exit /b 1
    )
) else (
    echo [2/4] 의존성 확인 완료
)

REM 3. 프로덕션 빌드 확인
if not exist "dist\index.html" (
    echo [3/4] 프론트엔드 빌드 중...
    call %NPM_EXEC% run build
    if errorlevel 1 (
        echo [오류] 빌드 실패.
        pause
        exit /b 1
    )
) else (
    echo [3/4] 빌드 결과물 확인 완료
)

REM 4. 서버 시작 + 브라우저 자동 오픈
echo [4/4] 서버 시작 중...
echo.
echo 브라우저가 자동으로 열립니다: http://127.0.0.1:5173
echo 종료하려면 이 창에서 Ctrl+C를 누르세요.
echo.

start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:5173"

%NODE_EXEC% server/index.js --production

endlocal
pause
