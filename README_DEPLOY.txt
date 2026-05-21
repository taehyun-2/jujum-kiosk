배포용 주점 QR 주문 시스템

핵심 변경점
- DATABASE_URL이 있으면 PostgreSQL에 주문/메뉴/계좌/상태가 저장됩니다.
- DATABASE_URL이 없으면 기존처럼 로컬 data/*.json 파일로 테스트됩니다.
- 손님 화면 누적금액은 테이블 전체가 아니라 손님 폰 브라우저 기준입니다.
- 같은 QR을 다른 사람이 찍어도 이전 사람 주문 내역은 보이지 않습니다.
- 관리자 화면은 진행중 / 내보냄완료 / 취소됨 구분을 유지합니다.

로컬 테스트
1. 압축 해제
2. 폴더에서 터미널 열기
3. 실행

npm install
npm start

접속
http://localhost:3000/admin
http://localhost:3000/table/1

배포 준비
1. Supabase에서 새 프로젝트를 만듭니다.
2. Supabase Dashboard에서 Connect 버튼을 눌러 PostgreSQL connection string을 복사합니다.
   - 보통 Supavisor Session pooler 연결 문자열을 쓰면 됩니다.
   - 비밀번호 부분은 본인 DB 비밀번호로 바꿔야 합니다.
3. 이 폴더를 GitHub 저장소에 올립니다.
4. Render에서 New > Web Service를 만들고 GitHub 저장소를 연결합니다.
5. Render 설정
   - Build Command: npm install
   - Start Command: npm start
   - Environment Variable: DATABASE_URL = Supabase connection string
6. 배포 후 Render가 주는 주소를 확인합니다.

QR 주소 예시
https://너희주소.onrender.com/table/1
https://너희주소.onrender.com/table/2
...
https://너희주소.onrender.com/table/70

관리자 주소
https://너희주소.onrender.com/admin

중요
- DATABASE_URL은 절대 코드에 직접 적지 말고 Render 환경변수에 넣으세요.
- data/orders.json은 로컬 테스트용입니다. 배포에서는 DB를 사용합니다.
- 서버가 다시 시작되어도 DB에 저장된 주문은 유지됩니다.
