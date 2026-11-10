---
name: atelier-upload
description: Atelier(Material Stone Games 게임 허브)에 웹빌드 게임을 올리거나 기존 게임의 빌드를 업데이트할 때 사용한다. "Atelier에 올려줘", "게임 업로드", "빌드 배포", "새 빌드로 업데이트"처럼 어느 프로젝트에서든 게임을 Atelier에 올리는 요청이면 이 스킬을 쓴다. 브라우저로 업로드 룸에 들어가지 말고 atelier-cli를 쓴다. 파일 크기 제한(20MB) 없이 250MiB까지 올릴 수 있다. 세이브가 있는 게임은 올리기 전에 세이브 브리지를 쓰는지 확인한다(Atelier에서 세이브가 사라지는 문제도 이 스킬로 다룬다).
---

# Atelier 업로드

웹 업로드 룸 대신 `atelier-cli`로 올린다. 브라우저를 쓰지 않는다.

## 1. 준비 확인

```bash
atelier-cli config
```

- 명령이 없으면: `npm install -g @material-stone/atelier-cli`로 설치해야 한다고 사용자에게 알리고, 허락을 받으면 설치한다.
- 키가 `(없음)`이면 로그인한다. `atelier-cli login`을 **백그라운드로** 실행하면 브라우저가 열리고 터미널에 코드가 찍힌다. 출력에서 코드를 읽어 사용자에게 "브라우저에서 관리자 Google 계정으로 로그인하고, 코드 `XXXX-XXXX`가 같은지 확인한 뒤 승인해 달라"고 알린다. 승인되면 명령이 `로그인했습니다`를 출력하고 끝난다(최대 10분). 키는 설정 파일에만 저장되고 출력되지 않는다.
- 승인 버튼은 사용자가 직접 누른다. Claude가 브라우저를 조작해 대신 승인하지 않는다.
- **키를 대화에 붙여 달라고 하거나, 명령줄 인자·환경변수로 키를 넘기지 않는다.** 키는 업로드에 관해 관리자 권한과 같다.
- `config` 출력은 키를 가려서 보여 준다. 키 원문을 읽거나 출력하지 않는다(`~/.atelier-cli/config`를 cat 하지 않는다).

## 2. 세이브 저장 확인

게임이 세이브(진행 상황, 설정, 최고 점수 등)를 남기면 올리기 전에 확인한다.

Atelier의 게임은 다른 사이트(`cloudfunctions.net`)의 iframe에서 돌기 때문에, 게임이 직접 쓴 `localStorage`·IndexedDB는 브라우저가 지울 수 있다(앱을 껐다 켜면 이어하기가 사라짐). 모든 게임이 같은 출처라 키 이름이 겹치면 다른 게임의 세이브를 덮어쓰기도 한다. 그래서 세이브는 **세이브 브리지**로 Atelier 페이지에 맡긴다.

