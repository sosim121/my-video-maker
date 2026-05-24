@echo off
title 로컬 영상 제작 웹앱 시작기 (Local Video Maker Launcher)
chcp 65001 > nul

echo ========================================================
echo   로컬 영상 제작 웹앱 (Local Video Maker) 데스크톱 앱
echo ========================================================
echo.

REM 1. 로컬 내장 고성능 Node 엔진 확인
set LOCAL_NODE=%~dp0bin\node.exe

if exist "%LOCAL_NODE%" (
    echo [1/2] 내장 고성능 Node 엔진 활성화 완료!
    set NODE_EXEC="%LOCAL_NODE%"
) else (
    REM 내장 노드가 유실되었을 경우 시스템 노드로 대체
    node -v >nul 2>&1
    if %errorlevel% neq 0 (
        echo [경고] 내장 엔진 또는 시스템 Node.js를 찾을 수 없습니다.
        echo 이 프로그램을 작동시키려면 Node.js 설치가 필수적입니다.
        echo.
        echo 아래 다운로드 페이지가 자동으로 열립니다. LTS 버전을 설치해 주세요!
        echo.
        pause
        start https://nodejs.org/ko/download/
        exit
    )
    echo [1/2] 시스템 글로벌 Node.js 엔진 감지 완료!
    set NODE_EXEC=node
)

echo.
echo [2/2] 무설치 고속 실행 서버를 백그라운드에서 가동하고 있습니다...
echo.

REM 2초 후 기본 브라우저로 127.0.0.1:5173 즉시 열기
timeout /t 2 /nobreak > nul
start http://127.0.0.1:5173

REM 프로덕션 모드로 Express 서버 즉시 가동 (배포형 무설치 실행)
%NODE_EXEC% server/index.js --production

pause
