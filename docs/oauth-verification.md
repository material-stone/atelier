# Google OAuth 앱 검증 (구독 확인 경고 없애기)

## 왜 경고가 뜨나

구독 확인은 `https://www.googleapis.com/auth/youtube.readonly` 권한을 요청합니다. Google은 이 권한을 **민감한 범위(sensitive scope)** 로 분류하므로, 앱이 Google 검증을 받기 전에는 테스트 사용자가 아닌 모든 계정에 "Google에서 확인하지 않은 앱" 화면이 뜹니다. 코드로는 없앨 수 없고, Google Cloud Console에서 검증을 신청해 통과해야 합니다. 민감한 범위는 제한된 범위(restricted)와 달리 외부 보안 평가(유료)는 필요 없습니다.

Google 로그인(이메일·프로필)만 쓰는 일반 로그인에는 이 경고가 뜨지 않습니다. 코드는 일반 로그인과 YouTube 권한 요청을 이미 분리해 두었습니다(`src/lib/services.ts`).

## 진행 상황 (2026-11-11)

- 완료: Search Console `materialstone.dev` 소유 확인(Cloudflare 자동 TXT), 브랜딩 주소·승인된 도메인 변경, `youtube.readonly` 범위 사용 사유 입력, 브랜딩 인증 요청.
- 남은 것: 데모 영상을 YouTube(일부 공개)에 올려 데이터 액세스의 "YouTube 링크"에 넣고 인증 센터에서 데이터 액세스 인증 제출.
- 주소 끝의 `/`는 GitHub Pages가 200으로 응답하는 실제 파일 경로(`about/index.html`, `privacy/index.html`)를 가리키게 하려고 붙입니다.

## 신청 전에 준비할 것

1. **도메인 소유 확인**: Google Search Console에서 `materialstone.dev`를 소유 확인합니다. Cloud 프로젝트의 소유자(또는 편집자) 계정으로 해야 합니다.
2. **OAuth 동의 화면 → 브랜딩**
   - 앱 이름: `Atelier` (홈페이지와 같은 이름)
   - 사용자 지원 이메일: 프로젝트 소유자 계정의 이메일만 고를 수 있습니다(관리 중인 Google 그룹이 없으면 다른 주소 선택 불가).
   - 앱 로고: 120×120 정사각형 (선택이지만 넣으면 로고도 함께 검토)
   - 앱 홈페이지: `https://atelier.materialstone.dev/about/`
   - 개인정보처리방침: `https://atelier.materialstone.dev/privacy/`
   - 승인된 도메인: `materialstone.dev` (Firebase 로그인 도메인 `material-stone-atelier.firebaseapp.com`을 쓰면 `firebaseapp.com`도 등록되어 있어야 합니다)
3. **데이터 액세스(범위)**: `.../auth/youtube.readonly` 하나만 등록합니다. 쓰지 않는 범위가 있으면 지웁니다.
4. **게시 상태**: "프로덕션 단계"로 둔 뒤 "앱 확인 준비" → 검증 제출.
5. 개인정보처리방침의 "2-1. Google·YouTube 데이터 사용"이 배포되어 있어야 합니다(Limited Use 문구 포함).

## 제출 문구 (영문)

**Scope justification — `youtube.readonly`**

> Atelier is a web hub where Material Stone Games publishes playable game prototypes. Each week a rotating set of prototypes is unlocked for subscribers of the Material Stone YouTube channel. When a signed-in player clicks "Verify subscription", we request youtube.readonly and call `subscriptions.list` once with `mine=true` and `forChannelId` set to our own channel ID, to check whether this player subscribes to our channel. We store only the result (subscribed: yes/no and an expiry at the end of the current weekly rotation, at least 24 hours). The access token is used for that single request on our server and is never stored. We do not read any other subscriptions, playlists, watch history or channel data. A narrower scope is not available: `subscriptions.list` with `mine=true` requires youtube.readonly.

**How the app uses Google user data**

> Basic Google Sign-In (email, name, profile picture) identifies the player's account for comments and likes. YouTube data is used only for the subscription check described above, in line with the Google API Services User Data Policy, including the Limited Use requirements.

## 데모 영상 (YouTube 일부 공개로 올려 링크 제출)

1~2분, 영어 자막이나 설명 텍스트를 넣으면 좋습니다. 꼭 보여야 할 것:

1. 브라우저 주소창에 `https://atelier.materialstone.dev`가 보이는 홈 화면
2. Google 로그인 → 게임 페이지의 "구독 확인" 버튼 클릭
3. **OAuth 동의 화면 전체**: 앱 이름 `Atelier`, 요청 권한(YouTube 계정 보기), 주소창의 `client_id=...`가 보이게 (주소창을 클릭해 URL을 펼쳐서)
4. 동의 후 "확인됨" 표시와 이번 주 프로토타입이 열리는 모습
5. 개인정보처리방침 페이지

## 그동안 할 수 있는 것

- 검증은 보통 며칠~몇 주 걸리고, 검토자가 메일로 추가 자료를 요청할 수 있습니다(지원 이메일로 옴).
- 그 사이에 경고를 보는 사용자에게는 "고급 → Atelier(으)로 이동"을 눌러야 한다고 안내할 수밖에 없습니다. 미검증 앱은 이 경로로 동의한 사용자가 최대 100명으로 제한됩니다.
