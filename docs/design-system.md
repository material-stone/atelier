# Atelier 디자인 시스템

Atelier의 색, 글자, 화면 구성 규칙입니다. 값은 모두 [`src/tokens.css`](../src/tokens.css)에 있고, 컴포넌트 스타일([`src/styles.css`](../src/styles.css))은 그 토큰만 씁니다.

## 화면 구성

대화형 앱처럼 구성합니다. 게임 페이지를 따로 두지 않고, 같은 틀 안에서 바로 플레이합니다.

- **사이드바**(데스크톱, 폭 260px): 로고, 홈 · 커뮤니티 · Atelier 소개, 최근 플레이, 전체 게임, 맨 아래 계정 줄. 계정 줄을 누르면 위로 메뉴가 열립니다(설정, 더 알아보기 → YouTube 채널 · 개인정보처리방침, 로그인/로그아웃).
- **설정**: 계정 메뉴에서 엽니다. 데스크톱은 가운데 창(일반 · 계정 탭), 휴대폰은 전체 화면이고 두 묶음이 세로로 이어집니다. 일반에는 화면 모드와 최근 플레이 기록 지우기, 계정에는 YouTube 구독 · 채널 멤버십 상태와 로그아웃이 있습니다.
- **메뉴 서랍**(폭 900px 이하): 위쪽 바의 ☰ 버튼으로 사이드바가 왼쪽에서 열립니다. 바깥을 누르거나 Esc로 닫습니다.
- **홈** `/`: 게임 이름이나 `#장르` 태그로 실시간 검색합니다. 검색창과 결과 수는 고정되고 결과 목록만 스크롤됩니다. 장르 태그는 한 줄로 두고, 많아지면 옆으로 스크롤합니다. 폭은 검색창을 넘지 않습니다.
- **스크롤**: 모든 스크롤 영역은 배경이 투명합니다. 트랙은 비우고 얇은 막대만 보입니다.
- **게임** `/game/:gameId`: 둥근 카드 하나에 헤더(게임 이름, 좋아요, 공유, 전체 화면) → 모서리가 각진 게임 화면 → 설명이 이어집니다. 그 아래에 플레이어 한마디가 말풍선으로 붙고, 입력창은 화면 아래에 고정됩니다.
- **관리** `/admin`(관리자만): 게임 목록 · 게임 추가 · 저장 공간 탭. 목록은 실시간 검색되고 항목마다 삭제 버튼이 있습니다. 항목을 누르면 수정 화면으로 바뀌어 글, 커버 이미지, 게임 빌드를 바꿔 저장합니다.
- **커뮤니티** `/community`: 최신 / 인기 / 명예의 전당 정렬, 글마다 게임 하나를 연결할 수 있습니다.

## 토큰 구조

토큰은 두 층입니다.

1. **기본 토큰(primitive)**: 팔레트와 크기 단계 그 자체입니다. 예: `--gem-500`, `--paper-100`, `--fs-caption`.
2. **용도 토큰(semantic)**: 값을 어디에 쓰는지를 이름으로 나타냅니다. 예: `--accent`, `--color-surface`, `--tier-public`.

컴포넌트는 **용도 토큰만** 씁니다. 색을 바꿀 때는 `tokens.css`에서 용도 토큰이 가리키는 기본 토큰만 바꾸면 사이트 전체에 반영됩니다. 새 컴포넌트에 `#hex`나 `rgba()`를 직접 쓰지 않습니다. 예외는 게임 썸네일의 장식용 배경 그라디언트, 그림자, 명예의 전당 배지뿐입니다.

## 색

### 팔레트(기본 토큰)

| 계열 | 토큰 | 값 | 역할 |
|---|---|---|---|
| Paper | `--paper-0` ~ `--paper-400` | `#ffffff` ~ `#d0d0d0` | 밝은 바탕, 패널, 선 |
| Ink | `--ink-500` ~ `--ink-950` | `#5d5d5d` ~ `#0d0d0d` | 글자 |
| Stone | `--stone-950` ~ `--stone-850` | `#080a0c` ~ `#171c21` | 게임 화면 뒤의 어두운 바탕 |
| Gem | `--gem-50` ~ `--gem-800` | `#e6edff` ~ `#142f8a` | 로고 보석의 파랑. **브랜드 색** |
| 상태 | `--ember-700`, `--moss-700`, `--violet-700`, `--red-700` | | 좋아요·경고, 공개, 멤버, 위험 |

