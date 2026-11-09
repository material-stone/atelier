# Atelier 소개 영상

Atelier 허브에 지금 올라가 있는 게임 데이터로 YouTube 소개 영상을 만듭니다. 작업대(커팅 매트·종이·폴라로이드) 스타일, Edge TTS 남성 목소리(Hyunsu) 더빙, 코드로 만든 로파이 배경음악, 하단 자막, 마지막 화면 블러 위 크레딧 롤로 구성됩니다.

## 준비물

- Node.js, Python
- `pip install edge-tts`
- 상위 폴더의 `../.env` (Firebase 프로젝트 ID, 버킷, Web API 키를 읽습니다)

Edge TTS는 Microsoft의 공식 API가 아니라서 수익 창출 영상에 써도 되는지는 약관상 분명하지 않습니다. 수익화할 때는 Azure AI Speech(같은 목소리, 공식 약관)로 바꾸는 것을 검토하세요.

## 만들기

```bash
npm install
npm run prepare-all
npm run render
```

`prepare-all`이 하는 일:

1. `fetch` — Firestore에서 published 게임과 Storage 표지를 받아 `public/data/games.json`, `public/covers/`에 저장합니다. 게임 수, 등급, 순서는 모두 여기서 정해집니다.
2. `sfx` — 종이 놓는 소리, 마커 소리를 만듭니다.
3. `voice` — 대본을 데이터로 채우고 문장마다 TTS를 만든 뒤, 실제 음성 길이로 장면 타이밍(`public/data/timeline.json`)과 YouTube용 자막(`out/atelier-intro.srt`)을 만듭니다.
4. `music` — 영상 길이에 맞춰 배경음악 `public/music/workbench-loop.wav`를 만듭니다(`scripts/make-music.mjs`). 녹음 샘플 없이 코드로 합성한 곡이라 저작권자가 따로 없습니다.

결과물은 `out/atelier-intro.mp4`, `out/atelier-intro.srt`입니다. `npm run thumbnail`은 같은 작업대 스타일의 YouTube 썸네일(`out/atelier-thumbnail.jpg`, 1280×720)을 만듭니다. 썸네일에는 `benchGameId`와 `wipGameIds`의 게임이 들어갑니다.

Instagram Reels용 세로(1080×1920) 영상은 같은 내레이션과 타이밍으로 장면만 다시 배치한 버전입니다(`src/scenes-tall.tsx`). Instagram이 위쪽, 아래쪽, 오른쪽에 자체 UI를 덮기 때문에, 중요한 내용은 가운데 영역에만 두고 자막은 아래 UI 바로 위에 둡니다.

```bash
npm run render:reel
npm run reel-cover
```

결과물은 `out/atelier-reel.mp4`와 커버 이미지 `out/atelier-reel-cover.jpg`입니다. 커버는 프로필 격자에서 가운데 3:4만 보이므로 그 안에 맞췄습니다. 게임이 새로 올라오거나 등급이 바뀌면 `prepare-all`부터 다시 돌리면 됩니다. `npm run studio`로 미리보기를 열 수 있습니다.

## 바꿀 수 있는 것 (`config.json`)

- `benchGameId` — "작업 중인 게임" 장면에서 따로 소개할 게임. 게임 목록 장면에서는 빠집니다.
- `wipGameIds` — 게임 목록에서 "계속 다듬는 중" 태그를 붙일 게임.
- `gameLines` — 게임마다 읽을 한 줄. `sub`는 자막, `say`는 TTS가 읽을 문장(숫자 읽기 등). 없으면 게임 제목만 읽습니다.
- `gameNotes` — 게임 카드 메모지의 설명. 없으면 사이트 설명의 첫 문장을 씁니다.
- `tts` — `{ "engine": "edge", "voice": "ko-KR-HyunsuMultilingualNeural", "rate": "+10%" }`. `engine`을 `"supertonic"`으로 바꾸면 로컬 Supertonic(`pip install supertonic`, `voice`: M1~M3, `speed`)으로 만듭니다.
- `music` — 기본은 직접 만든 곡입니다. 다른 곡을 쓰려면 파일을 `public/music/`에 두고 `{ "src": "music/파일.mp3", "credit": "곡 이름 — 출처" }`로 바꿉니다. 크레딧에 자동으로 표시됩니다.

나머지 대본 문장은 `scripts/make-voice.mjs`의 `scenes`에 있습니다.
