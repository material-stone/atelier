# Atelier

Material Stone Games의 게임·데모·프로토타입 허브입니다.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Firebase 환경변수가 비어 있으면 화면은 샘플 게임과 게시글로 렌더링됩니다. 실제 로그인, 게시판, 게임 업로드를 사용하려면 `.env`에 Firebase Web 설정과 Functions URL을 입력해야 합니다.

## Build and test

```bash
npm run lint
npm test
npm run build
```

`npm run build`는 사이트 루트(`/`) 기준의 `dist/`와 SPA 새로고침용 `dist/404.html`을 생성합니다.

## Firebase setup

1. Firebase 프로젝트를 Blaze 요금제로 전환합니다. Cloud Storage와 Cloud Functions가 필요합니다.
2. Google Authentication을 켜고 `atelier.materialstone.dev`를 authorized domain에 추가합니다.
3. Firestore, Storage, Cloud Functions를 초기화한 뒤 Rules와 indexes를 배포합니다.
4. YouTube Data API를 활성화하고 Functions 환경값을 설정합니다.

```bash
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

Functions 환경값은 Firebase Secret Manager/Functions params로 관리합니다.

```bash
firebase functions:secrets:set PLAY_SESSION_SECRET
```

업로드 API 키는 시크릿이 아니라 사이트에서 발급합니다(설정 → 업로드 키, 또는 `atelier-cli login`). [docs/upload-api.md](docs/upload-api.md)를 참고합니다.

필수 값은 `YOUTUBE_CHANNEL_ID`, `PAGES_ORIGIN`, `FUNCTIONS_BASE_URL`입니다. 관리자 Google 계정이 한 번 로그인한 뒤 Application Default Credentials가 준비된 환경에서 다음 명령으로 custom claim을 부여합니다.

```bash
npm --prefix functions run set-admin -- admin@example.com
```

관리자 계정은 로그아웃 후 다시 로그인해야 새 claim이 반영됩니다.

## GitHub Pages

사이트 주소는 `https://atelier.materialstone.dev`입니다. Cloudflare DNS에 `atelier` CNAME → `material-stone.github.io`(프록시 끔, DNS only)를 두고, Repository Settings → Pages → Custom domain에 같은 주소를 넣습니다. `material-stone.github.io/atelier`와 옛 주소 `material-stone-games.github.io/atelier`는 이 주소로 넘어갑니다.

Repository Settings → Pages에서 Source를 **GitHub Actions**로 선택합니다. 다음 Repository Variables를 등록하면 `main` push마다 Pages가 배포됩니다.

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_FUNCTIONS_REGION`
- `VITE_FUNCTIONS_BASE_URL`
- `VITE_YOUTUBE_CHANNEL_ID`
- `VITE_YOUTUBE_URL`
- `VITE_DISCORD_URL` (비우면 Discord 링크를 숨김)
- `VITE_APPCHECK_SITE_KEY` (reCAPTCHA Enterprise 사이트 키. 설정하면 App Check 사용, 모든 callable은 App Check를 강제)

Firebase Web config는 브라우저에 노출되는 값이므로 비밀값으로 취급하지 않습니다. 게임 세션 서명 키와 서버 자격증명은 저장소에 넣지 않습니다.

## Access levels

| 등급 | 플레이 가능 |
| --- | --- |
| `public` | 누구나 |
| `login` | Google 로그인 사용자 |
| `subscriber` | YouTube 구독 확인 사용자·멤버. 매주(KST 월요일 기준) 3~5개는 누구에게나 무료 |
| `member` | 채널 멤버십 회원(`npm --prefix functions run set-member -- <email> [days\|off]`로 부여) |

관리자(`admin: true`)는 모든 등급을 플레이할 수 있습니다.

## Migrating from shit-game-gallery

원조 프로젝트의 데이터·환경값 이전과 제거 순서는 [docs/migration-from-gallery.md](docs/migration-from-gallery.md)를 따릅니다.

## Web build contract

관리자가 업로드하는 ZIP은 루트(또는 하나의 최상위 폴더)에 `index.html`이 있어야 하며 웹빌드의 asset 경로는 상대 경로여야 합니다. Unity WebGL의 `.gz`/`.br` asset에는 `Content-Encoding`이 붙습니다. HTML, CSS, JS는 gateway가 전달하고, 모델·이미지·오디오·폰트·`.wasm` 같은 바이너리는 서명 URL로 Cloud Storage에서 바로 내려갑니다. 기존 게임에 새 빌드를 올리면 처리 완료까지 이전 빌드가 계속 공개되고, 성공 시 이전 빌드 파일은 삭제됩니다. 경로 순회, 절대 경로, 심볼릭 링크, 250MiB 초과 ZIP, 압축 해제 후 1GiB 초과 빌드는 거부됩니다.

브라우저 없이 올리려면 `atelier-cli`(`npm install -g @material-stone/atelier-cli`)와 [업로드 API](docs/upload-api.md)를 씁니다. 업로드 룸과 같은 검사를 거치고, 기존 게임은 빌드만 바꿀 수 있습니다. 공개 중인 게임을 업데이트할 때 바꾼 게임 정보는 새 빌드가 공개될 때 함께 반영됩니다(업로드 룸도 동일).

전체화면에는 플레이어 UI가 없으므로 웹빌드는 게임 메뉴에 나가기 버튼을 넣어야 합니다. 나가기 신호와 실행 환경 구분은 [게임 연동 가이드](docs/game-integration.md)를 참고합니다.

## Decision log

기능 추가·수정 때 사용자와 Claude가 내린 판단과 이유는 [docs/decisions](docs/decisions/README.md)에 나눠서 기록합니다.

## Cost guardrails

Blaze는 종량제이므로 Google Cloud Billing 예산 알림, Functions `maxInstances`, App Check, 파일 크기 제한을 함께 설정합니다. 예산 알림은 자동 지출 차단이 아니므로 초기에는 낮은 max instance와 보수적인 업로드 제한으로 운영합니다. 게임 파일은 무료 할당량이 적용되는 미국 버킷에 둡니다. 절차는 [게임 저장소 미국 버킷 이관](docs/storage-us-migration.md)을 참고합니다.