`--gem-500`은 아이콘의 보석 본체 색, `--gem-400`은 빛을 받은 윗면, `--gem-700`은 그늘진 옆면 색입니다.

### 용도 토큰

| 토큰 | 가리키는 값 | 쓰는 곳 |
|---|---|---|
| `--color-bg` | paper-0 | 페이지 배경 |
| `--color-sidebar` | paper-50 | 사이드바 |
| `--color-surface` | paper-100 | 카드, 패널, 검색 결과 타일 |
| `--color-surface-raised` | paper-200 | hover 줄, 다른 사람의 말풍선 |
| `--color-screen` | stone-900 | 게임 화면, 썸네일 바탕 |
| `--color-line` / `--color-line-strong` | paper-300 / paper-400 | 구분선, 테두리 / hover 테두리 |
| `--color-text` | ink-950 | 본문, 제목 |
| `--color-text-soft` | ink-700 | 긴 설명 문단 |
| `--color-text-muted` | ink-500 | 보조 정보, 날짜, 캡션 |
| `--color-text-placeholder` | ink-600 | 입력창 placeholder |
| `--accent` | gem-700 | 강조 글자, 장르 태그, 지금 보는 메뉴 |
| `--accent-fill` / `--accent-fill-hover` | gem-500 / gem-700 | 주요 버튼, 보내기·플레이 버튼, 내 말풍선, 선택한 태그 |
| `--on-accent` | 흰색 | `--accent-fill` 위의 글자 |
| `--accent-soft` | gem-50 | 지금 보는 메뉴의 배경, 안내 상자 |
| `--accent-line` | gem-500 50% | 포커스된 입력창 테두리 |
| `--heat` / `--heat-soft` | ember-700 / 10% | 좋아요, 경고 |
| `--success` / `--danger` | moss-700 / red-700 | 상태 표시 |

### 대비 기준

작은 글자는 배경 대비 4.5:1 이상이어야 합니다.

| 조합 | 대비 |
|---|---|
| `--accent`(gem-700) 글자 on paper-0 | 8.4:1 |
| `--color-text-muted`(ink-500) 글자 | 6.6:1 (paper-0), 6.0:1 (paper-100) |
| `--color-text-placeholder`(ink-600) 글자 | 5.3:1 (paper-0), 4.9:1 (paper-100) |
| `--on-accent` 글자 on `--accent-fill` | 6.3:1 |

보석 파랑은 용도를 나눠 씁니다. **글자에는 `--accent`(gem-700), 칠한 면에는 `--accent-fill`(gem-500)** 을 쓰고, `--accent-fill` 위의 글자는 항상 `--on-accent`입니다.

### 다크 모드

**설정 → 일반 → 화면 모드**에서 **시스템 / 라이트 / 다크**로 고릅니다. 기본은 시스템이고, OS 설정을 따릅니다.

- 라이트나 다크를 고르면 `<html data-theme="light|dark">`가 붙고 `localStorage`의 `atelier:theme`에 저장됩니다. 시스템으로 돌아가면 둘 다 지웁니다. 로직은 [`src/lib/theme.ts`](../src/lib/theme.ts)에 있습니다.
- `index.html`의 짧은 스크립트가 첫 화면을 그리기 전에 저장된 값을 적용하므로, 새로고침해도 반대 테마가 번쩍이지 않습니다. 브라우저 위쪽 바 색(`theme-color`)도 함께 바꿉니다.
- `tokens.css`에서는 **용도 토큰만** 다크 값으로 바뀝니다. 같은 목록이 `:root[data-theme="dark"]`와 `@media (prefers-color-scheme: dark)` 안에 두 번 있으니, 하나를 고치면 다른 하나도 똑같이 고칩니다.
- 다크 팔레트는 Night(`--night-950` ~ `--night-600`, `#181818` ~ `#4a4a4a`)와 Mist(`--mist-100` ~ `--mist-500`)입니다. 강조 글자는 `--gem-300`, 칠한 면은 라이트와 같은 `--gem-500`입니다.

