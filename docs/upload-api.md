# 업로드 API

웹페이지 업로드 룸을 거치지 않고 스크립트(또는 Claude)가 게임 빌드를 올리는 경로입니다. 업로드 룸은 그대로 두고, 같은 처리 파이프라인에 들어가는 입구를 하나 더 만든 것입니다.

## 구조

```
atelier-cli (tools/atelier-cli)
  │ 1. POST /games  (업로드 키, 게임 정보, 파일 크기)
  ▼
uploadApi 함수 (asia-northeast3) ── 게임 문서 갱신 + 업로드 세션 URL 발급
  │ 2. 표지·ZIP을 세션 URL로 Cloud Storage에 직접 PUT (8MiB씩, 끊기면 이어서)
  ▼
Cloud Storage incoming-builds/upload-api/{gameId}/{versionId}.zip
  │ 3. 기존 processBuildZip 트리거가 검사·압축 해제·공개
  ▼
CLI가 GET /games/{id}를 5초마다 확인해 공개 또는 실패를 출력
```

- 파일은 함수를 거치지 않습니다. 함수 요청 크기 제한(32MB)과 함수 전송 요금을 피하고, 큰 ZIP도 웹 업로드와 똑같이 250MiB까지 올립니다.
- 검사·압축 해제·이전 빌드 정리는 웹 업로드와 같은 `processBuildZip`이 합니다. 업로드 경로만 다르고 결과는 같습니다.
- 기존 게임을 업데이트할 때 생략한 항목(제목, 설명, 장르, 접근 등급, 초대 이메일)은 지금 값을 그대로 유지합니다. 웹 업로드 룸은 폼 내용으로 덮어쓰는 점이 다릅니다.
- 공개 중인 게임을 업데이트할 때 바꾼 게임 정보는 **새 빌드가 공개되는 순간 함께** 반영됩니다. 그 전까지는 `pendingGameUpdates/{versionId}`(클라이언트 접근 불가)에 보관하고, 처리 실패나 취소 시 버립니다. 웹 업로드 룸도 같은 코드를 써서 똑같이 동작합니다.

## 처음 한 번 설정

1. 함수를 배포합니다. 미리 준비할 시크릿은 없습니다. 사이트도 main에 push되면 GitHub Pages로 함께 배포됩니다(승인 페이지 `/cli-login`과 설정 창의 업로드 키 탭).

   ```bash
   firebase deploy --only functions
   ```

2. CLI를 전역 명령으로 설치합니다. npm에 올라가 있으면 어느 PC에서든 이렇게 설치합니다.

   ```bash
   npm install -g @material-stone/atelier-cli
   ```

   저장소 코드를 바로 쓰려면 **Atelier 원본 체크아웃**(worktree가 아닌 곳)의 `tools/atelier-cli`에서 `npm link`를 실행합니다. 링크라서 저장소를 pull하면 바로 새 버전이 됩니다. worktree에서 링크하면 worktree가 지워질 때 명령이 깨집니다.

3. 로그인합니다. 브라우저가 열리면 관리자 Google 계정으로 로그인하고, 터미널에 보이는 코드와 같은지 확인한 뒤 승인합니다. 이 기기 전용 키가 `~/.atelier-cli/config`에 저장되어, 이 PC의 모든 프로젝트가 같은 키를 씁니다. 키 원문은 화면에 나오지 않습니다.

   ```bash
   atelier-cli login
   ```

4. Claude가 다른 프로젝트에서도 쓰도록 스킬을 전역 스킬 폴더에 복사합니다. 원본은 `tools/atelier-cli/skill/SKILL.md`이며, 고치면 다시 복사합니다.

   ```bash
   mkdir -p ~/.claude/skills/atelier-upload
   cp tools/atelier-cli/skill/SKILL.md ~/.claude/skills/atelier-upload/SKILL.md
   ```

설정은 환경변수 > `~/.atelier-cli/config` 순서로 읽고, 서버 주소는 둘 다 없으면 기본값을 씁니다. 확인은 `atelier-cli config`(키는 가려서 표시)로 합니다.

## npm 배포

패키지 이름은 `@material-stone/atelier-cli`, 명령 이름은 `atelier-cli`입니다(`atelier-cli`라는 패키지 이름은 npm에서 이미 다른 사람이 쓰고 있습니다). 올리는 파일은 `cli.mjs`와 `README.md`뿐이고, 스킬과 키는 들어가지 않습니다.

```bash
cd tools/atelier-cli
npm version patch            # 버전 올리기
npm publish --auth-type=web  # 브라우저 인증 링크가 나오면 보안 키로 승인
```

