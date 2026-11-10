const CONTACT_EMAIL = "materialstonegames@gmail.com";
const EFFECTIVE_DATE = "2026년 10월 31일";

export function PrivacyPage() {
  return (
    <div className="page-container privacy-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">POLICY / PRIVACY</p>
          <h1>Privacy</h1>
        </div>
        <p className="heading-note">시행일 {EFFECTIVE_DATE}</p>
      </header>

      <article className="privacy-body">
        <p>Material Stone Games(이하 "운영자")는 Atelier(atelier.materialstone.dev)를 운영하면서 아래와 같이 개인정보를 처리합니다.</p>

        <h2>1. 수집하는 정보</h2>
        <ul>
          <li><strong>Google 로그인 시</strong>: Google 계정 식별자(UID), 이메일 주소, 이름, 프로필 사진 주소.</li>
          <li><strong>YouTube 구독 확인 시</strong>: Material Stone YouTube 채널 구독 여부와 확인 유효기간(24시간). YouTube 접근 토큰은 확인 요청 한 번에만 사용하며 저장하지 않습니다. 다른 구독 목록이나 시청 기록은 수집하지 않습니다.</li>
          <li><strong>커뮤니티 이용 시</strong>: 작성한 메모·댓글, 첨부 이미지, 좋아요 기록과 작성자 이름.</li>
          <li><strong>게임 플레이 시</strong>: 플레이 세션 발급 기록(게임, 계정 식별자, 만료 시각). 일부 게임은 최고 점수를 브라우저(localStorage)에만 저장하며 서버로 보내지 않습니다.</li>
          <li><strong>자동 수집</strong>: 서비스 운영을 위해 Google Cloud가 남기는 접속 로그(IP 주소, 요청 시각 등).</li>
        </ul>

        <h2>2. 이용 목적</h2>
        <ul>
          <li>로그인과 계정 식별, 접근 등급(로그인·구독자·멤버) 확인</li>
          <li>커뮤니티 글과 댓글 표시, 부정 이용 방지와 서비스 보안</li>
        </ul>
        <p>광고나 마케팅 목적으로 이용하지 않으며, 제3자에게 판매하지 않습니다.</p>

        <h2>3. 보관 기간</h2>
        <ul>
          <li>계정 정보: 탈퇴(삭제 요청) 시까지</li>
          <li>커뮤니티 메모: 작성 월로부터 약 2개월 뒤 자동 삭제. 해당 월에 좋아요 10개 이상으로 가장 많은 메모 1개는 보존될 수 있습니다.</li>
          <li>구독 확인 결과: 24시간 동안 유효하며, 다시 확인하면 갱신됩니다.</li>
        </ul>

        <h2>4. 처리 위탁과 국외 이전</h2>
        <p>서비스는 Google LLC의 Firebase·Google Cloud(데이터 저장 위치: 서울 리전 asia-northeast3)와 GitHub Pages(웹사이트 호스팅)를 이용합니다. 이 과정에서 정보가 해당 사업자의 시스템에서 처리될 수 있습니다.</p>

        <h2>5. 이용자의 권리</h2>
        <p>언제든지 본인 정보의 열람·정정·삭제와 처리 정지를 요청할 수 있습니다. 아래 연락처로 요청하면 지체 없이 처리합니다. Google 계정의 Atelier 접근 권한은 Google 계정 설정(보안 → 서드 파티 앱)에서 직접 해제할 수 있습니다.</p>

        <h2>6. 문의</h2>
        <p>개인정보 관련 문의: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>

        <h2>7. 변경</h2>
        <p>이 방침이 바뀌면 이 페이지에 시행일과 함께 공지합니다.</p>
      </article>
    </div>
  );
}
