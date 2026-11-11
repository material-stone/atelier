import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import type { AccessLevel, AuthState, Comment, Game, Post, TargetType } from "./types";
import { ManagePage } from "./ManagePage";
import { ApiKeySettings, CliLoginPage } from "./ApiKeys";
import { PrivacyPage } from "./PrivacyPage";

// three.js is heavy, so the gem animation on the about page loads in its own chunk.
const GemForge = lazy(() => import("./GemForge"));
import { accessPermission, accessShortLabel, rotationForGames } from "./lib/access";
import { APP_BASE_PATH } from "./lib/config";
import { loadRecent, pushRecent, saveRecent } from "./lib/recent";
import { createSaveBridge } from "./lib/saveBridge";
import { filterGames, popularGenres } from "./lib/search";
import { applyTheme, loadTheme, saveTheme, watchSystemTheme, type ThemePreference } from "./lib/theme";
import {
  createComment,
  createPost,
  deleteComment,
  deletePost,
  findGameById,
  getConfiguredDiscordUrl,
  getConfiguredYoutubeUrl,
  getDisplayName,
  getPlaySession,
  hasFirebaseConfig,
  recordGameView,
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
  subscribeToComments,
  subscribeToGames,
  subscribeToPosts,
  toggleLike,
  uploadBoardImage,
  verifyYoutubeSubscription,
} from "./lib/services";
import {
  MAX_COMMENT_LENGTH,
  MAX_POST_LENGTH,
  validateCommentText,
  validateImage,
  validatePostText,
} from "./lib/validation";

const discordUrl = getConfiguredDiscordUrl();
const logoUrl = `${import.meta.env.BASE_URL}favicon.svg`;

const initialAuth: AuthState = {
  user: null,
  profile: null,
  isAdmin: false,
  isSubscriber: false,
  isMember: false,
  loading: true,
};

type Notify = (message: string) => void;

export function App() {
  const [auth, setAuth] = useState<AuthState>(initialAuth);
  const [games, setGames] = useState<Game[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => subscribeToAuth(setAuth), []);
  useEffect(() => subscribeToGames(setGames), []);
  useEffect(() => subscribeToPosts(setPosts), []);

  return (
    <BrowserRouter basename={APP_BASE_PATH}>
      <AppShell auth={auth} games={games} posts={posts} />
    </BrowserRouter>
  );
}

function AppShell({ auth, games, posts }: { auth: AuthState; games: Game[]; posts: Post[] }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [theme, setTheme] = useState<ThemePreference>(() => loadTheme());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
    // Following the system means the browser bar colour has to follow it too.
    if (theme === "system") return watchSystemTheme(() => applyTheme("system"));
  }, [theme]);

  useEffect(() => {
    setNotice(null);
    setDrawerOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // The phone drawer behaves like a dialog: Esc closes it and the page behind stops scrolling.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); };
    document.documentElement.classList.add("drawer-open");
    window.addEventListener("keydown", onKey);
    return () => { document.documentElement.classList.remove("drawer-open"); window.removeEventListener("keydown", onKey); };
  }, [drawerOpen]);

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    saveRecent([]);
  }, []);

  const openSettings = useCallback(() => {
    setDrawerOpen(false);
    setSettingsOpen(true);
  }, []);

  const markPlayed = useCallback((gameId: string) => {
    setRecent((list) => {
      if (list[0] === gameId) return list;
      const next = pushRecent(list, gameId);
      saveRecent(next);
      return next;
    });
  }, []);

  return (
    <div className="app-shell">
      <TopBar auth={auth} drawerOpen={drawerOpen} onMenu={() => setDrawerOpen(true)} onNotify={notify} />
      <div className={`sidebar-scrim${drawerOpen ? " is-open" : ""}`} onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <Sidebar auth={auth} games={games} recent={recent} open={drawerOpen} onClose={() => setDrawerOpen(false)} onSettings={openSettings} onNotify={notify} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} auth={auth} theme={theme} onTheme={setTheme} recentCount={recent.length} onClearRecent={clearRecent} onNotify={notify} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage games={games} />} />
          <Route path="/game/:gameId" element={<GameRoute auth={auth} games={games} onNotify={notify} onPlayed={markPlayed} />} />
          <Route path="/community" element={<CommunityPage auth={auth} posts={posts} games={games} onNotify={notify} />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/admin" element={<AdminPage auth={auth} onNotify={notify} />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/cli-login" element={<CliLoginPage auth={auth} onNotify={notify} />} />
          {/* Addresses from the old layout, kept so shared links still land somewhere. */}
          <Route path="/hub" element={<Navigate to="/" replace />} />
          <Route path="/hub/community" element={<Navigate to="/community" replace />} />
          <Route path="/hub/game/:gameId" element={<LegacyGameRedirect />} />
          <Route path="/hub/admin" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {notice ? <div className="toast" role="status">{notice}</div> : null}
    </div>
  );
}

function LegacyGameRedirect() {
  const { gameId = "" } = useParams();
  return <Navigate to={`/game/${gameId}`} replace />;
}

