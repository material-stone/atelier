# Atelier 운영 전 준비·배포·검수 가이드

이 문서는 `material-stone/atelier`를 실제 운영하기 전에 필요한 계정 준비, Firebase 설정, 관리자 인증, GitHub Pages 배포, 출시 검수, 운영 업무를 정해진 순서로 수행하기 위한 가이드입니다.

문서 기준 주소는 다음과 같습니다.

- 저장소: <https://github.com/material-stone/atelier>
- GitHub Pages: <https://material-stone.github.io/atelier/>
- 홈(게임 검색): `/atelier/`
- 게임 플레이: `/atelier/game/:gameId`
- 커뮤니티: `/atelier/community`
- Atelier 소개: `/atelier/about`
- 관리: `/atelier/admin` (게임 목록·추가·수정·삭제, 저장 공간)
- 예전 주소 `/atelier/hub/...`는 새 주소로 넘어갑니다.
- Firebase Functions 리전: `asia-northeast3`

현재 저장소에는 프런트엔드, Firebase Rules, Cloud Functions, GitHub Actions workflow가 준비되어 있습니다. 실제 운영을 시작하려면 Firebase 프로젝트와 결제 계정, Google/YouTube 설정, 관리자 claim, GitHub Actions 변수와 실제 콘텐츠를 운영자가 입력해야 합니다. 이 값들은 저장소에 임의의 예시값으로 넣지 않습니다.

> [!IMPORTANT]
> 이 문서의 체크박스는 순서대로 진행합니다. 특히 `PLAY_SESSION_SECRET`, Firebase 서비스 계정 키, OAuth client secret은 저장소나 GitHub Actions 변수에 넣지 않습니다.

## 0. 먼저 확정할 운영값

아래 표를 문서나 비밀번호 관리자에 복사해 실제 값을 채웁니다. 비밀번호·secret은 이 문서에 기록하지 않습니다.

| 항목 | 입력할 값 | 사용 위치 |
| --- | --- | --- |
| Firebase Project ID | `YOUR_PROJECT_ID` | Firebase CLI, 웹 설정 |
| Firebase 웹 앱 설정 | Firebase Console이 발급한 6개 이상 값 | GitHub Actions Repository Variables |
| Google 관리자 이메일 | `admin@example.com` | 첫 로그인 후 custom claim 부여 |
| YouTube 채널 ID | `UC...` 형식의 실제 채널 ID | Functions와 Pages 변수 |
| YouTube 공개 URL | `https://www.youtube.com/@...` | 홈·프로토타입 안내 링크 |
| Discord 초대 URL | 실제 초대 링크 | 홈·푸터 링크 |
| Pages origin | `https://material-stone.github.io` | `PAGES_ORIGIN` |
| Pages 전체 URL | `https://material-stone.github.io/atelier/` | 브라우저·OAuth·출시 검수 |
| Functions base URL | `https://asia-northeast3-YOUR_PROJECT_ID.cloudfunctions.net` | `FUNCTIONS_BASE_URL` |
| 결제 계정 | Google Cloud Billing account | Firebase Blaze |
| 예산 알림 수신자 | 운영 담당자 이메일 | Google Cloud Billing |

### `FUNCTIONS_BASE_URL` 작성 규칙

`FUNCTIONS_BASE_URL`에는 `https://`를 포함한 함수 도메인까지만 넣고 끝에 `/playGateway`를 붙이지 않습니다.

```text
올바름:   https://asia-northeast3-YOUR_PROJECT_ID.cloudfunctions.net
잘못됨:   https://asia-northeast3-YOUR_PROJECT_ID.cloudfunctions.net/playGateway
```

코드가 내부적으로 `playGateway`와 세션 경로를 이어 붙입니다. 끝의 `/`도 제거합니다.

## 1. 출시 전에 준비할 계정과 도구

### 1.1 필요한 권한

- GitHub 조직 `material-stone`의 `atelier` 저장소 관리자 또는 Actions/Pages 설정 권한
- Firebase 프로젝트를 생성하고 Billing을 연결할 수 있는 Google 계정
- Google Cloud 프로젝트의 API와 OAuth 동의 화면을 설정할 권한
- Material Stone YouTube 채널의 정확한 채널 ID를 확인할 수 있는 권한
- Discord 초대 링크를 생성하거나 관리할 권한
- 운영 비용 알림을 받을 이메일 주소

관리자 Google 이메일은 실제로 Google 로그인할 이메일과 정확히 같아야 합니다. 별칭, 다른 Google Workspace 계정, 이메일 대소문자 변경을 섞지 않습니다.

### 1.2 로컬 도구

CI는 Node.js 22를 사용하고 Functions 런타임은 Node.js 20으로 지정되어 있습니다. 로컬에서는 Node.js 22 LTS와 npm을 권장합니다.

```powershell
node --version
npm --version
firebase --version
git --version
```

Firebase CLI가 없다면 설치하고 로그인합니다.

```powershell
npm install --global firebase-tools
firebase login
firebase projects:list
```

`firebase login`과 Cloud Functions Admin SDK에서 사용하는 Application Default Credentials는 별개일 수 있습니다. 관리자 claim 스크립트를 로컬에서 실행할 때는 Google Cloud SDK의 ADC가 필요하므로, 로컬에서 권한 오류가 나면 `gcloud auth application-default login`을 수행하거나 Google Cloud Shell에서 실행합니다. 서비스 계정 JSON 파일을 저장소에 넣지 않습니다.

### 1.3 코드 작업 디렉터리 확인

운영 배포 전에 다음 파일이 있는지 확인합니다.