- npm 로그인(`npm login --auth-type=web`)과 npm `material-stone` 조직 권한이 필요합니다.
- npm 계정은 2단계 인증이 필수입니다. 새로 설정할 때는 보안 키(Windows Hello, 패스키 등)만 고를 수 있어서, `--otp` 코드 대신 브라우저 인증으로 게시합니다.
- 반드시 `tools/atelier-cli`에서 실행합니다. 저장소 루트는 웹사이트 패키지라 `private`로 막혀 있습니다.
- `.gitattributes`가 이 폴더의 줄바꿈을 LF로 고정합니다. CRLF로 올라가면 macOS·Linux에서 `#!/usr/bin/env node`가 깨집니다.

설치는 누구나 할 수 있지만, 키는 Atelier 관리자가 승인해야 받을 수 있어서 관리자가 아니면 업로드할 수 없습니다.

## 업로드 키

키는 Atelier가 발급하고, 서버에는 SHA-256 해시만 `apiKeys/{hash}`에 저장합니다(클라이언트 접근 불가). 그래서 키 원문은 발급 직후 한 번만 볼 수 있습니다.

| 하는 일 | 방법 |
| --- | --- |
| 이 기기에 키 받기 | `atelier-cli login` → 브라우저에서 승인 |
| 브라우저 없는 곳(CI, 서버)용 키 | 설정 → 업로드 키 → 새 키 발급 → 복사해 `ATELIER_UPLOAD_KEY` 환경변수에 넣거나 `atelier-cli login --with-key`로 붙여 넣기 |
| 키 목록, 마지막 사용 시각 보기 | 설정 → 업로드 키 (관리자에게만 보임) |
| 키 폐기 | 설정 → 업로드 키 → 폐기. 즉시 적용되고 재배포가 필요 없습니다 |
| 이 기기에서 로그아웃 | `atelier-cli logout` (서버에서 폐기하고 설정 파일에서 지움) |

### CLI 로그인 흐름

```
CLI ── POST /cli/sessions ──▶ uploadApi: 코드(BX4K-9TQM)와 폴링 토큰 발급, 10분 유효
 │  브라우저로 SITE_URL/cli-login?code=BX4K-9TQM 열기
 │                              관리자: Google 로그인 → 코드 확인 → 승인 (approveCliLogin)
CLI ── POST /cli/sessions/{id}/token (3초마다) ──▶ 승인됐으면 이때 키를 만들어 한 번만 돌려줌
 ▼
~/.atelier-cli/config에 저장
```

- 승인 전에는 키가 존재하지 않고, 승인 후 CLI가 받아 가는 순간 만들어집니다. 그래서 키 원문은 서버 어디에도 저장되지 않습니다.
- 폴링 토큰은 CLI만 갖고 있어서, 코드를 본 다른 사람이 키를 받아 갈 수 없습니다.
- 인증 없이 열린 경로라서 만료된 요청은 새 요청이 올 때 지우고, 진행 중인 요청은 최대 20개로 제한합니다.
- 승인 페이지 주소는 Functions 파라미터 `SITE_URL`(기본값 `https://material-stone.github.io/atelier`)로 만듭니다.

## 사용법

```bash
# 새 게임 (표지 필수)
atelier-cli upload build.zip --title "Ember Archive" --access public --genres "Adventure,Puzzle" --description "조작: 방향키" --cover cover.png

# 기존 게임에 새 빌드만 (게임 정보는 그대로)
atelier-cli upload build.zip --title "Ember Archive"
atelier-cli upload build.zip --game <gameId>

# 상태 확인, 미리 검사
atelier-cli status <gameId>
atelier-cli upload build.zip --title "Ember Archive" --dry-run
```

전체 옵션은 `atelier-cli help`로 봅니다. Node 18 이상이면 의존성 설치가 필요 없습니다. 전역 설치 전에는 `node tools/atelier-cli/cli.mjs`로 실행합니다.

다른 프로젝트에서 Claude에게 "Atelier에 올려줘"라고 하면 `atelier-upload` 스킬이 빌드 폴더를 ZIP으로 묶고 이 CLI로 올립니다.

## 중간에 멈췄을 때

| 상황 | 동작 |
| --- | --- |
| 전송 중 연결이 잠깐 끊김 | 최대 5번 다시 시도하고, 서버가 받은 위치부터 이어서 올립니다 |
| Ctrl+C | 업로드 세션을 끊고 서버를 되돌립니다. 새 게임은 문서·표지·초대 목록을 지우고, 업데이트는 대기 표시만 지워 이전 빌드가 계속 공개됩니다 |
| 재시도 실패, 창 닫기, PC 종료 | 진행 상태를 `~/.atelier-cli/state/`에 남깁니다. **같은 명령을 다시 실행하면 이어서** 올립니다 |
| 이어 올리지 않고 그만두기 | 같은 명령에 `--cancel`을 붙여 실행하면 Ctrl+C와 같이 되돌립니다 |
| ZIP을 다 올린 뒤 Ctrl+C | 서버 처리는 이미 시작돼 취소하지 않고, 기다리기만 멈춥니다 |

