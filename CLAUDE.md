# Atelier 작업 규칙

## 결정 기록 (필수)

기능을 추가하거나 수정할 때마다 `docs/decisions/`에 기록한다. 형식은 `docs/decisions/README.md`를 따른다.

- 사용자가 정한 방향·요구사항·승인과 그 이유 → `docs/decisions/user-decisions.md`
- Claude가 정한 설계·대안 비교·기본값과 그 이유 → `docs/decisions/claude-decisions.md`
- 같은 작업은 두 파일에서 같은 제목(`## YYYY-MM-DD · 기능 이름`)을 쓰고, 새 항목은 맨 위에 추가한다.
- 기록은 그 작업의 커밋(PR)에 함께 넣는다.

## 게임 업로드

게임 업로드는 브라우저 대신 `atelier-cli`를 쓴다(전역 스킬 `atelier-upload` 참고). 설치 전이면 `node tools/atelier-cli/cli.mjs help`. 자세한 내용은 `docs/upload-api.md`.

- `tools/atelier-cli/skill/SKILL.md`를 고치면 `~/.claude/skills/atelier-upload/SKILL.md`에도 복사한다.
- 업로드 키 원문을 읽거나 출력하지 않는다. 확인은 `atelier-cli config`, 키가 없으면 `atelier-cli login`(승인은 사용자가 직접).