| 파일 | 역할 |
| --- | --- |
| `.github/workflows/deploy-pages.yml` | `main` push 시 Pages 빌드·배포 |
| `firebase.json` | Firestore, Storage, Functions 배포 설정 |
| `firestore.rules` | Firestore 접근 규칙 |
| `firestore.indexes.json` | 게임·게시판·댓글 복합 색인 |
| `storage.rules` | 커버·게시판 이미지·비공개 빌드 규칙 |
| `functions/src/index.ts` | 인증, 업로드 처리, 플레이 세션, 게시판, 좋아요, 보존 정리 |
| `.env.example` | Pages 빌드에 필요한 공개 웹 설정 목록 |
| `functions/.env.example` | Functions parameter 목록 |

현재 작업 폴더가 Git 저장소인지도 확인합니다.

```powershell
git status
git remote -v
git branch --show-current
```

현재 폴더에 `.git`이 없다면 `git init` 후 강제 push를 먼저 하지 말고, 원격 저장소를 별도 폴더에 clone하거나 GitHub Desktop으로 원격 `main`의 README 이력을 보존하면서 현재 파일을 반영합니다. `git push --force`는 사용하지 않습니다.

## 2. Firebase 프로젝트 만들기

### 2.1 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만들거나 운영용 프로젝트를 선택합니다.
2. 프로젝트 ID를 확정합니다. 이후 Functions URL, Storage bucket, Auth domain에 반영되므로 가급적 변경하지 않습니다.
3. Analytics 사용 여부를 결정합니다. 사용한다면 운영용 Measurement ID를 별도로 기록합니다.
4. 프로젝트의 Google Cloud Billing 계정을 확인합니다.

### 2.2 Blaze 요금제와 비용 제한

이 프로젝트는 Cloud Storage의 ZIP 업로드·비공개 빌드와 Cloud Functions의 ZIP 처리·예약 정리를 사용하므로 운영 Firebase 프로젝트를 Blaze 요금제로 전환합니다.

Blaze는 사용량 기반 결제이며 무료 사용량 범위가 있어도 결제 계정이 연결됩니다. 예산 알림은 지출을 자동으로 차단하지 않으므로, 알림만 설정하고 끝내지 말고 Functions의 동시 실행 제한, 업로드 크기, App Check, 운영 모니터링을 함께 설정합니다. 자세한 내용은 [Firebase 요금제 문서](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)를 확인합니다.

순서:

1. Firebase Console의 Project settings 또는 Billing 화면에서 운영 프로젝트에 Cloud Billing 계정을 연결합니다.
2. Google Cloud Console의 Billing > Budgets & alerts에서 월 예산을 설정합니다.
3. 예산의 50%, 75%, 90%, 100% 알림 수신자를 등록합니다.
4. 알림은 차단 장치가 아니라는 점을 운영 기록에 남깁니다.
5. 사용량이 급증하면 먼저 Functions 로그, Storage 객체 증가, Firestore 읽기 수, Pages 빌드 횟수를 확인합니다.

### 2.3 Firebase Web App 등록

