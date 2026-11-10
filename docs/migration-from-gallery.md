# shit-game-gallery → Atelier 마이그레이션

원조 프로젝트 `shit-game-gallery`(Vercel + Firebase `shit-game-gallery`)를 Atelier(GitHub Pages + 새 Firebase 프로젝트)로 옮기고 원조를 제거하기 위한 순서입니다.

## 무엇이 어디로 가는가

| 원조 | Atelier | 비고 |
| --- | --- | --- |
| Vercel 정적 페이지 + `api/*.js` | GitHub Pages + Firebase Functions | Blaze 요금제 필요 |
| Firestore `games` (6개) | `games` 같은 문서 ID | `tags`→`genres`, `earlyAccess`→`accessLevel: member`, 나머지→`subscriber` |
| Storage `thumbnails/{id}` | `game-covers/{id}/cover` | 스크립트가 복사 |
| Storage `games/{id}/*.zip` | `game-builds/{id}/{version}/…` | `incoming-builds`에 올려 `processBuildZip`이 압축 해제 |
| Auth Google 사용자 (2명) | 같은 UID로 import | 다시 가입할 필요 없음 |
| `users.tier` 캐시 | 옮기지 않음 | 1시간짜리 캐시였음. 구독자는 다시 확인, 멤버는 `set-member`로 부여 |
| `ADMIN_UID` 환경변수 | `admin: true` custom claim | `npm --prefix functions run set-admin -- <email>` |
| 비구독자 주간 랜덤 3~5개 | `subscriber` 게임 중 KST 주간 로테이션 | 클라이언트·서버가 같은 시드 사용 |
| `member` 티어·얼리 액세스 | `accessLevel: member` + `users.memberUntil` | 아래 주의 참고 |
| 관리자 수정·삭제·Storage 통계·고아 정리 | 관리 페이지의 게임 목록 / 저장 공간 탭 | `updateGameMeta`, `deleteGame`, `storageReport`, `deleteStorageOrphans` |
| Unity WebGL | ZIP 업로드 그대로 지원 | `.gz`/`.br` asset에 `Content-Encoding` 헤더 자동 설정 |

### 환경값 대응

| 원조 변수 | Atelier |
| --- | --- |
| `FIREBASE_API_KEY` 등 웹 설정 | 새 프로젝트 값을 `VITE_FIREBASE_*`에 입력 (원조 값은 재사용 불가) |
| `YOUTUBE_CHANNEL_ID` | `VITE_YOUTUBE_CHANNEL_ID`, `functions/.env`의 `YOUTUBE_CHANNEL_ID` (로컬 `.env` 두 곳에 이미 복사됨) |
| `FIREBASE_ADMIN_CERT` | 필요 없음. Functions는 기본 서비스 계정 사용. 원조 키는 마이그레이션 원본 읽기에만 사용 |
| `YOUTUBE_API_KEY`, `GOOGLE_CLIENT_ID` | 필요 없음. 구독 확인은 사용자 OAuth 토큰만 사용 |
| `ADMIN_UID` | custom claim으로 대체 |
| — | `PLAY_SESSION_SECRET` 새로 생성 (Secret Manager) |

> [!WARNING]
> **멤버십은 자동 확인되지 않습니다.** YouTube Data API의 `members.list`는 채널 소유자 본인 토큰으로 자기 채널 멤버를 나열하는 API라, 시청자 토큰으로는 멤버 여부를 알 수 없습니다. 원조의 `member` 판정도 실제로는 동작하지 않았습니다. Atelier에서는 운영자가 직접 부여합니다.
>
> ```powershell
> npm --prefix functions run set-member -- member@example.com 31   # 31일
> npm --prefix functions run set-member -- member@example.com off  # 해제
> ```

## 1. 원조 보존

원조 저장소 `D:\area\dev\alone\ShitGameGallary`에는 커밋되지 않은 변경(관리자 수정·삭제·Storage API)이 있습니다. 제거 전에 커밋·push하거나 저장소를 보관(archive)합니다.

## 2. 새 Firebase 프로젝트 준비

[운영 가이드](production-setup-guide.md) 2~5장을 새 프로젝트로 진행합니다. Blaze, Firestore, Storage, Google 로그인, YouTube Data API v3, OAuth 동의 화면, `PLAY_SESSION_SECRET`이 대상입니다. 그 다음 Rules·indexes·Functions를 배포합니다.

```powershell
firebase use --add            # 새 프로젝트 선택
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

`processBuildZip`이 배포되어 있어야 다음 단계에서 빌드가 처리됩니다.

## 3. 데이터 복사

원조 서비스 계정 키는 `D:\archive\dev\projects\alone\shit-game-gallery\docs\`에 있습니다. 대상 프로젝트는 ADC(`gcloud auth application-default login`) 또는 `--target-key`로 인증합니다.

```powershell
# 먼저 dry run: 무엇을 옮길지만 출력
npm --prefix functions run migrate-gallery -- --source-key=D:\archive\dev\projects\alone\shit-game-gallery\docs\<key>.json --target-project=NEW_PROJECT_ID --target-bucket=NEW_BUCKET

# 확인 후 실제 실행
npm --prefix functions run migrate-gallery -- --source-key=... --target-project=NEW_PROJECT_ID --target-bucket=NEW_BUCKET --apply
```

- 이미 대상에 있는 사용자·게임은 건너뛰므로 다시 실행해도 안전합니다.
- 모든 게임을 공개로 옮기려면 `--default-access=public`을 붙입니다. 기본은 원조처럼 `subscriber`(주간 로테이션 + 구독자)입니다.
- 실행 후 관리자 계정에 claim을 부여합니다: `npm --prefix functions run set-admin -- <관리자 email>`.
- 관리 → 게임 목록에서 6개 게임이 `PUBLISHED`가 되는지, 각 게임이 실제로 플레이되는지 확인합니다.

## 4. Atelier 배포

[운영 가이드](production-setup-guide.md) 6~9장대로 GitHub Variables를 새 프로젝트 값으로 등록하고 Pages를 배포·검수합니다.

## 5. 원조 제거 (모든 검수 후)

- [ ] Atelier에서 6개 게임 플레이, 로그인, 구독 확인, 관리자 업로드 확인
- [ ] 원조 저장소 커밋·push 또는 archive
- [ ] Vercel 프로젝트 `shit-game-gallery-app` 삭제
- [ ] GitHub 저장소 `YouHyunwoo/shit-game-gallery` archive 또는 삭제
- [ ] 원조 서비스 계정 키 폐기: Google Cloud Console → IAM → 서비스 계정 → 키 삭제. 로컬 JSON 파일과 `.env.local`도 삭제
- [ ] 원조 YouTube API 키 삭제 (Credentials)
- [ ] Firebase 프로젝트 `shit-game-gallery` 삭제 (30일 유예 후 영구 삭제)
