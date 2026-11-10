# atelier-cli

[Atelier](https://material-stone.github.io/atelier/)에 웹빌드 게임을 브라우저 없이 올리는 명령줄 도구입니다. Atelier 관리자 계정이 있어야 쓸 수 있습니다.

## 설치

Node.js 18 이상이 필요합니다. 의존성은 없습니다.

```bash
npm install -g @material-stone/atelier-cli
```

## 로그인 (기기마다 한 번)

```bash
atelier-cli login
```

터미널에 코드가 나오고 브라우저가 열립니다. 관리자 Google 계정으로 로그인해 같은 코드인지 확인하고 승인하면, 이 기기의 업로드 키가 `~/.atelier-cli/config`에 저장됩니다. 키는 화면에 출력되지 않습니다.

- 설정 창에서 직접 발급한 키를 쓸 때: `atelier-cli login --with-key` (키를 붙여 넣음)
- CI처럼 로그인할 수 없는 곳: 환경변수 `ATELIER_UPLOAD_KEY`
- 이 기기에서 로그아웃(서버에서도 폐기): `atelier-cli logout`

## 올리기

```bash
# 기존 게임 업데이트 (같은 제목의 게임을 찾아 빌드만 교체)
atelier-cli upload build.zip --title "Ember Archive"

# 새 게임
atelier-cli upload build.zip --title "Ember Archive" --access public --cover cover.png --genres "Adventure,Puzzle"

# 상태 확인
atelier-cli status <gameId>
```

ZIP은 루트(또는 하나뿐인 최상위 폴더)에 `index.html`이 있어야 하고 250MiB 이하여야 합니다. 연결이 끊기면 같은 명령을 다시 실행해 이어서 올리고, 그만두려면 같은 명령에 `--cancel`을 붙입니다.

전체 옵션은 `atelier-cli help`, 자세한 설명은 [업로드 API 문서](https://github.com/material-stone/atelier/blob/main/docs/upload-api.md)에 있습니다.
