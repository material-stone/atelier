# Atelier 게임 연동 가이드

Atelier에 웹빌드를 올리는 게임이 플레이어와 연동하는 방법을 정리한 문서입니다.

**모든 웹빌드는 게임 메뉴에 전체화면 나가기 버튼을 넣어야 합니다.** 전체화면에는 플레이어 헤더도 종료 버튼도 없고, iPhone에서는 이 버튼 말고 전체화면을 나갈 방법이 없습니다.

## 전체화면 나가기 신호

게임 안에서 부모 창으로 다음 메시지를 보내면 전체화면이 풀립니다. 응답을 기다릴 필요는 없고, 전체화면이 아닐 때 보내면 무시됩니다.

```js
window.parent.postMessage({ type: "atelier:exit-fullscreen" }, "*");
```

버튼은 전체화면일 때만 보이게 합니다. 플레이어가 상태를 알려 주므로 이 값을 그대로 쓰면 됩니다. PC와 모바일을 나눠 구현할 필요가 없습니다.

```js
const button = document.querySelector("#exit-fullscreen");
button.hidden = true;
button.textContent = "전체화면 나가기";
button.onclick = () => window.parent.postMessage({ type: "atelier:exit-fullscreen" }, "*");

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.data?.type !== "atelier:fullscreen-change") return;
  button.hidden = !event.data.fullscreen;
});

// 리스너를 등록하기 전에 지나간 상태를 받습니다.
window.parent.postMessage({ type: "atelier:get-fullscreen" }, "*");
```

### Unity

`.jslib` 플러그인에 메시지 전송 함수를 만들고 C#에서 호출합니다. 상태 메시지는 같은 플러그인에서 리스너를 등록해 `SendMessage`로 C#에 전달합니다.

```js
mergeInto(LibraryManager.library, {
  AtelierExitFullscreen: function () {
    window.parent.postMessage({ type: "atelier:exit-fullscreen" }, "*");
  },
});
```

```csharp
#if UNITY_WEBGL && !UNITY_EDITOR
[System.Runtime.InteropServices.DllImport("__Internal")]
private static extern void AtelierExitFullscreen();
#endif
```

### Godot

`OS.has_feature("web")`으로 웹빌드를 구분합니다. 상태 메시지는 `JavaScriptBridge.create_callback()`으로 `message` 리스너를 등록해 받습니다.

```gdscript
JavaScriptBridge.eval('window.parent.postMessage({ type: "atelier:exit-fullscreen" }, "*")')
```

## 메시지 목록