1. Firebase Console > Project settings > Your apps에서 Web 앱을 추가합니다.
2. 앱 이름은 `atelier-web`처럼 운영 목적이 드러나게 지정합니다.
3. Firebase가 보여주는 웹 설정을 그대로 보관합니다.
4. `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, 필요 시 `measurementId`를 운영값 표에 기록합니다.

`apiKey`를 포함한 Firebase Web config는 브라우저에 포함되는 공개 설정입니다. 보안의 핵심은 Firestore/Storage Rules, Functions의 인증 검증, custom claim, secret 관리입니다. 반대로 `PLAY_SESSION_SECRET`은 절대 Pages 변수나 웹 코드에 넣지 않습니다.

### 2.4 Firestore와 Storage 초기화

Firebase Console에서 다음을 한 번씩 초기화합니다.

- Firestore Database: Native mode
- Cloud Storage: 기본 bucket 생성
- Authentication: Google provider를 나중에 활성화할 수 있도록 준비

Firestore와 Functions는 가능한 한 `asia-northeast3` 또는 사용자와 운영 인프라에 맞는 동일 권역을 사용합니다. Firestore의 데이터베이스 위치와 Storage bucket 위치는 나중에 바꾸기 어렵거나 마이그레이션 비용이 발생할 수 있으므로 생성 전에 확정합니다.

## 3. Google 로그인과 YouTube 구독 확인 설정

### 3.1 Firebase Google 로그인 활성화

1. Firebase Console > Authentication > Sign-in method으로 이동합니다.
2. Google provider를 Enable로 설정합니다.
3. 프로젝트의 지원 이메일을 지정합니다.
4. Authorized domains에 다음을 확인·추가합니다.

   - `material-stone.github.io`
   - 로컬 테스트용 `localhost`가 필요한지 확인
   - 별도 custom domain을 사용한다면 해당 host도 추가

Google 로그인은 현재 코드에서 popup 방식으로 실행됩니다. Firebase 문서의 [Google 로그인 설정](https://firebase.google.com/docs/auth/web/google-signin)과 같은 프로젝트의 Authorized domains 설정을 사용합니다.

### 3.2 OAuth 동의 화면과 YouTube Data API

프로토타입 접근은 Google 로그인만으로 충분하지 않고 YouTube OAuth 권한 동의와 구독 API 호출이 필요합니다.

1. Google Cloud Console에서 Firebase 프로젝트와 연결된 프로젝트를 선택합니다.
2. APIs & Services > Library에서 **YouTube Data API v3**를 Enable합니다.
3. OAuth consent screen에서 앱 이름, 지원 이메일, 개발자 연락처를 입력합니다.
4. 외부 사용자도 사용할 것이므로 사용자 유형과 게시 상태를 운영 정책에 맞게 설정합니다.
5. YouTube 읽기 scope를 사용하는 이유를 명확히 작성합니다. 현재 앱이 요청하는 scope는 다음입니다.

   ```text
   https://www.googleapis.com/auth/youtube.readonly
   ```

6. 테스트 단계에서는 Test users에 운영자와 QA 계정을 등록합니다.
7. 운영 공개 전에 Google OAuth 검토·검증이 필요한지 확인하고, 미검증 상태의 사용자 경고가 남아 있지 않도록 처리합니다.
8. 앱의 개인정보처리방침 URL, 문의 방법, Google/YouTube 데이터 사용 목적을 준비합니다.

구독 검증은 사용자가 게임 페이지에서 다시 권한을 승인하면 Functions가 `subscriptions.list`를 `mine=true`와 Material Stone 채널 ID로 호출하는 방식입니다. 이 API는 인증된 사용자의 구독 목록을 조회하는 용도이므로 [YouTube subscriptions.list 공식 문서](https://developers.google.com/youtube/v3/docs/subscriptions/list)의 파라미터와 OAuth 요구사항을 확인합니다.

### 3.3 채널 ID 확인

YouTube URL의 `@handle`만 `YOUTUBE_CHANNEL_ID`에 넣지 않습니다. 실제 `UC...` 채널 ID를 확인합니다.

- YouTube Studio 또는 채널 고급 정보에서 확인
- Google API Explorer의 `channels.list`에서 `mine=true`로 확인
- 확인한 ID를 운영 메모에 한 번 더 대조

잘못된 채널 ID를 넣으면 실제 구독자도 프로토타입 접근에 실패합니다.

## 4. Firebase Functions 환경값과 secret 설정

### 4.1 프로젝트 연결

저장소 루트에서 운영 Firebase 프로젝트를 선택합니다.

```powershell
firebase use --add
```

목록에서 운영 프로젝트를 선택하고 alias는 `production`처럼 지정합니다. 연결 결과로 `.firebaserc`가 생성될 수 있습니다. 프로젝트 ID가 외부 공개되는 것을 원하지 않는 조직 정책이 있으면 해당 파일의 commit 여부를 확인하되, 배포하는 운영자는 로컬 alias를 반드시 알고 있어야 합니다.

### 4.2 Functions parameter 파일 작성

`functions/src/index.ts`의 `defineString` 값은 Firebase CLI가 `functions/.env` 또는 프로젝트별 `.env.<projectId>`에서 읽습니다. 운영 프로젝트에만 적용되는 값을 다음처럼 작성합니다.

`functions/.env.<YOUR_PROJECT_ID>`:

```dotenv
YOUTUBE_CHANNEL_ID=UCxxxxxxxxxxxxxxxxxxxxxx
PAGES_ORIGIN=https://material-stone.github.io
FUNCTIONS_BASE_URL=https://asia-northeast3-YOUR_PROJECT_ID.cloudfunctions.net
```

`PAGES_ORIGIN`에는 `/atelier` 경로를 붙이지 않습니다. 이는 `playGateway` 응답의 `Content-Security-Policy: frame-ancestors`에 사용되는 origin입니다.

`.env.<projectId>`는 `.gitignore`에 의해 제외되어야 합니다. 작성 후 다음을 확인합니다.

```powershell
Get-Content functions\.env.<YOUR_PROJECT_ID>
git status --short
```

출력에 실제 secret이 보이거나 `functions/.env.<projectId>`가 commit 대상이면 즉시 중단하고 `.gitignore`를 확인합니다.

### 4.3 플레이 세션 secret 생성

`PLAY_SESSION_SECRET`은 플레이 세션 URL의 HMAC 서명에 사용됩니다. 비밀번호 관리자에서 충분히 긴 무작위 값을 생성하고 Firebase Secret Manager에 대화형으로 입력합니다.

```powershell
firebase functions:secrets:set PLAY_SESSION_SECRET
```

입력한 값을 터미널 기록·문서·GitHub 변수에 복사하지 않습니다. Secret 값을 바꾼 뒤에는 해당 secret을 참조하는 Functions를 다시 배포해야 새 버전이 사용합니다. Functions parameter와 secret 관리 방식은 [Cloud Functions 환경 설정 문서](https://firebase.google.com/docs/functions/config-env)를 기준으로 합니다.

### 4.4 Functions 배포

먼저 Functions 의존성을 설치하고 타입 검사를 수행합니다.

```powershell
npm --prefix functions install
npm --prefix functions run lint
npm --prefix functions run build
```

그 다음 Firebase 리소스를 배포합니다.

```powershell
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

이 저장소의 `firebase.json`에는 Functions predeploy로 `npm --prefix functions run build`가 등록되어 있습니다. 배포 중 parameter 입력을 요구하면 위에서 정한 운영값을 입력하고, 잘못된 project ID나 테스트값을 입력하지 않았는지 확인합니다.

배포 후 함수 목록과 로그를 확인합니다.

```powershell
firebase functions:list
firebase functions:log --only processBuildZip
```

최소한 다음 함수가 배포되어야 합니다.

- `verifyYoutubeSubscription`
- `createOrUpdateGameDraft`
- `createPost`
- `createComment`
- `toggleLike`
- `getPlaySession`
- `recordGameView`
- `playGateway`
- `processBuildZip`
- `monthlyRetentionSweep`
- `updateGameMeta`
- `deleteGame`
- `storageReport`
- `deleteStorageOrphans`

`monthlyRetentionSweep`는 매월 1일 한국 시간 오전 3시에 실행되도록 코드에 설정되어 있습니다. Cloud Scheduler가 정상 생성되었는지 Google Cloud Console과 Functions 목록에서 확인합니다.

## 5. 관리자 Google 계정 등록

관리자 여부는 Firestore의 `users.role` 값이 아니라 Firebase Auth custom claim `admin: true`로 판정됩니다. 따라서 Firebase Console에서 profile 문서를 직접 수정하는 것만으로는 관리자 페이지가 열리지 않습니다.

