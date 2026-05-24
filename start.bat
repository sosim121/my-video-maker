@echo off
title 로컬 영상 제작 웹앱 시작기 (Local Video Maker Launcher)
chcp 65001 > nul

echo ========================================================
echo   로컬 영상 제작 웹앱 (Local Video Maker) 자동 시작기
echo ========================================================
echo.

REM Node.js 설치 여부 확인
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [경고] 컴퓨터에 Node.js가 설치되어 있지 않습니다.
    echo 이 프로그램을 실행하려면 Node.js 설치가 필수적입니다.
    echo.
    echo 아래 다운로드 페이지가 자동으로 열립니다. LTS 버전을 다운로드하여 설치해 주세요!
    echo.
    pause
    start https://nodejs.org/ko/download/
    exit
)

echo [1/3] Node.js 설치 확인 완료!
echo.

REM node_modules 폴더가 없으면 npm install 실행
if not exist node_modules (
    echo [2/3] 의존성 패키지를 처음으로 설치하고 있습니다.
    echo 처음 실행할 때는 30초에서 1분 정도 소요될 수 있습니다. 잠시만 기다려 주세요...
    echo.
    call npm install
) else (
    echo [2/3] 의존성 패키지가 이미 설치되어 있습니다. 다음 단계로 넘어갑니다.
)
echo.

echo [3/3] 로컬 개발 서버를 실행하고 있습니다...
echo.

REM 서버 작동 및 기본 브라우저로 127.0.0.1:5173 즉시 열기
timeout /t 2 /nobreak > nul
start http://127.0.0.1:5173
npm run dev

pause
