#!/bin/bash
cd "$(dirname "$0")"

echo "=================================="
echo " 주점 QR 주문 시스템 실행"
echo "=================================="
echo ""

if ! command -v node &> /dev/null
then
    echo "Node.js가 설치되어 있지 않습니다."
    echo "먼저 아래 명령어를 실행하세요:"
    echo "sudo apt update"
    echo "sudo apt install nodejs npm -y"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "필요한 라이브러리를 설치합니다..."
    npm install
fi

echo ""
echo "서버를 시작합니다."
echo "관리자 화면: http://localhost:3000/admin"
echo "1번 테이블: http://localhost:3000/table/1"
echo "70번 테이블: http://localhost:3000/table/70"
echo ""
echo "종료하려면 Ctrl + C 를 누르세요."
echo ""

npm start