1. 프로젝트에서 `localStorage`, `indexedDB`, Unity `PlayerPrefs`, Godot `user://` 사용처를 찾는다. 없으면 이 단계는 건너뛴다.
2. 이미 `atelier:storage-hello`를 보내고 있으면(예: `createAtelierStorage`) 그대로 둔다.
3. 아니면 사용자에게 "세이브가 Atelier에서 사라질 수 있어 세이브 브리지로 바꾸는 것을 권한다"고 알리고, 허락을 받으면 바꾼다. 방법·코드·주의점은 [게임 연동 가이드의 세이브 브리지 섹션](https://github.com/material-stone/atelier/blob/main/docs/game-integration.md#세이브-저장세이브-브리지)을 읽고 그대로 따른다. 요점:
   - `createAtelierStorage()` 코드를 게임에 넣고, 게임 시작 전에 `await`한 뒤 `localStorage` 호출을 그 결과의 `getItem`·`setItem`·`removeItem`으로 바꾼다. Atelier 밖에서는 자동으로 `localStorage`를 쓰므로 다른 배포 타깃도 깨지지 않는다.
   - `migrateKeys`에는 **이 게임이 쓰던 키만** 적는다. 전부 옮기면 다른 게임의 세이브까지 가져온다.
4. 바꾼 뒤 로컬에서 게임을 직접 열어(`localStorage` 모드) 저장·불러오기가 여전히 되는지 확인한다. Atelier 안 동작은 올린 뒤 저장 → 페이지를 닫았다 다시 열기로 확인하도록 사용자에게 안내한다.

## 3. ZIP 만들기

조건: `index.html`이 ZIP 루트(또는 하나뿐인 최상위 폴더)에 있고, asset 경로가 상대 경로여야 한다. 250MiB 이하.

1. 프로젝트의 웹빌드 출력 폴더를 찾는다(Vite `dist/`, Unity WebGL 빌드 폴더, Godot export 폴더 등). 없으면 빌드 명령을 먼저 실행한다.
2. 폴더 안에 `index.html`이 있는지 확인한다.
3. 폴더 **안의 내용**을 ZIP으로 묶는다. Windows에서 `Compress-Archive`는 쓰지 않는다(버전에 따라 경로 구분자가 `\`로 들어가 서버 검사에 걸린다).

```bash
# Windows, Git Bash: 반드시 Windows 내장 tar를 경로로 호출한다 (Git Bash의 tar는 GNU tar라 ZIP을 못 만든다)
/c/Windows/System32/tar.exe -a -c -f build.zip -C dist .
# Windows, PowerShell
tar -a -c -f build.zip -C dist .
# macOS / Linux
(cd dist && zip -r ../build.zip .)
```

`tar -tf build.zip`으로 목록 맨 위에 `./index.html`(또는 `index.html`)이 보이는지 확인한다.

ZIP은 저장소에 커밋하지 않도록 임시 폴더나 `.gitignore`에 포함된 위치에 만든다.

## 4. 새 게임인지 업데이트인지 정하기

- 사용자가 게임 이름을 말하면 `--title "<제목>"`을 쓴다. 같은 제목이 있으면 그 게임을 업데이트하고, 없으면 새로 만든다.
- 확실하지 않으면 `--dry-run`으로 요청 내용을 보여 주고 사용자에게 확인한다.
- **새 게임**에는 필요한 것을 사용자에게 확인한다: 제목, 접근 등급(`public` | `login` | `subscriber` | `member` | `private`), 표지 이미지(JPG/PNG/WebP, 5MB 이하, 필수), 설명, 장르. 접근 등급과 표지는 추측하지 않는다.
- **업데이트**는 보통 ZIP 경로와 `--title`(또는 `--game <id>`)만 있으면 된다. 생략한 게임 정보는 그대로 유지된다. 사용자가 바꾸라고 한 항목만 넘긴다. 바꾼 값은 새 빌드가 공개될 때 함께 반영된다.

## 5. 올리기

```bash
# 업데이트 (빌드만 교체)
atelier-cli upload build.zip --title "Ember Archive"

# 새 게임
atelier-cli upload build.zip --title "Ember Archive" --access public --cover cover.png --genres "Adventure,Puzzle" --description "조작: 방향키로 이동\n스페이스: 점프"
```

- 업로드와 서버 처리(최대 몇 분)를 기다리므로 Bash 기본 제한 시간을 넘을 수 있다. 큰 파일은 백그라운드로 실행하고 끝나면 결과를 확인한다.
- 끝나면 출력의 `공개 완료` 줄과 `gameId`를 사용자에게 알린다.

## 6. 실패했을 때

| 출력 | 할 일 |
| --- | --- |
| 연결 문제로 멈춤 ("같은 명령을 다시 실행하면 이어서 올립니다") | **같은 명령을 그대로** 다시 실행한다. 받은 위치부터 이어서 올라간다 |
| 그만두기로 했을 때 | 같은 명령에 `--cancel`을 붙여 실행한다. 새 게임은 지워지고, 업데이트는 이전 빌드가 유지된다 |
| `빌드 처리 실패: …` | 이유를 사용자에게 전한다. `index.html` 위치, 절대 경로, 용량을 확인하고 ZIP을 다시 만든다 |
| `API 키가 올바르지 않거나 폐기되었습니다` / `업로드 키가 없습니다` | 위의 방법대로 `atelier-cli login`을 다시 실행한다 |
| 시간 초과 | `atelier-cli status <gameId>`로 나중에 확인한다 |

자세한 설명은 Atelier 저장소의 `docs/upload-api.md`(업로드)와 `docs/game-integration.md`(전체화면·세이브 연동)에 있다.