function useAuthAction(auth: AuthState, onNotify: Notify) {
  return async function handleAuth() {
    try {
      if (auth.user) {
        await signOutUser();
        onNotify("로그아웃했습니다.");
      } else {
        await signInWithGoogle();
        onNotify("Google 로그인에 성공했습니다.");
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    }
  };
}

/** Asks the server to check the YouTube subscription; shared by the game lock and the settings window. */
function useSubscriptionCheck(auth: AuthState, onNotify: Notify) {
  const [verifying, setVerifying] = useState(false);
  async function verify() {
    if (!auth.user) return onNotify("먼저 Google 로그인을 해주세요.");
    setVerifying(true);
    try {
      await verifyYoutubeSubscription();
      onNotify("구독 확인이 완료되었습니다. 이제 프로토타입을 플레이할 수 있습니다.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "구독 확인에 실패했습니다.");
    } finally {
      setVerifying(false);
    }
  }
  return { verifying, verify };
}

function initialOf(name: string): string {
  return (name.trim().slice(0, 1) || "?").toUpperCase();
}

/* ---------- Frame: phone top bar and the sidebar / drawer ---------- */

function TopBar({ auth, drawerOpen, onMenu, onNotify }: { auth: AuthState; drawerOpen: boolean; onMenu: () => void; onNotify: Notify }) {
  const handleAuth = useAuthAction(auth, onNotify);
  return (
    <header className="topbar">
      <button className="icon-button" type="button" onClick={onMenu} aria-label="메뉴 열기" aria-expanded={drawerOpen} aria-controls="app-sidebar"><MenuIcon /></button>
      <Link to="/" className="brand"><img src={logoUrl} alt="" aria-hidden="true" /><span>Atelier</span></Link>
      {auth.user
        ? <span className="avatar" role="img" aria-label={`${getDisplayName(auth.user)} 로그인됨`}>{initialOf(getDisplayName(auth.user))}</span>
        : <button className="button button-primary small" type="button" onClick={handleAuth} disabled={auth.loading}>로그인</button>}
    </header>
  );
}

const THEME_OPTIONS: { id: ThemePreference; label: string; icon: () => ReactNode }[] = [
  { id: "system", label: "시스템", icon: () => <MonitorIcon /> },
  { id: "light", label: "라이트", icon: () => <SunIcon /> },
  { id: "dark", label: "다크", icon: () => <MoonIcon /> },
];

function ThemeSwitch({ theme, onTheme }: { theme: ThemePreference; onTheme: (theme: ThemePreference) => void }) {
  return (
    <div className="theme-switch" role="group" aria-label="화면 모드">
      {THEME_OPTIONS.map((option) => <button key={option.id} type="button" aria-pressed={theme === option.id} onClick={() => onTheme(option.id)}>{option.icon()}<span>{option.label}</span></button>)}
    </div>
  );
}

type SettingsTab = "general" | "account" | "keys";

/**
 * Settings in a modal <dialog>: General (theme, recent plays), Account (subscription, membership, sign out)
 * and, for admins, upload API keys.
 * On desktop the tabs switch panels; on phones the dialog fills the screen and both panels stack.
 */
function SettingsDialog({ open, onClose, auth, theme, onTheme, recentCount, onClearRecent, onNotify }: { open: boolean; onClose: () => void; auth: AuthState; theme: ThemePreference; onTheme: (theme: ThemePreference) => void; recentCount: number; onClearRecent: () => void; onNotify: Notify }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<SettingsTab>("general");
  const handleAuth = useAuthAction(auth, onNotify);
  const { verifying, verify } = useSubscriptionCheck(auth, onNotify);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const name = auth.user ? getDisplayName(auth.user) : null;
  const panelClass = (id: SettingsTab) => `settings-panel${tab === id ? " is-active" : ""}`;

  return (
    // The native dialog traps focus and closes on Esc; a click on the backdrop lands on the dialog itself.
    <dialog ref={dialogRef} className="settings-dialog" aria-labelledby="settings-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
      <header className="settings-head">
        <h2 id="settings-title">설정</h2>
        <button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label="설정 닫기"><CloseIcon /></button>
      </header>
      <div className="settings-body">
        <div className="settings-tabs" role="group" aria-label="설정 항목">
          <button type="button" aria-pressed={tab === "general"} onClick={() => setTab("general")}><GearIcon />일반</button>
          <button type="button" aria-pressed={tab === "account"} onClick={() => setTab("account")}><PersonIcon />계정</button>
          {auth.isAdmin ? <button type="button" aria-pressed={tab === "keys"} onClick={() => setTab("keys")}><KeyIcon />업로드 키</button> : null}
        </div>
        <div className="settings-panels">
          <section className={panelClass("general")} aria-labelledby="settings-general">
            <h3 id="settings-general" className="settings-section-title">일반</h3>
            <div className="setting-row">
              <div className="setting-copy"><strong>화면 모드</strong><p>시스템을 고르면 기기 설정을 따라가요.</p></div>
              <ThemeSwitch theme={theme} onTheme={onTheme} />
            </div>
            <div className="setting-row">
              <div className="setting-copy"><strong>최근 플레이 기록</strong><p>사이드바의 최근 플레이 목록을 지워요. 이 브라우저에만 저장돼 있어요.</p></div>
              <button className="button button-quiet small" type="button" onClick={() => { onClearRecent(); onNotify("최근 플레이 기록을 지웠어요."); }} disabled={!recentCount}>{recentCount ? "지우기" : "비어 있어요"}</button>
            </div>
          </section>
          <section className={panelClass("account")} aria-labelledby="settings-account">
            <h3 id="settings-account" className="settings-section-title">계정</h3>
            {name ? (
              <>
                <div className="setting-row setting-profile">
                  <span className="avatar avatar-large" aria-hidden="true">{initialOf(name)}</span>
                  <div className="setting-copy"><strong>{name}</strong><p>Google 계정으로 로그인됨 · 댓글과 글에 이 이름이 보여요</p></div>
                </div>
                <div className="setting-row">
                  <div className="setting-copy"><strong>YouTube 구독 <span className={`status-badge${auth.isSubscriber ? " is-on" : ""}`}>{auth.isSubscriber ? "확인됨" : "확인 안 됨"}</span></strong><p>{auth.isSubscriber ? "구독자 프로토타입을 플레이할 수 있어요." : "채널을 구독한 뒤 확인하면 구독자 프로토타입이 열려요."}</p></div>
                  <button className="button button-quiet small" type="button" onClick={verify} disabled={verifying}>{verifying ? "확인 중…" : auth.isSubscriber ? "다시 확인" : "구독 확인"}</button>
                </div>
                <div className="setting-row">
                  <div className="setting-copy"><strong>채널 멤버십 <span className={`status-badge${auth.isMember ? " is-on" : ""}`}>{auth.isMember ? "확인됨" : "확인 안 됨"}</span></strong><p>{auth.isMember ? "얼리 액세스 게임을 플레이할 수 있어요." : "운영자가 멤버십을 확인하면 얼리 액세스 게임이 열려요."}</p></div>
                  <a className="button button-quiet small" href={getConfiguredYoutubeUrl()} target="_blank" rel="noreferrer">채널 열기 ↗</a>
                </div>
                <div className="setting-row">
                  <div className="setting-copy"><strong>로그아웃</strong><p>이 브라우저에서 로그아웃해요.</p></div>
                  <button className="button button-danger small" type="button" onClick={() => { dialogRef.current?.close(); void handleAuth(); }}>로그아웃</button>
                </div>
              </>
            ) : (
              <div className="setting-row">
                <div className="setting-copy"><strong>로그인하지 않았어요</strong><p>Google로 로그인하면 좋아요와 한마디를 남기고, 구독자 게임을 열 수 있어요.</p></div>
                <button className="button button-primary small" type="button" onClick={() => void handleAuth()} disabled={auth.loading}>Google로 로그인</button>
              </div>
            )}
          </section>
          {auth.isAdmin ? (
            <section className={panelClass("keys")} aria-labelledby="settings-keys">
              <h3 id="settings-keys" className="settings-section-title">업로드 키</h3>
              {/* Mounted only while the dialog is open, so the key list loads when someone looks at it. */}
              {open ? <ApiKeySettings onNotify={onNotify} /> : null}
            </section>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

/** The account row at the bottom of the sidebar; it opens a small menu upwards with settings and sign in/out. */
function AccountMenu({ auth, onSettings, onNotify }: { auth: AuthState; onSettings: () => void; onNotify: Notify }) {
  const [open, setOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const handleAuth = useAuthAction(auth, onNotify);

  useEffect(() => {
    if (!open) { setLearnOpen(false); return; }
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const name = auth.user ? getDisplayName(auth.user) : null;
  return (
    <div className="account" ref={rootRef}>
      {open ? (
        <div className="account-menu" role="menu" aria-label="계정 메뉴">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSettings(); }}><GearIcon />설정</button>
          {/* A mouse opens the submenu by hovering; touch and keyboard toggle it with a press. */}
          <div className="account-learn" onPointerEnter={(event) => { if (event.pointerType === "mouse") setLearnOpen(true); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setLearnOpen(false); }}>
            <button className={learnOpen ? "is-active" : undefined} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={learnOpen} onClick={() => setLearnOpen((value) => !value)}><InfoIcon />더 알아보기<span className="account-menu-chevron"><ChevronRightIcon /></span></button>
            {learnOpen ? (
              <div className="account-flyout">
                <div className="account-submenu" role="menu" aria-label="더 알아보기">
                  <a role="menuitem" href={getConfiguredYoutubeUrl()} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>YouTube 채널<span aria-hidden="true">↗</span></a>
                  <Link role="menuitem" to="/privacy" onClick={() => setOpen(false)}>개인정보처리방침</Link>
                </div>
              </div>
            ) : null}
          </div>
          <span className="account-menu-rule" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); void handleAuth(); }} disabled={auth.loading}>
            {auth.user ? <><LogoutIcon />로그아웃</> : <><LoginIcon />Google로 로그인</>}
          </button>
        </div>
      ) : null}
      <button className={`account-button${open ? " is-open" : ""}`} type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        {name
          ? <><span className="avatar" aria-hidden="true">{initialOf(name)}</span><span className="account-copy"><strong>{name}</strong><small>{auth.isMember ? "채널 멤버" : auth.isSubscriber ? "YouTube 구독 확인됨" : "Google 계정"}</small></span></>
          : <><span className="avatar avatar-empty" aria-hidden="true"><PersonIcon /></span><span className="account-copy"><strong>Google로 로그인</strong><small>좋아요·댓글을 남기려면</small></span></>}
        <ChevronUpIcon />
      </button>
    </div>
  );
}

function Sidebar({ auth, games, recent, open, onClose, onSettings, onNotify }: { auth: AuthState; games: Game[]; recent: string[]; open: boolean; onClose: () => void; onSettings: () => void; onNotify: Notify }) {
  const rotation = useMemo(() => rotationForGames(games), [games]);
  const recentGames = recent.map((id) => games.find((game) => game.id === id)).filter((game): game is Game => Boolean(game));
  const badge = (game: Game) => (rotation.has(game.id) ? "이번 주 무료" : game.accessLevel === "public" ? null : accessShortLabel(game.accessLevel));
  const sideLink = ({ isActive }: { isActive: boolean }) => `side-link${isActive ? " is-active" : ""}`;

  return (
    <nav id="app-sidebar" className={`sidebar${open ? " is-open" : ""}`} aria-label="주 메뉴">
      <div className="sidebar-head">
        <Link to="/" className="brand"><img src={logoUrl} alt="" aria-hidden="true" /><span>Atelier</span></Link>
        <button className="icon-button sidebar-close" type="button" onClick={onClose} aria-label="메뉴 닫기"><CloseIcon /></button>
      </div>
      <div className="sidebar-scroll">
        <div className="side-group">
          <NavLink to="/" end className={sideLink}><HomeIcon />홈</NavLink>
          <NavLink to="/community" className={sideLink}><ChatIcon />커뮤니티</NavLink>
          <NavLink to="/about" className={sideLink}><InfoIcon />Atelier 소개</NavLink>
          {auth.isAdmin ? <NavLink to="/admin" className={sideLink}><SlidersIcon />관리</NavLink> : null}
        </div>
        {recentGames.length ? (
          <div className="side-group">
            <h2 className="side-heading">최근 플레이</h2>
            {recentGames.map((game) => <NavLink key={game.id} to={`/game/${game.id}`} className={sideLink}><span className="side-title">{game.title}</span></NavLink>)}
          </div>
        ) : null}
        <div className="side-group">
          <h2 className="side-heading">전체 게임</h2>
          {games.map((game) => {
            const label = badge(game);
            return <NavLink key={game.id} to={`/game/${game.id}`} className={sideLink}><span className="side-title">{game.title}</span>{label ? <span className="side-badge">{label}</span> : null}</NavLink>;
          })}
        </div>
      </div>
      <div className="sidebar-foot">
        <AccountMenu auth={auth} onSettings={onSettings} onNotify={onNotify} />
      </div>
    </nav>
  );
}

/* ---------- Home: search and the game list ---------- */

function gameBadge(game: Game, rotation: Set<string>): string | null {
  if (rotation.has(game.id)) return "이번 주 무료";
  return game.accessLevel === "public" ? null : accessShortLabel(game.accessLevel);
}

function genreText(game: Game): string {
  return game.genres.map((genre) => `# ${genre}`).join("  ");
}

function HomePage({ games }: { games: Game[] }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const rotation = useMemo(() => rotationForGames(games), [games]);
  const tags = useMemo(() => popularGenres(games).slice(0, 12), [games]);
  const results = useMemo(() => filterGames(games, query, tag), [games, query, tag]);
  const filtered = query.trim() !== "" || tag !== null;

  return (
    <div className="home-page">
      <div className="home-head">
        <h1>오늘은 어떤 게임을 해볼까요?</h1>
        <form className="search-field" role="search" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="game-search" className="sr-only">게임 찾기</label>
          <SearchIcon />
          <input id="game-search" type="text" inputMode="search" enterKeyHint="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="게임 이름이나 #장르 태그로 찾기" />
          {query ? <button className="search-clear" type="button" onClick={() => setQuery("")} aria-label="검색어 지우기"><CloseIcon /></button> : null}
        </form>
        {tags.length ? (
          <div className="tag-chips" role="group" aria-label="장르 태그">
            <span className="tag-chips-label">장르 태그</span>
            {tags.map((genre) => <button key={genre} className="chip" type="button" aria-pressed={tag === genre} onClick={() => setTag(tag === genre ? null : genre)}># {genre}</button>)}
          </div>
        ) : null}
        <p className="result-count" aria-live="polite">{filtered ? `검색 결과 ${results.length}개` : `전체 게임 ${games.length}개`}</p>
      </div>
      <div className="home-results">
        {results.length
          ? <div className="game-grid">{results.map((game) => <GameTile key={game.id} game={game} badge={gameBadge(game, rotation)} />)}</div>
          : <p className="empty-box">{games.length ? "맞는 게임이 없어요. 다른 이름이나 태그로 찾아보세요." : "게임을 불러오는 중이에요…"}</p>}
      </div>
      <p className="home-hint">검색어가 없으면 전체 게임이 보여요 · 카드를 누르면 바로 플레이할 수 있어요</p>
    </div>
  );
}

function GameTile({ game, badge }: { game: Game; badge: string | null }) {
  return (
    <Link className="game-tile" to={`/game/${game.id}`}>
      <span className="game-tile-art" style={game.coverUrl ? { backgroundImage: `url(${game.coverUrl})` } : undefined}>
        {badge ? <span className="tile-badge">{badge}</span> : null}
        <span className="tile-play" aria-hidden="true"><PlayIcon /></span>
      </span>
      <span className="game-tile-copy"><strong>{game.title}</strong><span>{genreText(game)}</span></span>
    </Link>
  );
}

/* ---------- Game: the screen card, its notes and the player comments ---------- */

function GameRoute(props: { auth: AuthState; games: Game[]; onNotify: Notify; onPlayed: (gameId: string) => void }) {
  const { gameId = "" } = useParams();
  // A fresh page per game keeps like, play and view state from leaking across games.
  return <GamePage key={gameId} gameId={gameId} {...props} />;
}

function GamePage({ gameId, auth, games, onNotify, onPlayed }: { gameId: string; auth: AuthState; games: Game[]; onNotify: Notify; onPlayed: (gameId: string) => void }) {
  const listed = games.find((item) => item.id === gameId) ?? null;
  const [fetched, setFetched] = useState<Game | null | undefined>(undefined);
  const game = listed ?? fetched ?? null;
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playStatus, setPlayStatus] = useState<"idle" | "loading" | string>("idle");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(game?.likeCount ?? 0);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const { verifying, verify: verifySubscriber } = useSubscriptionCheck(auth, onNotify);
  const playerRef = useRef<HTMLDivElement>(null);
  const lastSessionRenewal = useRef(0);

  // The live list may not hold this game yet (or ever, for a direct link), so ask for it once.
  useEffect(() => {
    if (listed) return;
    let alive = true;
    findGameById(gameId).then((result) => { if (alive) setFetched(result); });
    return () => { alive = false; };
  }, [gameId, listed]);

  useEffect(() => {
    setLikeCount(game?.likeCount ?? 0);
  }, [game?.likeCount]);

  const rotation = rotationForGames(games);
  const permission = game ? accessPermission(game, auth, rotation) : { allowed: false as const };
  const loadedGameId = game?.id;

  useEffect(() => {
    if (loadedGameId) onPlayed(loadedGameId);
  }, [loadedGameId, onPlayed]);

  // Open the build as soon as the visitor is known to have access; locked games stay on the dark screen.
  useEffect(() => {
    setPlaying(false);
    setPlayUrl(null);
    setPlayStatus("idle");
    if (loadedGameId && !auth.loading && permission.allowed) void startPlaying();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedGameId, auth.loading, permission.allowed]);

  // Wait for auth so an admin's own visits are recognized and left out of the count.
  useEffect(() => {
    setViewCount(null);
    if (!game || auth.loading) return;
    let alive = true;
    void recordGameView(game).then((count) => { if (alive) setViewCount(count); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedGameId, auth.loading]);

  if (!game) {
    if (fetched === undefined) return <LoadingState />;
    return <EmptyState title="게임을 찾을 수 없어요" text="아직 공개되지 않았거나 주소가 잘못되었어요." />;
  }

  const freeThisWeek = game.accessLevel === "subscriber" && rotation.has(game.id);
  async function startPlaying() {
    if (!game) return;
    if (!permission.allowed) {
      if (permission.reason === "login") return onNotify("이 게임은 Google 로그인 후 플레이할 수 있습니다.");
      if (permission.reason === "member") return onNotify("이 얼리 액세스 빌드는 채널 멤버십 회원에게만 열립니다.");
      return onNotify("이 프로토타입은 YouTube 채널 구독 확인 후 열립니다.");
    }
    if (!hasFirebaseConfig) {
      const demoPlayPath = game?.demoPlayPath;
      setPlayUrl(demoPlayPath ? `${import.meta.env.BASE_URL}${demoPlayPath}` : null);
      setPlaying(true);
      setPlayStatus("idle");
      if (!demoPlayPath) onNotify("Firebase 운영값을 연결하면 실제 웹빌드가 이곳에서 열립니다.");
      return;
    }
    setPlayStatus("loading");
    try {
      const session = await getPlaySession(game.id);
      if (!session.playUrl) throw new Error("플레이 세션을 만들지 못했습니다.");
      setPlayUrl(session.playUrl);
      setPlaying(true);
      setPlayStatus("idle");
    } catch (error) {
      setPlayStatus(error instanceof Error ? error.message : "게임을 열지 못했습니다.");
    }
  }

  // The build's play token ran out (often after the phone slept and the iframe reloaded), so open a fresh session in place.
  function renewSession() {
    const now = Date.now();
    // A fresh token that is refused at once points to a server problem, so stop instead of reloading forever.
    if (now - lastSessionRenewal.current < 30_000) {
      setPlaying(false);
      setPlayStatus("게임 세션을 다시 열지 못했습니다. 페이지를 새로고침해 주세요.");
      return;
    }
    lastSessionRenewal.current = now;
    void startPlaying();
  }

  async function like() {
    if (!game) return;
    if (!auth.user) return onNotify("좋아요를 누르려면 Google 로그인이 필요합니다.");
    try {
      const result = await toggleLike("game", game.id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "좋아요 처리에 실패했습니다.");
    }
  }

  async function share() {
    if (!game) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: game.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      onNotify("게임 링크를 복사했어요.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) onNotify("링크를 복사하지 못했어요.");
    }
  }

  const header = (
    <>
      <h1>{game.title}</h1>
      <div className="game-card-actions">
        <button className={`pill-button${liked ? " is-liked" : ""}`} type="button" onClick={like} aria-pressed={liked} aria-label={`좋아요 ${likeCount}`}>{liked ? "♥" : "♡"} {likeCount}</button>
        <button className="pill-button" type="button" onClick={share}>공유</button>
      </div>
    </>
  );

  return (
    <div className="game-page">
      <article className="game-card">
        <GameScreen gameId={game.id} header={header} playing={playing} playUrl={playUrl} message={playScreenMessage(auth, permission, playStatus)} locked={!auth.loading && !permission.allowed} playerRef={playerRef} onSessionExpired={renewSession} />
        <div className="game-info">
          <div className="tag-row">
            {game.genres.map((genre) => <span className="tag" key={genre}># {genre}</span>)}
            <span className={`tag access-tag ${game.accessLevel}`}>{accessShortLabel(game.accessLevel)}</span>
            {freeThisWeek ? <span className="tag access-tag public">이번 주 무료</span> : null}
          </div>
          <p className="game-description">{game.description || "Material Stone Games의 플레이 가능한 작업물입니다. 지금의 빌드에서 다음 아이디어를 만나보세요."}</p>
          <p className="game-stats">{viewCount !== null ? `조회 ${viewCount.toLocaleString("ko-KR")} · ` : ""}좋아요 {likeCount}</p>
        </div>
      </article>
      {!permission.allowed && permission.reason === "member" ? <div className="callout"><div><strong>채널 멤버 얼리 액세스</strong><p>Material Stone 채널 멤버십 회원에게 먼저 열리는 빌드입니다. 멤버십 확인은 운영자가 처리합니다.</p></div><a className="button button-quiet small" href={getConfiguredYoutubeUrl()} target="_blank" rel="noreferrer">채널 열기 ↗</a></div> : null}
      {!permission.allowed && permission.reason === "subscriber" && auth.user ? <div className="callout"><div><strong>구독자 프로토타입</strong><p>Material Stone YouTube 채널 구독을 확인하면 이 빌드가 열립니다.</p></div><button className="button button-primary small" type="button" onClick={verifySubscriber} disabled={verifying}>{verifying ? "확인 중…" : "구독 확인"}</button><a className="button button-quiet small" href={getConfiguredYoutubeUrl()} target="_blank" rel="noreferrer">채널 열기 ↗</a></div> : null}
      <section className="game-comments">
        <CommentThread targetType="game" targetId={game.id} auth={auth} onNotify={onNotify} heading="플레이어 한마디" docked />
      </section>
    </div>
  );
}

function playScreenMessage(auth: AuthState, permission: ReturnType<typeof accessPermission>, status: string): string {
  if (auth.loading) return "접근 권한을 확인하는 중입니다…";
  if (!permission.allowed) {
    if (permission.reason === "login") return "Google 로그인 후 플레이할 수 있는 게임입니다.";
    if (permission.reason === "member") return "채널 멤버십 회원에게만 열리는 얼리 액세스 빌드입니다.";
    return auth.user ? "YouTube 채널 구독을 확인하면 플레이할 수 있습니다." : "Google 로그인 후 YouTube 채널 구독을 확인하면 플레이할 수 있습니다.";
  }
  if (status === "loading" || status === "idle") return "게임을 불러오는 중입니다…";
  return status;
}

// Keyboard Lock exists only in some browsers and must be called from this top-level page, not from the build's iframe.
function keyboardLock() {
  return (navigator as Navigator & { keyboard?: { lock(keys: string[]): Promise<void>; unlock(): void } }).keyboard;
}

function lockEscape() {
  void keyboardLock()?.lock(["Escape"]).catch(() => undefined);
}

/** The card's header and the game screen under it; together they are what goes fullscreen. */
function GameScreen({ gameId, header, playing, playUrl, message, locked, playerRef, onSessionExpired }: { gameId: string; header: ReactNode; playing: boolean; playUrl: string | null; message: string; locked: boolean; playerRef: React.RefObject<HTMLDivElement | null>; onSessionExpired: () => void }) {
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  // iPhone Safari has no element fullscreen, so the player falls back to covering the viewport.
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const fullscreen = nativeFullscreen || pseudoFullscreen;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const capturesEscape = useRef(false);
  // The message listener below lives across renders, so it reads the latest handler through a ref.
  const sessionExpired = useRef(onSessionExpired);
  sessionExpired.current = onSessionExpired;
  useSaveBridge(gameId, frameRef, playUrl);
  // Uploaded builds run on the functions origin and demos on this one, so the target stays "*"; the payload is only a boolean.
  function announceFullscreen() {
    frameRef.current?.contentWindow?.postMessage({ type: "atelier:fullscreen-change", fullscreen }, "*");
  }
  useEffect(() => {
    // The header button that held focus unmounts in fullscreen; keyboard games need the keys to reach the build.
    if (fullscreen) frameRef.current?.focus();
    else keyboardLock()?.unlock();
    announceFullscreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);
  useEffect(() => () => keyboardLock()?.unlock(), []);
  useEffect(() => {
    // A build can only leave fullscreen this way, never enter it, so the worst a hostile build can do is close its own view.
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      // Engines that boot after the iframe's load event ask for the state they missed.
      if (event.data?.type === "atelier:get-fullscreen") announceFullscreen();
      // Opt-in: a build that ignores Esc would otherwise leave players with a key that seems dead.
      if (event.data?.type === "atelier:capture-esc") {
        capturesEscape.current = true;
        if (nativeFullscreen) lockEscape();
      }
      // Sent by the gateway's own page when the token ran out; a build faking it only reloads itself.
      if (event.data?.type === "atelier:session-expired") sessionExpired.current();
      if (event.data?.type === "atelier:exit-fullscreen") {
        if (pseudoFullscreen) setPseudoFullscreen(false);
        else if (nativeFullscreen) void exitFullscreen();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeFullscreen, pseudoFullscreen]);
  useEffect(() => {
    const sync = () => setNativeFullscreen(fullscreenElement() === playerRef.current);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); document.removeEventListener("webkitfullscreenchange", sync); };
  }, [playerRef]);
  useEffect(() => {
    if (!pseudoFullscreen) return;
    document.documentElement.classList.add("player-locked");
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPseudoFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.documentElement.classList.remove("player-locked"); window.removeEventListener("keydown", onKey); };
  }, [pseudoFullscreen]);
  async function enterFullscreen() {
    const player = playerRef.current as FullscreenTarget | null;
    if (!player) return;
    if (capturesEscape.current) lockEscape();
    // iPhone Safari can expose the methods while reporting fullscreen as unavailable.
    if (!fullscreenEnabled()) { setPseudoFullscreen(true); return; }
    try {
      if (player.requestFullscreen) await player.requestFullscreen();
      else if (player.webkitRequestFullscreen) await player.webkitRequestFullscreen();
      else { setPseudoFullscreen(true); return; }
    } catch {
      setPseudoFullscreen(true);
      return;
    }
    // Older WebKit returns nothing and fails silently, so check that fullscreen really started.
    window.setTimeout(() => { if (!fullscreenElement()) setPseudoFullscreen(true); }, 500);
  }

  let screen: ReactNode;
  if (!playing) screen = <div className="play-screen" role="status">{locked ? <span className="play-screen-kicker">잠긴 게임</span> : null}<p>{message}</p></div>;
  else if (playUrl) screen = <iframe ref={frameRef} title="Atelier game build" src={playUrl} onLoad={announceFullscreen} allow="fullscreen; gamepad; pointer-lock; autoplay" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock" />;
  else screen = <div className="play-screen"><span className="live-dot" /><p>Firebase 환경변수를 연결하면 업로드된 게임이 이 화면에서 실행됩니다.</p></div>;

  return (
    <div className={`game-screen${pseudoFullscreen ? " is-pseudo-fullscreen" : ""}`} ref={playerRef}>
      {fullscreen ? null : (
        <div className="game-card-head">
          {header}
          {playing ? <button className="round-button" type="button" onClick={enterFullscreen} aria-label="전체 화면" title="전체 화면"><FullscreenIcon /></button> : null}
        </div>
      )}
      <div className="game-screen-frame">{screen}</div>
    </div>
  );
}

/**
 * Lets the build keep its saves in this page's first-party storage instead of its own third-party iframe storage,
 * which browsers may wipe when the app closes. The listener goes up before the iframe is drawn so an early
 * `storage-hello` is not missed, and the bridge outlives the iframe so a reopened play session sees the same saves.
 */
function useSaveBridge(gameId: string, frameRef: React.RefObject<HTMLIFrameElement | null>, playUrl: string | null) {
  const origin = useRef<string | null>(null);
  origin.current = playUrl ? new URL(playUrl, window.location.href).origin : null;
  useLayoutEffect(() => {
    // Replies carry save data, so they go only to the frame, and only while it still shows the build's origin.
    const bridge = createSaveBridge(gameId, (message) => {
      if (origin.current) frameRef.current?.contentWindow?.postMessage(message, origin.current);
    });
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== origin.current) return;
      bridge.handle(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [gameId, frameRef]);
}

// Safari before 16.4 (and iPadOS) only exposes the webkit-prefixed fullscreen API.
type FullscreenTarget = HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
function fullscreenEnabled() { const doc = document as FullscreenDocument; return Boolean(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled); }
function fullscreenElement() { const doc = document as FullscreenDocument; return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null; }
async function exitFullscreen() { const doc = document as FullscreenDocument; if (doc.exitFullscreen) await doc.exitFullscreen(); else await doc.webkitExitFullscreen?.(); }

/* ---------- Comments as chat bubbles ---------- */

function CommentThread({ targetType, targetId, auth, onNotify, heading, docked = false }: { targetType: TargetType; targetId: string; auth: AuthState; onNotify: Notify; heading?: string; docked?: boolean }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => subscribeToComments(targetType, targetId, setComments), [targetId, targetType]);
  const replyTarget = comments.find((comment) => comment.id === replyTo);
  const inputId = `comment-${targetType}-${targetId}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!auth.user) return onNotify("댓글을 쓰려면 Google 로그인이 필요합니다.");
    const error = validateCommentText(text);
    if (error) return onNotify(error);
    try {
      await createComment(targetType, targetId, text.trim(), replyTo);
      setText("");
      setReplyTo(undefined);
      onNotify("댓글을 남겼습니다.");
    } catch (reason) {
      onNotify(reason instanceof Error ? reason.message : "댓글을 남기지 못했습니다.");
    }
  }

  function startReply(commentId: string) {
    setReplyTo(commentId);
    inputRef.current?.focus();
  }

  const mine = (comment: Comment) => Boolean(auth.user && auth.user.uid === comment.authorId);
  const topLevel = comments.filter((comment) => comment.depth === 0);

  return (
    <div className={`comment-thread${docked ? " is-docked" : ""}`}>
      {heading ? <h2 className="section-label">{heading} {comments.length}</h2> : null}
      {topLevel.length ? (
        <ol className="bubble-list">
          {topLevel.map((comment) => {
            const replies = comments.filter((reply) => reply.parentId === comment.id);
            return (
              <li className="bubble-group" key={comment.id}>
                <Bubble comment={comment} mine={mine(comment)} auth={auth} onNotify={onNotify} onReply={() => startReply(comment.id)} />
                {replies.length ? <ol className="bubble-replies">{replies.map((reply) => <li key={reply.id}><Bubble comment={reply} mine={mine(reply)} auth={auth} onNotify={onNotify} /></li>)}</ol> : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="empty-note">아직 한마디가 없어요. 첫 이야기를 남겨보세요.</p>}
      <form className="composer" onSubmit={submit}>
        {replyTarget ? <div className="composer-context"><span>↳ {replyTarget.authorName}님에게 답글</span><button type="button" onClick={() => setReplyTo(undefined)} aria-label="답글 취소"><CloseIcon /></button></div> : null}
        <div className="composer-row">
          <label htmlFor={inputId} className="sr-only">{replyTarget ? "답글" : "댓글"}</label>
          <input ref={inputRef} id={inputId} value={text} onChange={(event) => setText(event.target.value)} placeholder={auth.user ? (replyTarget ? "답글을 입력하세요" : targetType === "game" ? "이 게임에 한마디 남기기" : "짧은 댓글을 남겨보세요") : "Google 로그인 후 남길 수 있어요"} maxLength={MAX_COMMENT_LENGTH} />
          <button className="send-button" type="submit" aria-label="보내기"><SendIcon /></button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ comment, mine, auth, onNotify, onReply }: { comment: Comment; mine: boolean; auth: AuthState; onNotify: Notify; onReply?: () => void }) {
  const removable = canDelete(auth, comment.authorId);
  return (
    <div className={`bubble-item${mine ? " is-mine" : ""}`}>
      <span className="bubble-meta">{mine ? "나" : comment.authorName} · {formatDate(comment.createdAt)}</span>
      <p className="bubble">{comment.text}</p>
      {onReply || removable ? (
        <span className="bubble-actions">
          {onReply ? <button className="text-button" type="button" onClick={onReply}>답글</button> : null}
          {removable ? <button className="text-button danger" type="button" onClick={() => confirmDelete(comment.depth === 0 ? "이 댓글과 답글을 삭제할까요?" : "이 답글을 삭제할까요?", () => deleteComment(comment.id), "댓글을 삭제했습니다.", onNotify)}>삭제</button> : null}
        </span>
      ) : null}
    </div>
  );
}

function canDelete(auth: AuthState, authorId: string): boolean {
  return Boolean(auth.user && (auth.isAdmin || auth.user.uid === authorId));
}

async function confirmDelete(question: string, remove: () => Promise<void>, done: string, onNotify: Notify) {
  if (!window.confirm(question)) return;
  try {
    await remove();
    onNotify(done);
  } catch (error) {
    onNotify(error instanceof Error ? error.message : "삭제하지 못했습니다.");
  }
}

/* ---------- Community ---------- */

type PostSort = "latest" | "popular" | "preserved";
const POST_SORTS: { id: PostSort; label: string }[] = [
  { id: "latest", label: "최신" },
  { id: "popular", label: "인기" },
  { id: "preserved", label: "명예의 전당" },
];

function CommunityPage({ auth, posts, games, onNotify }: { auth: AuthState; posts: Post[]; games: Game[]; onNotify: Notify }) {
  const [sort, setSort] = useState<PostSort>("latest");
  const visible = useMemo(() => {
    if (sort === "popular") return [...posts].sort((a, b) => b.likeCount - a.likeCount);
    if (sort === "preserved") return posts.filter((post) => post.retentionStatus === "preserved");
    return posts;
  }, [posts, sort]);
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);

  return (
    <div className="community-page">
      <header className="page-bar">
        <h1>커뮤니티</h1>
        <div className="segmented" role="group" aria-label="정렬">
          {POST_SORTS.map((item) => <button key={item.id} type="button" aria-pressed={sort === item.id} onClick={() => setSort(item.id)}>{item.label}</button>)}
        </div>
      </header>
      <div className="feed">
        <p className="notice-box">게시글은 한 달 뒤 정리돼요. 매월 좋아요 10개 이상인 1위 글은 명예의 전당에 남아요.</p>
        {visible.length
          ? visible.map((post) => <PostCard key={post.id} post={post} game={post.gameId ? gamesById.get(post.gameId) : undefined} auth={auth} onNotify={onNotify} />)
          : <p className="empty-note">{sort === "preserved" ? "아직 명예의 전당에 오른 글이 없어요." : "아직 글이 없어요. 첫 글을 남겨보세요."}</p>}
      </div>
      <PostComposer auth={auth} games={games} onNotify={onNotify} />
    </div>
  );
}

function PostComposer({ auth, games, onNotify }: { auth: AuthState; games: Game[]; onNotify: Notify }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const linked = games.find((game) => game.id === gameId);
  const options = filterGames(games, pickerQuery).slice(0, 8);
  const locked = !auth.user || saving;

  function clearImage() {
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function pickGame(id: string) {
    setGameId(id);
    setPickerOpen(false);
    setPickerQuery("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!auth.user) return onNotify("글을 작성하려면 Google 로그인이 필요합니다.");
    const textError = validatePostText(text);
    if (textError) return onNotify(textError);
    if (image) {
      const imageError = validateImage(image);
      if (imageError) return onNotify(imageError);
    }
    setSaving(true);
    try {
      const result = await createPost(text.trim(), Boolean(image), gameId ?? undefined);
      if (image && result.imagePath) await uploadBoardImage(result.postId, image);
      setText("");
      clearImage();
      setGameId(null);
      onNotify("게시글을 올렸습니다.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "게시글을 올리지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="composer-dock">
      {pickerOpen ? (
        <div className="game-picker" role="dialog" aria-label="연결할 게임 고르기" onKeyDown={(event) => { if (event.key === "Escape") setPickerOpen(false); }}>
          <label htmlFor="game-picker-search" className="sr-only">게임 찾기</label>
          <input id="game-picker-search" autoFocus value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="게임 이름으로 찾기" autoComplete="off" />
          {options.length ? (
            <ul className="game-picker-list">
              {options.map((game) => (
                <li key={game.id}>
                  <button className="picker-option" type="button" aria-pressed={game.id === gameId} onClick={() => pickGame(game.id)}>
                    <span className="picker-thumb" style={game.coverUrl ? { backgroundImage: `url(${game.coverUrl})` } : undefined} aria-hidden="true" />
                    <span className="picker-title">{game.title}</span>
                    {game.id === gameId ? <CheckIcon /> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="empty-note">맞는 게임이 없어요.</p>}
        </div>
      ) : null}
      <form className="composer" onSubmit={submit}>
        {linked || image ? (
          <div className="composer-attachments">
            {linked ? <span className="attach-chip"><GamepadIcon />{linked.title}<button type="button" onClick={() => setGameId(null)} aria-label="게임 연결 해제"><CloseIcon /></button></span> : null}
            {image ? <span className="attach-chip"><ImageIcon />{image.name}<button type="button" onClick={clearImage} aria-label="이미지 빼기"><CloseIcon /></button></span> : null}
          </div>
        ) : null}
        <div className="composer-row">
          <button className="round-button quiet" type="button" onClick={() => fileRef.current?.click()} disabled={locked} aria-label="이미지 첨부"><ImageIcon /></button>
          <input ref={fileRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-hidden="true" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
          <button className={`round-button quiet${pickerOpen ? " is-active" : ""}`} type="button" onClick={() => setPickerOpen((value) => !value)} disabled={locked || !games.length} aria-label="게임 연결" aria-expanded={pickerOpen}><GamepadIcon /></button>
          <label htmlFor="post-text" className="sr-only">새 글</label>
          <input id="post-text" value={text} onChange={(event) => setText(event.target.value)} placeholder={auth.user ? "작업실에 짧은 글을 남겨보세요" : "Google 로그인 후 글을 남길 수 있어요"} maxLength={MAX_POST_LENGTH} disabled={locked} />
          <button className="send-button" type="submit" disabled={locked} aria-label={saving ? "올리는 중" : "올리기"}><SendIcon /></button>
        </div>
      </form>
      <p className="composer-note">이미지 한 장 · 게임 하나까지 연결 · {text.length}/{MAX_POST_LENGTH}자</p>
    </div>
  );
}

function PostCard({ post, game, auth, onNotify }: { post: Post; game?: Game; auth: AuthState; onNotify: Notify }) {
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const month = Number(post.monthKey.split("-")[1]);

  async function like() {
    if (!auth.user) return onNotify("좋아요를 누르려면 Google 로그인이 필요합니다.");
    try {
      const result = await toggleLike("post", post.id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "좋아요 처리에 실패했습니다.");
    }
  }

  return (
    <article className="post">
      <span className="avatar" aria-hidden="true">{initialOf(post.authorName)}</span>
      <div className="post-body">
        <div className="post-meta">
          <strong>{post.authorName}</strong>
          {post.retentionStatus === "preserved" ? <span className="hall-badge">명예의 전당{month ? ` · ${month}월` : ""}</span> : null}
          <time>{formatDate(post.createdAt)}</time>
        </div>
        <p className="post-text">{post.text}</p>
        {post.imageUrl ? <img className="post-image" src={post.imageUrl} alt="게시글 첨부 이미지" /> : null}
        {game ? <GameLinkCard game={game} /> : null}
        <div className="post-actions">
          <button className={`text-action${liked ? " is-liked" : ""}`} type="button" onClick={like} aria-pressed={liked}>{liked ? "♥" : "♡"} {likeCount}</button>
          <button className="text-action" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>댓글 {post.commentCount}</button>
          {canDelete(auth, post.authorId) ? <button className="text-action danger" type="button" onClick={() => confirmDelete("이 게시글과 댓글을 모두 삭제할까요?", () => deletePost(post.id), "게시글을 삭제했습니다.", onNotify)}>삭제</button> : null}
        </div>
        {expanded ? <CommentThread targetType="post" targetId={post.id} auth={auth} onNotify={onNotify} /> : null}
      </div>
    </article>
  );
}

function GameLinkCard({ game }: { game: Game }) {
  return (
    <Link className="game-link" to={`/game/${game.id}`}>
      <span className="game-link-thumb" style={game.coverUrl ? { backgroundImage: `url(${game.coverUrl})` } : undefined} aria-hidden="true" />
      <span className="game-link-copy"><strong>{game.title}</strong><span>{[genreText(game), accessShortLabel(game.accessLevel)].filter(Boolean).join(" · ")}</span></span>
      <span className="game-link-play"><PlayIcon />플레이</span>
    </Link>
  );
}

/* ---------- About ---------- */

const ACCESS_TIERS: { level: AccessLevel; title: string; text: string }[] = [
  { level: "public", title: "공개", text: "누구나 로그인 없이 플레이" },
  { level: "login", title: "로그인 데모", text: "Google 로그인하면 플레이" },
  { level: "subscriber", title: "구독자 프로토타입", text: "YouTube 채널 구독자. 매주 몇 편은 모두에게 무료로 열려요." },
  { level: "member", title: "멤버 얼리 액세스", text: "YouTube 채널 멤버가 가장 먼저 플레이" },
];

function AboutPage() {
  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-art" aria-hidden="true"><Suspense fallback={<img src={logoUrl} alt="" />}><GemForge /></Suspense></div>
        <h1>지금 만들고 있는 게임,<br />먼저 플레이하세요.</h1>
        <p className="about-lede">Atelier는 Material Stone Games가 만드는 게임과 작은 실험들을 모아두는 작업실입니다. 완성된 게임부터 아직 흔들리는 프로토타입까지, 설치 없이 브라우저에서 바로 해볼 수 있어요.</p>
        <div className="about-actions">
          <Link className="button button-primary" to="/">게임 둘러보기</Link>
          <a className="button button-quiet" href={getConfiguredYoutubeUrl()} target="_blank" rel="noreferrer">YouTube 채널 ↗</a>
          {discordUrl
            ? <a className="button button-quiet" href={discordUrl} target="_blank" rel="noreferrer">Discord ↗</a>
            : <span className="button button-disabled" aria-disabled="true" title="Discord 서버는 준비 중이에요">Discord <span className="soon-badge">준비 중</span></span>}
        </div>
      </section>
      <section className="about-section">
        <h2>이렇게 즐겨요</h2>
        <ol className="step-grid">
          <li><span>01</span><strong>골라서 바로 플레이</strong><p>홈에서 게임 이름이나 #장르 태그로 찾고, 누르면 그 자리에서 시작돼요.</p></li>
          <li><span>02</span><strong>한마디 남기기</strong><p>플레이한 소감이 다음 빌드를 만들어요. 좋아요와 댓글은 Google 로그인 후에.</p></li>
          <li><span>03</span><strong>커뮤니티에 흔적 남기기</strong><p>짧은 글과 이미지 한 장, 게임 하나를 연결할 수 있어요. 달마다 1위 글은 남아요.</p></li>
        </ol>
      </section>
      <section className="about-section">
        <h2>누가 어떤 게임을 할 수 있나요</h2>
        <ul className="tier-table">
          {ACCESS_TIERS.map((tier) => <li key={tier.level} className={`tier-row ${tier.level}`}><span className="tier-dot" aria-hidden="true" /><strong>{tier.title}</strong><span>{tier.text}</span></li>)}
        </ul>
      </section>
      <footer className="about-foot"><span>A small workshop by Material Stone Games</span><Link to="/privacy">개인정보처리방침</Link></footer>
    </div>
  );
}

/* ---------- Admin ---------- */

function AdminPage({ auth, onNotify }: { auth: AuthState; onNotify: Notify }) {
  if (auth.loading) return <LoadingState />;
  if (!auth.user) return <PermissionPanel title="관리자 전용" text="관리 화면은 Google 로그인 후 이용할 수 있습니다." />;
  if (!auth.isAdmin) return <PermissionPanel title="권한이 없어요" text="이 Google 계정에는 Atelier 관리자 권한이 없습니다." />;
  return <ManagePage onNotify={onNotify} />;
}

function PermissionPanel({ title, text }: { title: string; text: string }) { return <div className="center-state"><span className="state-symbol">✳</span><h1>{title}</h1><p>{text}</p><Link className="button button-primary" to="/">홈으로</Link></div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="center-state"><span className="state-symbol">○</span><h1>{title}</h1><p>{text}</p><Link className="button button-primary" to="/">홈으로</Link></div>; }
function LoadingState() { return <div className="center-state"><span className="spinner-large" /><p>불러오는 중…</p></div>; }

function formatDate(value: Game["createdAt"] | Post["createdAt"] | Comment["createdAt"]): string { if (!value) return "방금"; const date = value instanceof Date ? value : value.toDate(); return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(date); }

/* ---------- Icons (stroke icons inherit the text colour) ---------- */

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
function MenuIcon() { return <Icon size={22}><path d="M3 6h12M3 12h8" /></Icon>; }
function CloseIcon() { return <Icon size={16}><path d="M4.5 4.5l9 9M13.5 4.5l-9 9" /></Icon>; }
function HomeIcon() { return <Icon><path d="M3 8.5L9 3.5l6 5V15H3z" /></Icon>; }
function ChatIcon() { return <Icon><path d="M3 4.5h12v8H8l-3.5 2.5v-2.5H3z" /></Icon>; }
function InfoIcon() { return <Icon><circle cx="9" cy="9" r="6.5" /><path d="M9 8.2v4.3M9 5.6v.1" /></Icon>; }
function SlidersIcon() { return <Icon><path d="M3 5h7M13 5h2M3 13h2M8 13h7" /><circle cx="11.5" cy="5" r="1.5" /><circle cx="6.5" cy="13" r="1.5" /></Icon>; }
function PersonIcon() { return <Icon size={16}><circle cx="9" cy="6.5" r="3" /><path d="M3 16c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" /></Icon>; }
function SearchIcon() { return <Icon><circle cx="8" cy="8" r="5" /><path d="M12 12l3.5 3.5" /></Icon>; }
function SendIcon() { return <Icon size={16}><path d="M9 14.5V4M4.5 8.5L9 4l4.5 4.5" /></Icon>; }
function ImageIcon() { return <Icon><rect x="2.5" y="3.5" width="13" height="11" rx="2" /><circle cx="6.5" cy="7.5" r="1.3" /><path d="M15.5 12l-4-3.5-6 6" /></Icon>; }
function GamepadIcon() { return <Icon><rect x="2" y="5" width="14" height="8.5" rx="4.25" /><path d="M6 7.5v3.5M4.25 9.25h3.5" /><path d="M12 8.3v.1M13.3 10.3v.1" /></Icon>; }
function CheckIcon() { return <Icon size={16}><path d="M3.5 9.5l3.5 3.5 7.5-8" /></Icon>; }
function FullscreenIcon() { return <Icon size={16}><path d="M2.5 6.5v-4h4M11.5 2.5h4v4M15.5 11.5v4h-4M6.5 15.5h-4v-4" /></Icon>; }
function GearIcon() { return <Icon size={17}><path d="M7.6 2h2.8l.4 2 1.4.8 1.9-.7 1.4 2.4-1.5 1.3v1.6l1.5 1.3-1.4 2.4-1.9-.7-1.4.8-.4 2H7.6l-.4-2-1.4-.8-1.9.7-1.4-2.4 1.5-1.3V8.2L2.5 6.9l1.4-2.4 1.9.7 1.4-.8z" /><circle cx="9" cy="9" r="2.3" /></Icon>; }
function KeyIcon() { return <Icon size={17}><circle cx="6" cy="11.5" r="3" /><path d="M8.2 9.3L14.5 3M12 5.5l2 2M10.5 7l1.5 1.5" /></Icon>; }
function LogoutIcon() { return <Icon size={17}><path d="M7 15H3.5V3H7M11.5 12.5L15 9l-3.5-3.5M15 9H7" /></Icon>; }
function LoginIcon() { return <Icon size={17}><path d="M11 3h3.5v12H11M6.5 5.5L10 9l-3.5 3.5M10 9H2.5" /></Icon>; }
function ChevronRightIcon() { return <Icon size={14}><path d="M7 4.5L11.5 9 7 13.5" /></Icon>; }
function ChevronUpIcon() { return <Icon size={14}><path d="M4.5 11L9 6.5l4.5 4.5" /></Icon>; }
function MonitorIcon() { return <Icon size={15}><rect x="2.5" y="3" width="13" height="9" rx="1.5" /><path d="M6.5 15h5M9 12v3" /></Icon>; }
function SunIcon() { return <Icon size={15}><circle cx="9" cy="9" r="3" /><path d="M9 2v1.5M9 14.5V16M2 9h1.5M14.5 9H16M4 4l1 1M13 13l1 1M4 14l1-1M13 5l1-1" /></Icon>; }
function MoonIcon() { return <Icon size={15}><path d="M14.5 11A6 6 0 0 1 7 3.5a6 6 0 1 0 7.5 7.5z" /></Icon>; }
function PlayIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2.8v10.4l8.2-5.2z" fill="currentColor" /></svg>; }