| 다크 조합 | 대비 |
|---|---|
| `--accent`(gem-300) 글자 on night-900 | 7.4:1 |
| `--color-text-muted`(mist-400) 글자 | 8.1:1 (night-900), 6.5:1 (night-800) |
| `--color-text-placeholder`(mist-500) 글자 | 5.9:1 (night-900), 4.7:1 (night-800) |
| `--on-accent` 글자 on `--accent-fill` | 6.3:1 |

새 컴포넌트에 색을 직접 쓰면 다크 모드에서 깨집니다. 꼭 용도 토큰을 쓰고, 맞는 것이 없으면 라이트와 다크 값을 모두 정한 용도 토큰을 추가합니다.

### 말풍선

- 다른 사람의 한마디: 왼쪽, `--color-surface-raised` 회색.
- 내가 쓴 한마디: 오른쪽, `--accent-fill` 파랑에 `--on-accent` 글자.

### 접근 등급 색

게임 태그와 소개 화면 표는 등급마다 같은 색을 씁니다. 등급 색은 `--tier`라는 지역 변수로 넘깁니다.

| 등급 | 토큰 | 색 |
|---|---|---|
| 공개(public) | `--tier-public` | moss 초록 |
| 로그인 데모(login) | `--tier-login` | ink 회색 |
| 구독자 프로토타입(subscriber) | `--tier-subscriber` | gem 파랑 |
| 채널 멤버(member) | `--tier-member` | violet |
| 초대(private) | `--tier-private` | ember |

```css
.access-tag.public { --tier: var(--tier-public); }
.tier-row.public { --tier: var(--tier-public); }
```

## 글자

### 글꼴

시스템 글꼴을 씁니다. 한글은 Noto Sans KR로 맞춥니다.

| 토큰 | 글꼴 | 쓰는 곳 |
|---|---|---|
| `--font-sans` | ui-sans-serif, -apple-system, Segoe UI, Noto Sans KR | 모든 글자 |
| `--font-display` | `--font-sans`와 같음 | 제목 |
| `--font-mono` | ui-monospace, Consolas, Noto Sans KR | 관리 화면의 경로 표시 |

### 크기 단계

**사이트의 최소 글자 크기는 12px입니다.** 12px보다 작은 값은 쓰지 않습니다. 휴대폰에서 입력창 글자는 16px입니다(iOS가 입력창을 누를 때 화면을 확대하지 않도록).

| 토큰 | 크기 | 쓰는 곳 |
|---|---|---|
| `--fs-caption` | 12px | 배지, 날짜, 말풍선 위 이름 |
| `--fs-small` | 13px | 보조 설명, 작은 버튼 |
| `--fs-body-sm` | 14px | 메뉴, 버튼, 좁은 본문 |
| `--fs-body` | 15px | 기본 본문 |
| `--fs-lead` | 16px | 검색창, 소개 문단 |

제목처럼 큰 글자는 화면 크기에 맞춰 `clamp()`로 정하고, 위 단계에 묶지 않습니다.

## 모양

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `--radius-sm` | 10px | 메뉴 줄, 입력창 |
| `--radius-md` | 18px | 타일, 안내 상자 |
| `--radius-lg` | 24px | 게임 카드, 소개 그림 |
| `--radius-pill` | 999px | 버튼, 칩, 태그, 입력 바 |

게임 화면 자체는 모서리를 둥글리지 않습니다. 둥근 것은 화면을 감싼 카드입니다.

## 새 스타일을 쓸 때

1. 색은 용도 토큰에서 고릅니다. 맞는 토큰이 없으면 `tokens.css`에 용도 토큰을 먼저 추가합니다.
2. 반투명 색은 `color-mix(in srgb, var(--토큰) N%, transparent)`로 만듭니다.
3. 글자 크기는 `--fs-*` 단계를 씁니다. 12px 아래로 내리지 않습니다.
4. 누를 수 있는 것은 높이 36px 이상, 휴대폰에서 자주 누르는 것은 40~48px로 잡습니다.
