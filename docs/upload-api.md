# 업로드 API

웹페이지 업로드 룸을 거치지 않고 스크립트(또는 Claude)가 게임 빌드를 올리는 경로입니다. 업로드 룸은 그대로 두고, 같은 처리 파이프라인에 들어가는 입구를 하나 더 만든 것입니다.

## 구조

```
atelier-upload CLI (tools/atelier-upload)
  │ 1. POST /games  (API 키, 게임 정보, 파일 크기)
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

1. API 키를 만들어 Secret Manager에 넣습니다. 출력된 값은 3번에서 씁니다.

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   firebase functions:secrets:set UPLOAD_API_KEY
   ```

2. 함수를 배포합니다. `processBuildZip`, `createOrUpdateGameDraft`, `deleteGame`도 바뀌었으므로 전체를 배포합니다. 출력되는 `uploadApi` URL을 적어 둡니다.

   ```bash
   firebase deploy --only functions
   ```

3. CLI를 전역 명령으로 설치합니다. **Atelier 원본 체크아웃**(worktree가 아닌 곳)에서 실행해야 나중에 worktree가 지워져도 링크가 깨지지 않습니다. 링크라서 저장소를 pull하면 바로 새 버전이 됩니다.

   ```bash
   cd D:/project/dev/alone/Atelier/tools/atelier-upload
   npm link
   ```

4. URL과 키를 저장합니다. `~/.atelier-upload/config`에 저장되어 이 PC의 모든 프로젝트가 같은 키를 씁니다. 키 확인은 `atelier-upload --config`(키는 가려서 표시)로 합니다.

   ```bash
   atelier-upload --init
   ```

5. Claude가 다른 프로젝트에서도 쓰도록 스킬을 전역 스킬 폴더에 복사합니다. 원본은 `tools/atelier-upload/skill/SKILL.md`이며, 고치면 다시 복사합니다.

   ```bash
   mkdir -p ~/.claude/skills/atelier-upload
   cp tools/atelier-upload/skill/SKILL.md ~/.claude/skills/atelier-upload/SKILL.md
   ```

설정은 환경변수 > `~/.atelier-upload/config` > `tools/atelier-upload/.env` 순서로 읽습니다.

## 사용법

```bash
# 새 게임 (표지 필수)
atelier-upload --zip build.zip --title "Ember Archive" --access public --genres "Adventure,Puzzle" --description "조작: 방향키" --cover cover.png

# 기존 게임에 새 빌드만 (게임 정보는 그대로)
atelier-upload --zip build.zip --title "Ember Archive"
atelier-upload --zip build.zip --game <gameId>

# 상태 확인, 미리 검사
atelier-upload --status <gameId>
atelier-upload --zip build.zip --title "Ember Archive" --dry-run
```

전체 옵션은 `--help`로 봅니다. Node 18 이상이면 의존성 설치가 필요 없습니다. 전역 설치 전에는 `node tools/atelier-upload/upload.mjs`로 실행합니다.

다른 프로젝트에서 Claude에게 "Atelier에 올려줘"라고 하면 `atelier-upload` 스킬이 빌드 폴더를 ZIP으로 묶고 이 CLI로 올립니다.

## 중간에 멈췄을 때

| 상황 | 동작 |
| --- | --- |
| 전송 중 연결이 잠깐 끊김 | 최대 5번 다시 시도하고, 서버가 받은 위치부터 이어서 올립니다 |
| Ctrl+C | 업로드 세션을 끊고 서버를 되돌립니다. 새 게임은 문서·표지·초대 목록을 지우고, 업데이트는 대기 표시만 지워 이전 빌드가 계속 공개됩니다 |
| 재시도 실패, 창 닫기, PC 종료 | 진행 상태를 `~/.atelier-upload/state/`에 남깁니다. **같은 명령을 다시 실행하면 이어서** 올립니다 |
| 이어 올리지 않고 그만두기 | 같은 명령에 `--cancel`을 붙여 실행하면 Ctrl+C와 같이 되돌립니다 |
| ZIP을 다 올린 뒤 Ctrl+C | 서버 처리는 이미 시작돼 취소하지 않고, 기다리기만 멈춥니다 |

- "같은 명령"은 같은 ZIP·표지 파일(경로, 크기, 수정 시각)과 같은 옵션을 뜻합니다. 파일을 다시 빌드했으면 새 업로드로 시작합니다.
- 업로드 세션은 일주일 동안 유효해서 6일이 지난 진행 상태는 버립니다.
- 업데이트는 ZIP을 먼저, 표지를 나중에 올립니다. 그래서 중간에 멈춰도 표지만 바뀌는 일이 없습니다. 새 게임은 ZIP이 올라가자마자 공개되므로 표지를 먼저 올립니다.
- 업데이트 때 함께 보낸 게임 정보는 빌드가 공개될 때만 반영되므로, 멈추거나 취소하면 아무것도 바뀌지 않습니다.

## API 명세

모든 요청에 `Authorization: Bearer <UPLOAD_API_KEY>` 헤더가 필요합니다.

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

- API 키는 관리자 권한과 같습니다. 노출되면 바로 `firebase functions:secrets:set UPLOAD_API_KEY`로 바꾸고 `uploadApi`를 다시 배포합니다.
- 키 비교는 상수 시간으로 하고, 시크릿이 비어 있으면 어떤 키도 통과하지 못합니다.
- 업로드 세션 URL은 그 자체로 쓰기 권한이 있으므로 로그나 공개된 곳에 남기지 않습니다. 정해진 경로 한 곳에만 쓸 수 있고, ZIP 검사는 `processBuildZip`이 똑같이 합니다.
- 함수 인스턴스는 최대 1개(`maxInstances: 1`)라서 잘못된 요청이 몰려도 비용이 늘지 않습니다. 실제 파일 전송은 함수를 거치지 않으므로 업로드 속도에는 영향이 없습니다.