| 방향 | 메시지 | 의미 |
|---|---|---|
| 게임 → 플레이어 | `{ type: "atelier:exit-fullscreen" }` | 전체화면을 나갑니다. |
| 게임 → 플레이어 | `{ type: "atelier:get-fullscreen" }` | 현재 상태를 알려 달라고 요청합니다. |
| 게임 → 플레이어 | `{ type: "atelier:capture-esc" }` | 전체화면에서 Esc를 게임이 받겠다고 요청합니다. |
| 플레이어 → 게임 | `{ type: "atelier:fullscreen-change", fullscreen: boolean }` | iframe 로드가 끝날 때, 전체화면 상태가 바뀔 때, 상태를 요청받았을 때 전달됩니다. |
| 게임 ↔ 플레이어 | `atelier:storage-*` | 세이브 저장. [세이브 브리지](#세이브-저장세이브-브리지) 참고. |

게임이 메시지로 전체화면에 들어갈 수는 없습니다. 진입은 플레이어 헤더의 전체화면 버튼이 맡습니다.

## 기기별 전체화면 동작

어느 기기든 전체화면에서는 `ATELIER PLAYER / LIVE BUILD` 헤더가 사라지고 게임이 화면 전체를 씁니다.

| 기기 | 전체화면 방식 | 게임 버튼 외의 나가는 방법 |
|---|---|---|
| PC 브라우저 | 브라우저 전체화면 | Esc (`capture-esc`를 요청하면 Esc 길게 누르기) |
| Android | 브라우저 전체화면 | 시스템 뒤로 가기(기기와 브라우저마다 다를 수 있음) |
| iPhone, iPhone 홈 화면 웹앱 | 플레이어가 화면을 덮는 대체 방식 | 없음 |

대체 방식에서도 메시지는 똑같이 동작하므로 게임 코드를 따로 나눌 필요가 없습니다. 플레이어가 게임 화면을 덮으므로 노치와 홈 인디케이터 영역은 플레이어가 비워 둡니다.

## 스토어 빌드와 구분하기

같은 게임을 Steam이나 모바일 앱으로도 출시한다면 빌드 타깃 상수로 버튼의 역할을 나눕니다.

```js
const BUILD_TARGET = "atelier"; // "atelier" | "steam" | "android" | "ios"
```

| 환경 | 버튼 | 동작 |
|---|---|---|
| Atelier, 전체화면 | 전체화면 나가기 | `atelier:exit-fullscreen` 전송 |
| Atelier, 일반 화면 | 숨김 | 나갈 전체화면이 없습니다. |
| Steam, PC 앱 | 게임 종료 | 앱 프레임워크의 종료 API 호출 |
| Android 앱 | 게임 종료 | 앱 프레임워크의 종료 API 호출 |
| iOS 앱 | 숨김 | Apple은 앱이 스스로 종료하는 동작을 권장하지 않습니다. |

같은 빌드를 여러 환경에 쓴다면 `window.parent !== window`로 iframe 안인지 확인할 수 있습니다.

## Esc 키

PC 전체화면에서 Esc는 기본적으로 브라우저가 먼저 처리해 전체화면을 나갑니다. 게임 안에서는 이 동작을 막을 수 없습니다.

Esc를 게임 메뉴 키로 쓰려면 게임 시작 코드에서 플레이어에 요청합니다. 요청하지 않은 게임의 Esc 동작은 바뀌지 않습니다. 요청은 전체화면에 들어가기 전에 보내는 것이 가장 안전합니다.

```js
window.parent.postMessage({ type: "atelier:capture-esc" }, "*");
```

플레이어는 Keyboard Lock API로 Esc를 잠급니다. 이 API를 지원하는 브라우저(Chrome에서 확인)에서는 Esc 입력이 게임으로 전달되고, Esc를 약 2초 길게 누르면 전체화면을 나갑니다. 지원하지 않는 브라우저에서는 Esc가 계속 전체화면을 나가므로 두 경우를 모두 처리합니다.

```js
let wasFullscreen = false;

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") toggleMenu();
});

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.data?.type !== "atelier:fullscreen-change") return;
  if (wasFullscreen && !event.data.fullscreen) openMenu(); // Esc로 전체화면을 나간 경우에도 메뉴를 엽니다.
  wasFullscreen = event.data.fullscreen;
});
```

- `capture-esc`를 요청한 게임은 Esc를 반드시 처리해야 합니다. 처리하지 않으면 플레이어에게 Esc가 고장 난 것처럼 보입니다.
- 일반 화면에서는 요청과 상관없이 Esc가 게임에 전달됩니다.
- Steam과 모바일 앱 빌드에서는 이 메시지가 필요 없습니다.

## 세이브 저장(세이브 브리지)

**세이브는 iframe의 `localStorage`·IndexedDB 대신 세이브 브리지로 저장합니다.** 업로드된 빌드는 Atelier와 다른 사이트(`cloudfunctions.net`)에서 iframe으로 열리므로, 브라우저는 빌드의 저장소를 제3자 저장소로 다룹니다. 제3자 저장소는 막히거나 창을 닫을 때 지워질 수 있습니다(iPhone 홈 화면 웹앱, Chrome의 제3자 데이터 정리 설정 등). 같은 창에서는 저장이 되는 것처럼 보여도 앱을 껐다 켜면 사라질 수 있습니다. 게다가 모든 게임이 같은 출처를 쓰므로 키 이름이 겹치면 다른 게임의 세이브를 덮어씁니다.

브리지를 쓰면 게임이 키-값을 `postMessage`로 플레이어에 보내고, 플레이어가 Atelier 자신의 저장소(IndexedDB)에 **게임별로 나눠** 보관합니다. 게임 구분은 플레이어가 하므로 다른 게임과 키 이름이 같아도 됩니다.

| 방향 | 메시지 | 설명 |
|---|---|---|
| 게임 → 플레이어 | `{ type: "atelier:storage-hello" }` | 브리지를 쓰겠다고 알립니다. 시작할 때 한 번 보냅니다. |
| 플레이어 → 게임 | `{ type: "atelier:storage-ready", items: { [key]: string } }` | 이 게임에 저장된 모든 키-값을 한 번에 보냅니다. 게임은 이것을 메모리에 두고 동기적으로 읽습니다. |
| 게임 → 플레이어 | `{ type: "atelier:storage-set", key, value }` | 값은 문자열입니다(JSON 직렬화는 게임이 합니다). 응답은 없습니다. |
| 게임 → 플레이어 | `{ type: "atelier:storage-remove", key }` | 키를 지웁니다. |
| 플레이어 → 게임 | `{ type: "atelier:storage-error", key, reason }` | 저장하거나 불러오지 못했을 때만 옵니다. `reason`은 `invalid-key`, `invalid-value`, `quota`, `write-failed`, `load-failed` 중 하나입니다. `storage-hello`에 대한 `load-failed`는 `key`가 `null`입니다. |

- 플레이어는 `storage-set`을 받자마자 저장합니다. 저장 직후 `location.reload()`해도 값이 남고, 다시 보낸 `storage-hello`에는 새 값이 들어 있습니다.
- 플레이 세션이 바뀌어도(페이지를 새로 열거나 세션 주소가 바뀌어도) 같은 게임이면 같은 세이브가 나옵니다.
- 한도: 게임당 5MB(키와 값의 글자 수 × 2바이트), 키 길이 256자. 넘으면 저장하지 않고 `quota`나 `invalid-key` 오류를 보냅니다.
- **`load-failed`는 "세이브 없음"이 아닙니다.** 플레이어가 기기의 세이브를 잠깐 읽지 못한 것입니다. 이때 `storage-ready`는 오지 않고, 다시 `storage-hello`를 보내면 다시 불러옵니다. 불러오지 못한 동안 보낸 `storage-set`·`storage-remove`는 저장하지 않고 같은 오류로 돌아옵니다. 빈 세이브로 보고 새 게임을 저장하면 남아 있는 진짜 세이브를 덮어쓰기 때문입니다.
- 세이브는 기기(브라우저)마다 따로 저장됩니다. 기기 간 이어하기는 아직 지원하지 않습니다.

### 게임 쪽 예시

`storage-hello`를 보내고 `storage-ready`를 기다립니다. 1.5초 안에 플레이어가 아무 답도 하지 않으면 Atelier 밖(직접 연 빌드, 다른 사이트)으로 보고 `localStorage`를 씁니다. 어느 쪽이든 `getItem`·`setItem`·`removeItem`을 같은 모양으로 쓸 수 있습니다.

`load-failed`가 오면 0.5초 간격으로 세 번까지 다시 묻고, 그래도 실패하면 Promise가 거부됩니다. 이때 `localStorage`로 넘어가지 않습니다. 플레이어가 답했으니 Atelier 안이고, iframe `localStorage`에 쓰면 세이브가 다시 사라질 수 있기 때문입니다.

```js
function createAtelierStorage({ timeout = 1500, retries = 3, retryDelay = 500, migrateKeys = [], onError } = {}) {
  const local = {
    mode: "local",
    getItem: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
    setItem: (key, value) => { try { localStorage.setItem(key, String(value)); } catch (error) { onError?.(key, "write-failed", error); } },
    removeItem: (key) => { try { localStorage.removeItem(key); } catch {} },
  };
  if (window.parent === window) return Promise.resolve(local);

  return new Promise((resolve, reject) => {
    let items = null;
    let failures = 0;
    const send = (message) => window.parent.postMessage(message, "*");
    const bridge = {
      mode: "atelier",
      getItem: (key) => (Object.hasOwn(items, key) ? items[key] : null),
      setItem: (key, value) => { items[key] = String(value); send({ type: "atelier:storage-set", key, value: String(value) }); },
      removeItem: (key) => { delete items[key]; send({ type: "atelier:storage-remove", key }); },
    };
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent || typeof event.data?.type !== "string" || !event.data.type.startsWith("atelier:storage-")) return;
      // 플레이어가 답했으니 Atelier 안이다. 실패하더라도 localStorage로 넘어가지 않는다.
      clearTimeout(timer);
      const data = event.data;
      if (data.type === "atelier:storage-error" && data.reason === "load-failed" && !items) {
        // 세이브를 읽지 못한 것이지 세이브가 없는 것이 아니다. 잠시 뒤 다시 묻고, 계속 실패하면 게임이 알린다.
        failures += 1;
        if (failures <= retries) setTimeout(() => send({ type: "atelier:storage-hello" }), retryDelay);
        else { items = {}; reject(new Error("atelier:load-failed")); }
        return;
      }
      if (data.type === "atelier:storage-error") onError?.(data.key, data.reason);
      if (data.type !== "atelier:storage-ready" || items) return;
      items = { ...data.items };
      migrate(bridge);
      resolve(bridge);
    });
    // 아무 답이 없으면 Atelier 밖(다른 사이트에 끼워 넣었거나 브리지가 없는 플레이어)이다.
    const timer = setTimeout(() => { if (!items) { items = {}; resolve(local); } }, timeout);
    send({ type: "atelier:storage-hello" });
  });

  // 브리지 이전의 세이브를 한 번만 옮긴다. 다른 게임과 같은 저장소를 썼으므로 자기 키만 적는다.
  function migrate(bridge) {
    if (bridge.getItem("atelier:migrated") !== null) return;
    for (const key of migrateKeys) {
      const old = local.getItem(key);
      if (old !== null && bridge.getItem(key) === null) bridge.setItem(key, old);
    }
    bridge.setItem("atelier:migrated", "1");
  }
}
```

```js
async function boot() {
  let storage;
  try {
    storage = await createAtelierStorage({
      migrateKeys: ["onion-debt-save"],
      onError: (key, reason) => console.warn("세이브 실패", key, reason),
    });
  } catch {
    // 세이브를 읽지 못했습니다. "세이브 없음"으로 보고 새 게임을 시작하지 않습니다.
    showMessage("세이브를 불러오지 못했습니다. 페이지를 새로 고쳐 주세요.");
    return;
  }

  const save = JSON.parse(storage.getItem("onion-debt-save") ?? "null");
  // ...
  storage.setItem("onion-debt-save", JSON.stringify(state));
  location.reload(); // 바로 새로 고쳐도 남습니다.
}
```

게임 시작 코드에서 `localStorage`를 직접 부르던 곳을 `storage`로 바꾸면 됩니다. 게임을 시작하기 전에 `createAtelierStorage()`를 기다려야 첫 화면에서 이어하기 여부를 바로 알 수 있습니다.

### 기존 세이브 옮기기

브리지 이전에 iframe `localStorage`에 남은 세이브는 `migrateKeys`에 키를 적으면 첫 실행에서 한 번 브리지로 옮깁니다. 옮긴 뒤에는 `atelier:migrated` 키를 남겨 다시 옮기지 않습니다.

- **자기 게임의 키만 적습니다.** 지금까지 모든 게임이 같은 `localStorage`를 썼으므로, 모든 키를 옮기면 다른 게임의 세이브까지 가져옵니다.
- 브리지에 같은 키가 이미 있으면 옮기지 않습니다.
- 옛 값은 지우지 않습니다. 브라우저가 이미 지웠다면 옮길 것이 없습니다.

### Unity, Godot

엔진의 `PlayerPrefs`나 `user://`는 내부적으로 iframe의 IndexedDB에 저장되므로 같은 문제가 있습니다. 위 `createAtelierStorage`를 페이지(템플릿 `index.html`)에 넣고, 엔진에서는 `.jslib`나 `JavaScriptBridge`로 `getItem`·`setItem`을 호출합니다. 엔진을 시작하기 전에 `createAtelierStorage()`가 끝나도록 기다리면 읽기를 동기적으로 쓸 수 있습니다.

## 빌드 제약

ZIP 형식과 asset 경로 규칙은 [README](../README.md)의 업로드 안내를 따릅니다. 게임은 샌드박스 iframe에서 실행되므로 최상위 페이지를 이동시키거나 팝업을 열 수 없습니다. 업로드된 빌드는 Atelier와 다른 origin에서 서비스되므로 `window.parent`의 DOM에도 접근할 수 없습니다.