### 5.1 관리자 계정 로그인 기록 만들기

1. 아직 운영 Pages가 배포되지 않았다면 로컬 Firebase 설정으로 앱을 실행합니다.
2. 관리자 예정 Google 계정으로 한 번 로그인합니다.
3. Firebase Console > Authentication > Users에서 계정이 생성되었는지 확인합니다.
4. 이메일 주소를 정확히 복사합니다.

### 5.2 custom claim 부여

ADC 권한이 준비된 터미널에서 실행합니다.

```powershell
npm --prefix functions run set-admin -- admin@example.com
```

스크립트가 `admin: true`를 부여했다는 메시지를 출력해야 합니다. 그 다음:

1. 브라우저에서 Google 로그아웃
2. 브라우저를 새로고침
3. 같은 관리자 계정으로 다시 로그인
4. `/atelier/admin` 접근
5. 일반 사용자 계정으로 관리자 페이지가 거부되는지 확인

Custom claim은 기존 ID token에 즉시 반영되지 않을 수 있습니다. 로그아웃/재로그인으로 token을 갱신합니다. 관리자 계정을 추가할 때마다 이 절차를 반복하고, 관리자 목록은 비밀번호 관리자나 운영 문서에서 별도로 관리합니다.

## 6. 로컬 웹 설정과 GitHub Pages 변수 설정

### 6.1 로컬 `.env` 만들기

로컬 개발·운영 전 검수용으로 저장소 루트에 `.env`를 만듭니다.

```powershell
Copy-Item .env.example .env
```

`.env`에는 Firebase Web App 설정과 다음 공개값을 입력합니다.

```dotenv
VITE_FIREBASE_API_KEY=Firebase가 발급한 값
VITE_FIREBASE_AUTH_DOMAIN=Firebase가 발급한 값
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=Firebase가 발급한 정확한 bucket 값
VITE_FIREBASE_MESSAGING_SENDER_ID=Firebase가 발급한 값
VITE_FIREBASE_APP_ID=Firebase가 발급한 값
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_FUNCTIONS_REGION=asia-northeast3
VITE_FUNCTIONS_BASE_URL=https://asia-northeast3-YOUR_PROJECT_ID.cloudfunctions.net
VITE_YOUTUBE_CHANNEL_ID=UCxxxxxxxxxxxxxxxxxxxxxx
VITE_YOUTUBE_URL=https://www.youtube.com/@materialstone
VITE_DISCORD_URL=https://discord.gg/실제초대코드
```

`VITE_FIREBASE_STORAGE_BUCKET`은 프로젝트 ID로 추측하지 말고 Firebase Web App 설정의 값을 그대로 사용합니다. Firebase 설정이 비어 있으면 앱은 Firebase 대신 데모 게임·데모 게시글을 보여주므로, 이 상태를 운영 사이트에 배포하지 않습니다.

### 6.2 GitHub Pages publishing source

GitHub 저장소에서 다음을 설정합니다.

1. Settings > Pages로 이동
2. Build and deployment의 Source를 **GitHub Actions**로 선택
3. Settings > Actions > General에서 Actions가 허용되어 있는지 확인
4. `main` 브랜치 push가 workflow를 실행할 수 있는지 확인
5. `github-pages` environment가 생성되고 배포 권한이 막혀 있지 않은지 확인

저장소에는 `.github/workflows/deploy-pages.yml`이 이미 있으며 다음 작업을 합니다.

- Node.js 설치
- `npm ci`
- `npm run build`
- `dist`를 Pages artifact로 업로드
- GitHub Pages에 배포