- "같은 명령"은 같은 ZIP·표지 파일(경로, 크기, 수정 시각)과 같은 옵션을 뜻합니다. 파일을 다시 빌드했으면 새 업로드로 시작합니다.
- 업로드 세션은 일주일 동안 유효해서 6일이 지난 진행 상태는 버립니다.
- 업데이트는 ZIP을 먼저, 표지를 나중에 올립니다. 그래서 중간에 멈춰도 표지만 바뀌는 일이 없습니다. 새 게임은 ZIP이 올라가자마자 공개되므로 표지를 먼저 올립니다.
- 업데이트 때 함께 보낸 게임 정보는 빌드가 공개될 때만 반영되므로, 멈추거나 취소하면 아무것도 바뀌지 않습니다.

## API 명세

CLI 로그인 두 경로를 빼면 모든 요청에 `Authorization: Bearer <업로드 키>` 헤더가 필요합니다. 없거나 폐기된 키는 `401`입니다.

### `POST /cli/sessions` (인증 없음)

본문 `{ label }`(키 목록에 보일 이름). 응답: `{ sessionId, pollToken, userCode, verificationUrl, expiresIn, interval }`.

### `POST /cli/sessions/{sessionId}/token` (인증 없음)

본문 `{ pollToken }`. 승인 대기 중이면 `202`, 승인되면 `200 { key, label }`(한 번만), 거절·만료면 `410`, 토큰이 틀리면 `404`.

### `DELETE /keys/self`

요청에 쓴 키를 폐기합니다(`atelier-cli logout`).

### `POST /games`

| 필드 | 설명 |
| --- | --- |
| `build.size` | 필수. ZIP 바이트 수, 250MiB 이하 |
| `cover.size`, `cover.contentType` | 새 게임은 필수. `image/jpeg`, `image/png`, `image/webp`, 5MB 이하 |
| `gameId` | 업데이트할 게임. 없으면 `title`이 같은 게임을 찾고, 그것도 없으면 새로 만듭니다 |
| `title`, `description`, `genres`, `accessLevel`, `allowedEmails` | 웹 업로드와 같은 규칙. 기존 게임에서 생략하면 지금 값 유지. 공개 중인 게임은 새 빌드가 공개될 때 반영 |

응답: `{ gameId, versionId, created, title, buildUploadUrl, coverUploadUrl }`. 업로드 URL은 Cloud Storage [resumable upload](https://cloud.google.com/storage/docs/performing-resumable-uploads) 세션이며 일주일 동안 유효합니다.

### `GET /games/{gameId}`

응답: `{ gameId, title, accessLevel, buildStatus, buildVersionId, pendingVersionId, buildError }`.

- 업데이트 처리 중: `pendingVersionId`가 이번 `versionId`
- 성공: `buildVersionId`가 이번 `versionId`이고 `buildStatus`가 `published`
- 실패: 위 둘이 아니고 `buildError`에 이유. 업데이트가 실패하면 이전 빌드가 계속 공개됩니다

### `DELETE /games/{gameId}/versions/{versionId}`

ZIP 업로드를 끝내지 못한 초안을 되돌립니다. 응답: `{ result }`.

- `game-deleted`: 이번 업로드로 만든 새 게임(한 번도 공개되지 않음)을 지움
- `update-cancelled`: 업데이트 대기를 지움. 이전 빌드는 그대로 공개
- `marked-failed`: 공개된 적 없는 기존 게임을 실패로 표시
- `not-pending`: 이미 처리됐거나 다른 업로드로 바뀌어서 아무것도 하지 않음

## 보안

- 업로드 키는 업로드에 관해 관리자 권한과 같습니다. 노출되면 설정 → 업로드 키에서 바로 폐기합니다. 재배포는 필요 없습니다.
- 키는 `atl_`로 시작하는 32바이트 난수라서 해시만으로 안전하게 저장할 수 있고, 유출된 키를 로그나 스캐너에서 알아보기 쉽습니다.
- 발급·목록·폐기·CLI 승인은 기존 관리자 기능처럼 관리자 계정 + App Check가 필요합니다.
- CLI 승인 페이지는 요청한 기기 이름과 코드를 보여 줍니다. 터미널의 코드와 같을 때만 승인합니다. 남이 보낸 링크로 들어왔다면 승인하지 않습니다.
- 업로드 세션 URL은 그 자체로 쓰기 권한이 있으므로 로그나 공개된 곳에 남기지 않습니다. 정해진 경로 한 곳에만 쓸 수 있고, ZIP 검사는 `processBuildZip`이 똑같이 합니다.
- 함수 인스턴스는 최대 1개(`maxInstances: 1`)라서 잘못된 요청이 몰려도 비용이 늘지 않습니다. 실제 파일 전송은 함수를 거치지 않으므로 업로드 속도에는 영향이 없습니다.