GitHub Actions Pages 배포는 workflow에서 `pages: write`, `id-token: write` 권한과 build job에 대한 `needs` 연결이 필요합니다. 자세한 조건은 [GitHub Pages custom workflow 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 확인합니다.

### 6.3 Repository Variables 등록

GitHub 저장소의 Settings > Secrets and variables > Actions > **Variables** > New repository variable에 아래 13개를 등록합니다.

| 변수명 | 값 |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase Web App 설정값 |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Web App 설정값 |
| `VITE_FIREBASE_PROJECT_ID` | 운영 Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Web App 설정값 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App 설정값 |
| `VITE_FIREBASE_APP_ID` | Firebase Web App 설정값 |
| `VITE_FIREBASE_MEASUREMENT_ID` | 사용하지 않으면 빈 값 |
| `VITE_FIREBASE_FUNCTIONS_REGION` | `asia-northeast3` |
| `VITE_FUNCTIONS_BASE_URL` | Functions base URL, `/playGateway` 제외 |
| `VITE_YOUTUBE_CHANNEL_ID` | `UC...` 실제 채널 ID |
| `VITE_YOUTUBE_URL` | 실제 채널 공개 URL |
| `VITE_DISCORD_URL` | 실제 Discord 초대 URL (비우면 링크 숨김) |
| `VITE_APPCHECK_SITE_KEY` | App Check용 reCAPTCHA Enterprise 사이트 키 |

이 변수들은 Vite 빌드 결과에 포함되므로 secret이 아닙니다. `PLAY_SESSION_SECRET`, OAuth client secret, Firebase Admin service account key는 여기에 등록하지 않습니다.

등록 후 변수명이 workflow의 `${{ vars.NAME }}`와 한 글자도 다른지 확인합니다. 특히 `VITE_FUNCTIONS_BASE_URL`을 GitHub **Secret**에 넣으면 현재 workflow가 읽지 못합니다.

## 7. 프런트엔드 로컬 검증

운영값을 `.env`에 넣은 뒤 저장소 루트에서 실행합니다.

```powershell
npm install
npm run lint
npm test -- --run
npm run build
```

`npm run build`가 성공하면 다음을 확인합니다.

- `dist/index.html` 존재
- `dist/404.html` 존재
- `dist/404.html`에 root element와 `/atelier/assets/` 경로가 포함됨
- `dist` 안에 `.env`, secret, Firebase Admin key가 없음

로컬에서 실제 Pages 동작을 흉내 내기 위해 preview를 실행합니다.

```powershell
npm run preview
```

브라우저에서 다음 주소를 각각 직접 입력하고 새로고침합니다.

- `http://127.0.0.1:4173/atelier/`
- `http://127.0.0.1:4173/atelier/game/<게임 ID>`
- `http://127.0.0.1:4173/atelier/community`
- `http://127.0.0.1:4173/atelier/about`
- `http://127.0.0.1:4173/atelier/admin`

## 8. 실제 Pages 배포

### 8.1 배포 전 commit 검토

다음 명령으로 secret과 불필요한 산출물이 포함되지 않았는지 확인합니다.

```powershell
git status --short
git diff -- . ':!package-lock.json'
git ls-files | Select-String '\.env|service-account|secret|dist|node_modules'
```

다음은 commit하지 않습니다.

- 루트 `.env`
- `functions/.env` 및 `functions/.env.<projectId>`
- `PLAY_SESSION_SECRET`
- Firebase service account JSON
- `node_modules`
- `dist`
- 개인 사용자 데이터나 실제 업로드 ZIP

### 8.2 main에 반영

원격 저장소의 기존 `main` 이력을 확인한 뒤 현재 소스 변경을 commit하고 push합니다.

```powershell
git add .
git commit -m "Prepare Atelier for production"
git push origin main
```

현재 작업 폴더가 원격 저장소와 연결되어 있지 않다면 먼저 원격 저장소를 별도 폴더에 clone하고, 현재 소스에서 운영에 필요한 파일만 복사한 뒤 commit합니다. 원격 README 이력을 덮어쓰기 위해 force push하지 않습니다.

### 8.3 Actions와 Pages 결과 확인

1. GitHub Actions에서 `Deploy Atelier to GitHub Pages` workflow를 엽니다.
2. `Install dependencies`, `Build`, `Upload Pages artifact`, `Deploy to GitHub Pages`가 모두 성공하는지 확인합니다.
3. 실패하면 workflow 로그에서 변수명, Node/npm 오류, Vite base path 오류를 먼저 확인합니다.
4. Pages의 배포 URL이 `https://material-stone.github.io/atelier/`인지 확인합니다.
5. Pages가 아직 이전 artifact를 보여주면 Actions의 배포 job과 Pages environment의 최신 deployment를 대조합니다.

## 9. 운영 전 기능 검수

출시 전에 반드시 실제 운영 Firebase 프로젝트 또는 별도 staging 프로젝트에서 아래 순서로 테스트합니다. 운영 데이터에 테스트 게시글을 남기고 싶지 않다면 staging 프로젝트를 먼저 사용합니다.

### 9.1 페이지·라우팅

- [ ] `/atelier/`를 직접 열었을 때 왼쪽 사이드바(모바일은 메뉴 서랍)와 게임 검색 화면이 표시된다.
- [ ] 사이드바의 YouTube 링크가 실제 채널로 이동한다.
- [ ] 소개 화면의 Discord 버튼이 초대 링크로 이동한다(링크가 없으면 "준비 중"으로 비활성화된다).
- [ ] `/atelier/game/<게임 ID>`를 직접 열고 새로고침해도 404가 아니다.
- [ ] `/atelier/community`를 직접 열고 새로고침해도 404가 아니다.
- [ ] `/atelier/admin`을 직접 열어 비관리자 접근이 차단된다.
- [ ] 모바일 폭에서 카드, 게시판, 업로드 폼, 게임 플레이어가 화면 밖으로 넘치지 않는다.

### 9.2 Google 로그인과 접근 등급

테스트 계정은 최소한 익명 브라우저, 일반 Google 계정, YouTube 구독 계정, 관리자 계정으로 나눕니다.

| 계정 상태 | `public` | `login` | `subscriber` | 업로드 |
| --- | ---: | ---: | ---: | ---: |
| 비회원 | 허용 | 거부 | 거부 | 거부 |
| Google 로그인 사용자 | 허용 | 허용 | 구독 확인 전 거부 | 거부 |
| YouTube 구독 확인 사용자 | 허용 | 허용 | 허용 | 거부 |
| `admin: true` 관리자 | 허용 | 허용 | 허용 | 허용 |

검수 항목:

- [ ] 비회원은 공개 게임만 플레이할 수 있다.
- [ ] Google 로그인 후 demo/login 게임이 열린다.
- [ ] prototype/subscriber 게임에서 YouTube 권한 동의 popup이 열린다.
- [ ] 실제 Material Stone 채널을 구독한 계정만 검증에 성공한다.
- [ ] 구독하지 않은 계정은 검증 실패하며 프로토타입이 열리지 않는다.
- [ ] 구독 확인값이 24시간 캐시되는지 확인한다.
- [ ] 24시간이 지나거나 users 문서의 `youtubeVerifiedUntil`이 만료되면 다시 검증해야 한다.
- [ ] 관리자 claim이 없는 계정은 `/admin`에서 upload UI를 보지 못한다.
- [ ] 관리자 claim을 부여한 뒤 로그아웃/재로그인하면 업로드 UI가 보인다.

### 9.3 플레이 세션과 비공개 빌드

- [ ] 공개 게임에서 Play를 눌렀을 때 `getPlaySession`이 성공한다.
- [ ] `playGateway`가 `index.html`을 반환하고 iframe 안에서 상대 경로 asset이 로드된다.
- [ ] iframe의 Fullscreen 버튼이 동작한다.
- [ ] 키보드 입력, pointer lock, gamepad가 필요한 빌드에서 동작한다.
- [ ] Storage Console에서 `game-builds/...`를 브라우저 비로그인 상태로 직접 읽을 수 없다.
- [ ] 만료된 세션 URL은 403 또는 실패 응답을 반환한다.
- [ ] session token의 한 글자를 바꾸면 gateway가 거부한다.
- [ ] `/../`, 절대 경로, 역슬래시를 이용한 path traversal이 거부된다.
- [ ] 로그인 전용·구독 전용 게임의 세션 생성 요청이 서버에서 거부된다.

> [!WARNING]
> 현재 플레이 세션 토큰은 2시간 동안 유효한 bearer URL입니다. URL을 얻은 사람이 만료 전 공유하면 해당 URL을 사용할 수 있습니다. “짧은 만료 시간으로 제한한다”는 운영 기준에는 맞지만, 사용자 계정에 완전히 묶인 비공유 세션이 필요하면 `playGateway`가 Firebase ID token 또는 별도 세션 상태를 추가로 검증하도록 구현을 보강한 뒤 출시합니다.

### 9.4 관리자 게임 업로드

다음 파일을 준비해 정상 업로드와 실패 케이스를 모두 확인합니다.

- 정상 ZIP: 루트에 `index.html`, 모든 asset은 상대 경로
- 실패 ZIP: 루트에 `index.html` 없음
- 실패 ZIP: `../` 또는 절대 경로 포함
- 실패 ZIP: 250MiB 초과
- 실패 ZIP: 압축 해제 결과 1GiB 초과
- 실패 ZIP: 파일 수 20,000개 초과
- 정상 커버: JPG, PNG, WebP 중 하나, 5MiB 이하
- 실패 커버: 다른 MIME type 또는 5MiB 초과

정상 업로드 검수:

- [ ] 제목, 장르 태그, 접근 등급, 대표 이미지, ZIP을 입력한다.
- [ ] 제목을 공백·대소문자만 바꾸어 다시 입력하면 기존 게임 경고가 표시된다.
- [ ] 기존 게임 업데이트 시 좋아요 수와 댓글이 유지된다.
- [ ] 업로드 직후 `buildStatus`가 `processing`이다.
- [ ] Storage trigger가 ZIP을 검사하고 `game-builds/{gameId}/{versionId}/...`로 압축을 푼다.
- [ ] 처리 성공 시 `buildStatus`가 `published`가 되고 허브에 노출된다.
- [ ] 처리 실패 시 `buildStatus`가 `failed`가 되고 Functions 로그와 Firestore의 `buildError`를 확인할 수 있다.
- [ ] 처리 전 게임이 허브에 공개되지 않는다.
- [ ] 실패한 `incoming-builds` 객체와 이전 버전 빌드가 비용을 계속 만들지 않는지 확인한다.

웹빌드는 ZIP 루트에 `index.html`이 있어야 하며 루트 기준 상대 경로로 asset을 참조해야 합니다. 업로드 후에는 Firebase Console의 Functions logs에서 `processBuildZip` 결과를 확인합니다.

### 9.5 커뮤니티·댓글·좋아요

- [ ] 비회원은 게시판과 게임 댓글을 읽을 수 있다.
- [ ] 비회원은 글, 댓글, 좋아요를 작성할 수 없다.
- [ ] 게시글 100자 초과가 UI와 Functions 양쪽에서 거부된다.
- [ ] 댓글 50자 초과가 UI와 Functions 양쪽에서 거부된다.
- [ ] 게시글 사진은 최대 1장이고 JPG/PNG/WebP, 5MiB 이하만 허용된다.
- [ ] 댓글에 답글을 달 수 있다.
- [ ] 답글에 다시 답글을 달면 깊이 1 초과로 거부된다.
- [ ] 같은 사용자가 게임 또는 게시글에 좋아요를 반복 클릭해도 수가 중복 증가하지 않는다.
- [ ] 좋아요를 다시 클릭하면 토글되어 수가 감소한다.
- [ ] Firestore에서 `likeRecords`를 클라이언트가 직접 쓰거나 수정할 수 없다.
- [ ] 게시판 사진이 게시글 작성자의 경로에만 업로드된다.

### 9.6 월별 보존 정리

게시글의 `monthKey`는 한국 시간 기준 `YYYY-MM`입니다. 예약 함수는 매월 1일 03:00(KST)에 약 두 달 전 월을 평가합니다. 예를 들어 8월 1일 실행이면 6월 게시글을 평가합니다.

- [ ] 테스트 환경에서 보존 대상 월의 게시글을 준비한다.
- [ ] 좋아요가 가장 많은 게시글이 10개 이상이면 그 게시글 하나만 `retentionStatus: preserved`가 된다.
- [ ] 좋아요 수가 같으면 작성 시간이 빠른 게시글이 선택된다.
- [ ] 작성 시간까지 같으면 문서 ID가 작은 게시글이 선택된다.
- [ ] 보존되지 않는 게시글은 게시글 문서, 연결 댓글, Storage 사진이 함께 삭제된다.
- [ ] 보존 게시글의 댓글과 사진은 남는다.
- [ ] 해당 월의 최고 좋아요가 10 미만이면 해당 월 게시글이 모두 삭제된다.
- [ ] Cloud Scheduler가 `monthlyRetentionSweep`를 한 번만 실행하도록 되어 있는지 확인한다.

현재 저장소에는 Rules/Functions Emulator Suite를 위한 별도 테스트 harness가 포함되어 있지 않습니다. 월별 삭제는 실제 운영 DB에서 수동으로 재현하지 말고, staging 프로젝트나 Emulator Suite용 테스트를 추가해 검증합니다.

## 10. 출시 전 보안·정책 확인

### 10.1 App Check

원래 운영 계획에는 App Check가 포함되어 있습니다. 그러나 현재 코드에는 웹 SDK의 `initializeAppCheck`와 Functions의 `enforceAppCheck` 설정이 연결되어 있지 않습니다. 따라서 Firebase Console에서 App Check만 켜고 enforcement를 바로 활성화하면 정상 사용자까지 차단될 수 있습니다.

출시 전에 다음 중 하나를 결정합니다.

1. App Check를 프런트엔드와 callable Functions에 연결하고, `playGateway`에도 App Check 또는 이에 준하는 검증을 추가한 뒤 enforcement를 켭니다.
2. 초기 private beta 동안은 HMAC 세션, Rules, Functions 인증, 업로드 제한으로 운영하되 App Check를 미적용 상태로 명시하고 사용량을 매일 관찰합니다.

공개 운영에서 비용·봇 abuse를 줄이려면 1번을 권장합니다. App Check 적용 시 localhost에는 debug provider를 사용하고 debug token을 운영에 재사용하지 않습니다. [Firebase App Check 웹 문서](https://firebase.google.com/docs/app-check/web/recaptcha-provider)와 [callable App Check 문서](https://firebase.google.com/docs/functions/callable)를 확인합니다.

### 10.2 플레이 파일 공유 정책

게임 파일 자체는 Storage에서 비공개이고 gateway가 세션 URL을 발급합니다. 다만 현재 세션 URL은 2시간 bearer URL이므로 URL 복사 방지까지 보장하지 않습니다. 운영 정책을 다음 중 하나로 명시합니다.

- 일반 공개/데모: 2시간 내 공유 가능성을 감수하고 만료 후 차단
- 제한적인 playtest: 세션을 계정·nonce·서버 상태에 묶고 gateway에서 추가 검증
- 민감한 프로토타입: 별도 초대 계정, 더 짧은 만료, URL 재사용 방지 구현

### 10.3 개인정보와 콘텐츠 정책

현재 게시글과 댓글에는 Google 계정의 이름 또는 이메일 fallback이 작성자 표시값으로 저장될 수 있으며, 게시판 사진은 공개 읽기 규칙입니다. 출시 전에 다음 문서를 Pages의 접근 가능한 위치에 제공하거나 외부 정책 페이지로 연결합니다.

- 개인정보처리방침
- Google 로그인·YouTube 권한 요청 목적
- 저장되는 표시 이름, 댓글, 게시글, 이미지와 보존 기간
- 게시글 자동 삭제·보존 기준
- 삭제 요청·문의 방법
- 불법·혐오·도배·권리 침해 콘텐츠 신고와 운영자 조치 기준
- 게임 빌드에 포함된 제3자 asset의 라이선스 확인 책임
- 계정 로그아웃·탈퇴 및 데이터 삭제 요청 처리 방법

게시판 사진과 게임 커버의 저작권·초상권을 확인하고, YouTube API 사용 조건과 Google API Services User Data Policy도 운영 정책에 반영합니다.

### 10.4 현재 구현을 보완하거나 운영으로 관리해야 하는 항목

출시 전에 아래 항목을 “코드 보완 완료” 또는 “운영 정책으로 승인” 중 하나로 기록합니다.

- [ ] App Check 연결과 enforcement 수준
- [ ] 2시간 play URL 공유 허용 범위
- [ ] 기존 게임 업데이트 때 남는 이전 `game-builds/{gameId}/{oldVersionId}` 객체의 보관·삭제 정책
- [ ] 업로드 실패 시 남는 `incoming-builds` 객체의 정리 정책
- [ ] 게시글 신고·삭제·차단을 운영자가 처리할 방법
- [ ] Emulator Suite 또는 staging 기반의 Rules/Functions 자동 테스트
- [ ] 보존된 게시글과 중요한 게임 메타데이터의 별도 백업
- [ ] 관리자 claim 회수 절차

특히 기존 게임을 새 버전으로 업데이트하면 현재 함수는 새 버전을 게시하지만 이전 빌드 파일을 자동 삭제하지 않습니다. Storage 비용을 줄이려면 이전 버전 보관 기간과 삭제를 별도로 운영하거나 삭제 함수를 추가합니다.

## 11. 출시 승인 체크리스트

아래 항목이 모두 체크된 뒤에 공개 링크를 외부에 공지합니다.

- [ ] Firebase 운영 Project ID와 Pages URL이 운영값 표와 일치한다.
- [ ] Firebase가 Blaze이고 예산 알림 수신자가 등록되어 있다.
- [ ] Firestore Native mode와 Storage bucket이 생성되어 있다.
- [ ] Firestore Rules와 indexes가 배포되어 있다.
- [ ] Storage Rules가 배포되어 있고 game builds가 직접 공개되지 않는다.
- [ ] Google provider와 Pages domain이 활성화되어 있다.
- [ ] YouTube Data API v3, OAuth 동의 화면, `youtube.readonly` scope가 준비되어 있다.
- [ ] `YOUTUBE_CHANNEL_ID`가 실제 `UC...` ID다.
- [ ] Functions parameter와 `PLAY_SESSION_SECRET`가 운영값이다.
- [ ] 모든 Functions가 배포되었고 로그에 초기 오류가 없다.
- [ ] 관리자 계정에 `admin: true` claim이 있고 재로그인 후 관리자 페이지가 열린다.
- [ ] GitHub Actions Repository Variables 13개가 등록되어 있다.
- [ ] `main` push가 성공하고 Pages deployment가 완료되었다.
- [ ] Pages의 홈·허브·커뮤니티·관리자 직접 접근과 새로고침이 동작한다.
- [ ] 익명/로그인/구독자/관리자 접근 등급 테스트가 통과했다.
- [ ] 정상 ZIP 업로드와 실패 ZIP 검수가 통과했다.
- [ ] 게시글·댓글·이미지·답글 깊이·좋아요 제한 테스트가 통과했다.
- [ ] 월별 보존 정리를 staging 또는 emulator에서 검증했다.
- [ ] 개인정보처리방침, 커뮤니티 운영 기준, 문의 채널이 공개되어 있다.
- [ ] App Check 및 play URL 공유 정책을 승인했다.
- [ ] 첫 공개 게임, 첫 로그인 데모, 첫 구독자 프로토타입이 준비되어 있다.

## 12. 출시 후 정기 운영

### 매 배포·매 업로드

- GitHub Actions 성공 여부와 Pages 최신 deployment 확인
- Functions 로그에서 오류·권한 거부·ZIP 처리 실패 확인
- 새 게임의 `processing → published` 전환 확인
- 모바일에서 게임 iframe과 fullscreen 확인
- 기존 게임 업데이트 후 좋아요·댓글 유지 확인

### 매일 또는 주 1회

- Firebase Usage/Billing dashboard 확인
- Storage 객체 증가량과 이전 빌드·실패 ZIP 확인
- Firestore 읽기/쓰기 급증 확인
- Functions error rate와 `playGateway` 4xx/5xx 확인
- 게시판 신고·삭제 요청 처리
- 관리자 계정 목록과 최근 로그인 확인

### 매월 1일

- `monthlyRetentionSweep` 실행 성공 로그 확인
- 직전 평가 월의 보존 게시글 1개 또는 전체 삭제 결과 확인
- 보존된 게시글의 댓글·사진이 함께 남았는지 확인
- 삭제된 게시글의 댓글·사진이 남아 있지 않은지 표본 확인
- 예산 알림과 실제 사용량을 비교

### 변경이 있을 때

- YouTube 채널 URL이나 ID 변경 시 Functions parameter와 GitHub variable 모두 갱신
- Pages 도메인 변경 시 `PAGES_ORIGIN`, Firebase Authorized domains, Pages URL, CSP를 함께 갱신
- Functions base URL 변경 시 Functions parameter와 GitHub variable 모두 갱신
- `PLAY_SESSION_SECRET` 교체 시 Functions를 재배포하고 기존 세션이 만료되는지 확인
- 관리자 교체 시 기존 계정의 custom claim 회수 여부를 확인
- Rules 변경 시 staging에서 비회원·일반 사용자·관리자 권한을 재검증

## 13. 문제 해결 순서

| 증상 | 먼저 확인할 것 | 조치 |
| --- | --- | --- |
| 화면에 데모 게임만 표시됨 | Firebase Web config가 비어 있는지 | `.env` 또는 GitHub Variables 6개 핵심 Firebase 값 확인 후 재빌드 |
| Google 로그인에서 unauthorized domain | Firebase Auth Authorized domains | `material-stone.github.io`와 실제 접속 host 추가 |
| 관리자 페이지가 거부됨 | Auth custom claim과 token 갱신 | 이메일 확인, `set-admin` 재실행, 로그아웃/재로그인 |
| 구독 확인 실패 | YouTube API, OAuth scope, channel ID | API Enable, `UC...` ID 확인, test user/동의 화면 확인 |
| 게임 목록이 비어 있음 | Firestore `games.buildStatus`, Rules/indexes | `published` 여부, Rules/indexes 배포, Functions 오류 확인 |
| 업로드가 processing에서 멈춤 | Storage trigger와 `processBuildZip` 로그 | Storage bucket, Functions 배포, ZIP 경로/용량 확인 |
| 업로드가 failed가 됨 | 게임 문서의 `buildError` | 루트 `index.html`, 상대 경로, path traversal, 압축 해제 크기 확인 |
| 플레이어가 404 | Functions base URL과 `buildVersionId` | URL에 `/playGateway`를 중복 입력하지 않았는지, published 상태 확인 |
| iframe이 로드되지만 asset이 깨짐 | ZIP 내부 경로 | 절대 경로 대신 상대 경로 사용, `index.html` 기준으로 재압축 |
| 게시글 사진이 안 보임 | Storage Rules와 업로드 완료 여부 | 게시글 ID 경로, MIME type, 5MiB 제한, upload 후 URL 확인 |
| 좋아요 수가 기대와 다름 | `likeRecords`와 transaction | 같은 사용자의 중복 기록, 잘못된 target ID, Functions 로그 확인 |
| 비용이 갑자기 증가함 | Storage/Functions/Firestore 사용량 | App Check, Functions 로그, 대용량 빌드·이전 버전·봇 요청 확인 |
| Pages asset 404 | Vite base와 `/atelier/` 경로 | `vite.config.ts`의 `/atelier/`, `dist/404.html`, Pages URL 확인 |

## 14. 참고 링크

- [Firebase CLI reference](https://firebase.google.com/docs/cli)
- [Firebase 환경 설정 및 Secret Manager](https://firebase.google.com/docs/functions/config-env)
- [Firebase 요금제와 Blaze](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firebase Google 로그인](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase callable Functions](https://firebase.google.com/docs/functions/callable)
- [Firebase App Check 웹 설정](https://firebase.google.com/docs/app-check/web/recaptcha-provider)
- [YouTube subscriptions.list](https://developers.google.com/youtube/v3/docs/subscriptions/list)
- [GitHub Pages custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 완료 기록

운영자는 아래에 실행 날짜와 담당자를 기록합니다.

| 단계 | 완료일 | 담당자 | 비고 |
| --- | --- | --- | --- |
| Firebase 프로젝트·Billing |  |  |  |
| Auth·YouTube OAuth |  |  |  |
| Firestore·Storage·Functions 배포 |  |  |  |
| 관리자 claim |  |  |  |
| GitHub Variables·Pages 배포 |  |  |  |
| 기능·보안 검수 |  |  |  |
| 개인정보·커뮤니티 정책 공개 |  |  |  |
| 운영 승인 |  |  |  |
