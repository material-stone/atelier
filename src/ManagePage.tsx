import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { AccessLevel, Game, StorageReport } from "./types";
import { accessShortLabel, parseEmailList } from "./lib/access";
import { filterGames } from "./lib/search";
import {
  createOrUpdateGameDraft,
  deleteGame,
  deleteStorageOrphans,
  findGameByTitle,
  getGameAllowlist,
  getStorageReport,
  subscribeToAllGames,
  updateGameMeta,
  uploadFile,
} from "./lib/services";
import { MAX_BUILD_BYTES, normalizeTitle, validateBuild, validateImage } from "./lib/validation";

type Notify = (message: string) => void;
type Tab = "games" | "new" | "storage";

const TABS: { id: Tab; label: string }[] = [
  { id: "games", label: "게임 목록" },
  { id: "new", label: "게임 추가" },
  { id: "storage", label: "저장 공간" },
];

const ACCESS_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "public", label: "공개 — 누구나" },
  { value: "login", label: "로그인 데모 — Google 로그인" },
  { value: "subscriber", label: "구독자 프로토타입 — YouTube 구독자 (주간 무료 로테이션 대상)" },
  { value: "member", label: "멤버 얼리 액세스 — 채널 멤버" },
  { value: "private", label: "초대 — 초대한 이메일만" },
];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function splitGenres(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function buildStatusLabel(game: Game): string {
  if (game.pendingVersionId) return "새 빌드 처리 중";
  if (game.buildStatus === "published") return "공개됨";
  if (game.buildStatus === "processing") return "빌드 처리 중";
  return "빌드 실패";
}

/** The admin room: every game with live search, add, edit (text, cover, build) and delete, plus storage. */
export function ManagePage({ onNotify }: { onNotify: Notify }) {
  const [tab, setTab] = useState<Tab>("games");
  const [games, setGames] = useState<Game[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => subscribeToAllGames(setGames), []);
  const editing = games.find((game) => game.id === editingId) ?? null;

  function openTab(next: Tab) {
    setTab(next);
    setEditingId(null);
  }

  async function remove(game: Game) {
    if (!window.confirm(`"${game.title}"을(를) 삭제할까요? 빌드, 커버 이미지, 댓글, 좋아요 기록이 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    try {
      await deleteGame(game.id);
      if (editingId === game.id) setEditingId(null);
      onNotify(`${game.title}을(를) 삭제했습니다.`);
    } catch (error) {
      onNotify(errorMessage(error, "게임을 삭제하지 못했습니다."));
    }
  }

  return (
    <div className="manage-page">
      <header className="page-bar">
        <h1>관리</h1>
        <div className="segmented" role="group" aria-label="관리 항목">
          {TABS.map((item) => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => openTab(item.id)}>{item.label}</button>)}
        </div>
      </header>
      {tab === "games" && editing ? <GameEditor key={editing.id} game={editing} onBack={() => setEditingId(null)} onDelete={() => remove(editing)} onNotify={onNotify} /> : null}
      {tab === "games" && !editing ? <GameList games={games} onEdit={setEditingId} onDelete={remove} onAdd={() => openTab("new")} /> : null}
      {tab === "new" ? <NewGameForm onDone={() => openTab("games")} onNotify={onNotify} /> : null}
      {tab === "storage" ? <StoragePanel onNotify={onNotify} /> : null}
    </div>
  );
}

/* ---------- List ---------- */

function GameList({ games, onEdit, onDelete, onAdd }: { games: Game[]; onEdit: (id: string) => void; onDelete: (game: Game) => void; onAdd: () => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterGames(games, query), [games, query]);
  return (
    <section className="manage-list-view" aria-label="게임 목록">
      <div className="manage-toolbar">
        <form className="search-field" role="search" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="manage-search" className="sr-only">게임 찾기</label>
          <SearchIcon />
          <input id="manage-search" type="text" inputMode="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="게임 이름이나 #장르 태그로 찾기" />
          {query ? <button className="search-clear" type="button" onClick={() => setQuery("")} aria-label="검색어 지우기">×</button> : null}
        </form>
        <button className="button button-primary" type="button" onClick={onAdd}>+ 게임 추가</button>
      </div>
      <p className="result-count" aria-live="polite">{query.trim() ? `검색 결과 ${results.length}개` : `전체 게임 ${games.length}개`}</p>
      {results.length ? (
        <ul className="manage-items">
          {results.map((game) => (
            <li key={game.id} className="manage-item">
              <button className="manage-item-main" type="button" onClick={() => onEdit(game.id)} aria-label={`${game.title} 수정`}>
                <span className="manage-thumb" style={game.coverUrl ? { backgroundImage: `url(${game.coverUrl})` } : undefined} aria-hidden="true" />
                <span className="manage-item-copy">
                  <strong>{game.title}</strong>
                  <span>{accessShortLabel(game.accessLevel)} · {buildStatusLabel(game)}{game.genres.length ? ` · ${game.genres.map((genre) => `#${genre}`).join(" ")}` : ""}</span>
                  {game.buildError ? <span className="manage-error">빌드 오류: {game.buildError}</span> : null}
                </span>
                <ChevronRightIcon />
              </button>
              <button className="round-button quiet manage-delete" type="button" onClick={() => onDelete(game)} aria-label={`${game.title} 삭제`} title="삭제"><TrashIcon /></button>
            </li>
          ))}
        </ul>
      ) : <p className="empty-box">{games.length ? "맞는 게임이 없어요." : "등록된 게임이 없어요."}</p>}
    </section>
  );
}

/* ---------- Shared form pieces ---------- */

interface MetaState {
  title: string;
  description: string;
  genres: string;
  accessLevel: AccessLevel;
  allowedEmails: string;
}

function MetaFields({ value, onChange, idPrefix, extra }: { value: MetaState; onChange: (next: MetaState) => void; idPrefix: string; extra?: ReactNode }) {
  const set = <K extends keyof MetaState>(key: K, next: MetaState[K]) => onChange({ ...value, [key]: next });
  return (
    <div className="manage-fields">
      <div className="field-group">
        <label htmlFor={`${idPrefix}-title`}>게임 이름</label>
        <input id={`${idPrefix}-title`} value={value.title} onChange={(event) => set("title", event.target.value)} placeholder="예: Ember Archive" maxLength={80} />
        {extra}
      </div>
      <div className="field-group">
        <label htmlFor={`${idPrefix}-description`}>설명</label>
        <textarea id={`${idPrefix}-description`} value={value.description} onChange={(event) => set("description", event.target.value)} placeholder={"게임 소개와 조작법\n예: 조작: 방향키로 이동"} maxLength={500} />
        <span className="field-hint">줄바꿈이 그대로 보여요. 조작법은 여기에 적어 주세요.</span>
      </div>
      <div className="field-group">
        <label htmlFor={`${idPrefix}-genres`}>장르 태그</label>
        <input id={`${idPrefix}-genres`} value={value.genres} onChange={(event) => set("genres", event.target.value)} placeholder="아케이드, 퍼즐, 캐주얼" />
        <span className="field-hint">쉼표로 구분해 최대 8개. 홈의 장르 태그 검색에 쓰여요.</span>
      </div>
      <div className="field-group">
        <label htmlFor={`${idPrefix}-access`}>공개 범위</label>
        <select id={`${idPrefix}-access`} value={value.accessLevel} onChange={(event) => set("accessLevel", event.target.value as AccessLevel)}>
          {ACCESS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {value.accessLevel === "private" ? (
          <>
            <label htmlFor={`${idPrefix}-emails`}>초대할 이메일</label>
            <textarea id={`${idPrefix}-emails`} value={value.allowedEmails} onChange={(event) => set("allowedEmails", event.target.value)} placeholder={"friend@gmail.com\ntester@example.com"} />
            <span className="field-hint">쉼표나 줄바꿈으로 구분해요. 이 Google 계정으로 로그인한 사람과 관리자에게만 보여요.</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** A file picker shown as a drop-style box; `current` describes what is there now. */
function FileField({ id, label, accept, file, onFile, hint, current }: { id: string; label: string; accept: string; file: File | null; onFile: (file: File | null) => void; hint: string; current?: ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="field-group">
      <span className="field-label" id={`${id}-label`}>{label}</span>
      {current}
      <label className="drop-field" htmlFor={id}>
        <span>{file ? file.name : "파일 선택"}</span>
        <small>{hint}</small>
        <input ref={inputRef} id={id} type="file" accept={accept} aria-labelledby={`${id}-label`} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
      </label>
      {file ? <button className="text-button" type="button" onClick={() => { onFile(null); if (inputRef.current) inputRef.current.value = ""; }}>선택 취소</button> : null}
    </div>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function checkMeta(meta: MetaState): { error: string } | { emails?: string[] } {
  if (!meta.title.trim()) return { error: "게임 이름을 입력해 주세요." };
  const invitees = parseEmailList(meta.allowedEmails);
  if (meta.accessLevel === "private" && invitees.invalid.length) return { error: `이메일 형식을 확인해 주세요: ${invitees.invalid.join(", ")}` };
  return { emails: meta.accessLevel === "private" ? invitees.emails : undefined };
}

/* ---------- Edit ---------- */

function GameEditor({ game, onBack, onDelete, onNotify }: { game: Game; onBack: () => void; onDelete: () => void; onNotify: Notify }) {
  const [meta, setMeta] = useState<MetaState>({ title: game.title, description: game.description, genres: game.genres.join(", "), accessLevel: game.accessLevel, allowedEmails: "" });
  const [cover, setCover] = useState<File | null>(null);
  const [build, setBuild] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const coverPreview = useObjectUrl(cover);

  useEffect(() => {
    if (game.accessLevel !== "private") return;
    let alive = true;
    getGameAllowlist(game.id)
      .then((emails) => { if (alive) setMeta((current) => ({ ...current, allowedEmails: emails.join("\n") })); })
      .catch((error) => onNotify(errorMessage(error, "초대 이메일 목록을 불러오지 못했습니다.")));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const checked = checkMeta(meta);
    if ("error" in checked) return onNotify(checked.error);
    if (cover) { const error = validateImage(cover); if (error) return onNotify(error); }
    if (build) { const error = validateBuild(build); if (error) return onNotify(error); }
    const fields = { title: meta.title.trim(), description: meta.description.trim(), genres: splitGenres(meta.genres), accessLevel: meta.accessLevel, allowedEmails: checked.emails };
    setSaving(true);
    try {
      // Text first: it also rejects a title another game already uses.
      setProgress("게임 정보 저장 중…");
      await updateGameMeta({ gameId: game.id, ...fields });
      let coverPath = `game-covers/${game.id}/cover`;
      let buildPath: string | null = null;
      if (build) {
        // Registers the upload as a pending version; the current build stays playable until it is processed.
        const draft = await createOrUpdateGameDraft({ ...fields, existingGameId: game.id });
        coverPath = draft.coverPath;
        buildPath = draft.buildPath;
      }
      if (cover) {
        setProgress("커버 이미지 업로드 중… 0%");
        await uploadFile(coverPath, cover, (value) => setProgress(`커버 이미지 업로드 중… ${Math.round(value * 100)}%`));
      }
      if (build && buildPath) {
        setProgress("빌드 업로드 중… 0%");
        await uploadFile(buildPath, build, (value) => setProgress(`빌드 업로드 중… ${Math.round(value * 100)}%`));
      }
      setCover(null);
      setBuild(null);
      setProgress("");
      onNotify(build ? "저장했어요. 새 빌드는 서버에서 검사한 뒤 바뀌어요." : "저장했어요.");
    } catch (error) {
      setProgress("");
      onNotify(errorMessage(error, "저장하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  const coverUrl = coverPreview ?? game.coverUrl;
  return (
    <section className="manage-editor-view" aria-labelledby="editor-title">
      <div className="editor-head">
        <button className="round-button quiet editor-back" type="button" onClick={onBack} aria-label="게임 목록으로" title="게임 목록으로"><ChevronLeftIcon /></button>
        <h2 id="editor-title">{game.title}</h2>
      </div>
      <form className="editor-grid" onSubmit={save}>
        <MetaFields value={meta} onChange={setMeta} idPrefix="edit" />
        <div className="manage-fields">
          <FileField id="edit-cover" label="커버 이미지" accept="image/jpeg,image/png,image/webp" file={cover} onFile={setCover} hint="JPG · PNG · WebP, 최대 5MB"
            current={<span className="cover-preview" style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}>{coverUrl ? null : "커버 없음"}{cover ? <em>새 이미지</em> : null}</span>} />
          <FileField id="edit-build" label="게임 빌드" accept=".zip,application/zip" file={build} onFile={setBuild} hint={`ZIP, 최대 ${Math.round(MAX_BUILD_BYTES / 1024 / 1024)}MiB · 루트에 index.html`}
            current={<span className="build-state"><span className={`status-badge${game.buildStatus === "published" && !game.pendingVersionId ? " is-on" : ""}`}>{buildStatusLabel(game)}</span>{game.buildError ? <span className="manage-error">{game.buildError}</span> : <span>새 ZIP을 올리면 검사가 끝날 때까지 지금 빌드가 계속 열려요.</span>}</span>} />
        </div>
        <div className="editor-actions">
          {progress ? <p className="upload-status"><span className="spinner-dot" />{progress}</p> : null}
          <button className="button button-danger" type="button" onClick={onDelete} disabled={saving}>삭제</button>
          <button className="button button-quiet" type="button" onClick={onBack} disabled={saving}>취소</button>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
        </div>
      </form>
    </section>
  );
}

/* ---------- Add ---------- */

const EMPTY_META: MetaState = { title: "", description: "", genres: "", accessLevel: "public", allowedEmails: "" };

function NewGameForm({ onDone, onNotify }: { onDone: () => void; onNotify: Notify }) {
  const [meta, setMeta] = useState<MetaState>(EMPTY_META);
  const [cover, setCover] = useState<File | null>(null);
  const [build, setBuild] = useState<File | null>(null);
  const [existing, setExisting] = useState<Game | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const coverPreview = useObjectUrl(cover);

  useEffect(() => {
    if (!meta.title.trim()) return setExisting(null);
    const timer = window.setTimeout(() => {
      findGameByTitle(normalizeTitle(meta.title)).then(setExisting).catch(() => setExisting(null));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [meta.title]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = checkMeta(meta);
    if ("error" in checked) return onNotify(checked.error);
    if (!cover) return onNotify("커버 이미지를 선택해 주세요.");
    if (!build) return onNotify("게임 빌드 ZIP을 선택해 주세요.");
    const coverError = validateImage(cover);
    if (coverError) return onNotify(coverError);
    const buildError = validateBuild(build);
    if (buildError) return onNotify(buildError);
    setSaving(true);
    try {
      setProgress("업로드 준비 중…");
      const draft = await createOrUpdateGameDraft({ title: meta.title.trim(), description: meta.description.trim(), genres: splitGenres(meta.genres), accessLevel: meta.accessLevel, allowedEmails: checked.emails, existingGameId: existing?.id });
      await uploadFile(draft.coverPath, cover, (value) => setProgress(`커버 이미지 업로드 중… ${Math.round(value * 100)}%`));
      await uploadFile(draft.buildPath, build, (value) => setProgress(`빌드 업로드 중… ${Math.round(value * 100)}%`));
      onNotify("업로드했어요. 서버에서 ZIP을 검사한 뒤 공개돼요.");
      onDone();
    } catch (error) {
      setProgress("");
      onNotify(errorMessage(error, "업로드하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="manage-editor-view" aria-label="게임 추가">
      <form className="editor-grid" onSubmit={submit}>
        <MetaFields value={meta} onChange={setMeta} idPrefix="new"
          extra={existing ? <div className="duplicate-alert"><strong>같은 이름의 게임이 있어요</strong><p><b>{existing.title}</b>의 새 빌드로 올라가요. 좋아요와 댓글은 유지돼요.</p></div> : null} />
        <div className="manage-fields">
          <FileField id="new-cover" label="커버 이미지" accept="image/jpeg,image/png,image/webp" file={cover} onFile={setCover} hint="JPG · PNG · WebP, 최대 5MB"
            current={coverPreview ? <span className="cover-preview" style={{ backgroundImage: `url(${coverPreview})` }} /> : null} />
          <FileField id="new-build" label="게임 빌드" accept=".zip,application/zip" file={build} onFile={setBuild} hint={`ZIP, 최대 ${Math.round(MAX_BUILD_BYTES / 1024 / 1024)}MiB · 루트에 index.html`} />
          <div className="aside-note">
            <span className="eyebrow">업로드 체크리스트</span>
            <ol><li>index.html은 ZIP 루트에 있어야 해요.</li><li>상대 경로로 연결된 웹빌드만 지원해요.</li><li>압축 해제 후 검사를 통과한 빌드만 공개돼요.</li></ol>
          </div>
        </div>
        <div className="editor-actions">
          {progress ? <p className="upload-status"><span className="spinner-dot" />{progress}</p> : null}
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? "업로드 중…" : existing ? "새 빌드로 업데이트" : "Atelier에 올리기"}</button>
        </div>
      </form>
    </section>
  );
}

/* ---------- Storage ---------- */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function StoragePanel({ onNotify }: { onNotify: Notify }) {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setReport(await getStorageReport());
    } catch (error) {
      onNotify(errorMessage(error, "Storage 정보를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }

  async function cleanUp() {
    if (!report?.orphanedPaths.length) return;
    if (!window.confirm(`연결되지 않은 파일 ${report.orphanedPaths.length}개를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setLoading(true);
    try {
      const result = await deleteStorageOrphans(report.orphanedPaths);
      onNotify(`고아 파일 ${result.deleted}개를 삭제했습니다.`);
      setReport(await getStorageReport());
    } catch (error) {
      onNotify(errorMessage(error, "고아 파일을 정리하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="저장 공간">
      <div className="section-title-row"><div><h2>사용량과 정리</h2></div><button className="action-button" type="button" onClick={load} disabled={loading}>{loading ? "불러오는 중…" : report ? "새로고침" : "사용량 불러오기"}</button></div>
      {report ? (
        <div className="storage-report">
          <p className="storage-total"><strong>{formatBytes(report.totalBytes)}</strong> · 파일 {report.fileCount}개</p>
          {Object.entries(report.byPrefix).map(([prefix, value]) => <div className="mini-game" key={prefix}><span>{prefix}/</span><small>{formatBytes(value.bytes)} · {value.files}개</small></div>)}
          {report.gamesWithoutBuild.length ? <p className="manage-error">빌드 파일이 없는 공개 게임: {report.gamesWithoutBuild.join(", ")}</p> : null}
          <div className="orphan-box">
            <span className="eyebrow">연결되지 않은 파일 · {report.orphanedPaths.length}</span>
            {report.orphanedPaths.slice(0, 20).map((path) => <code key={path}>{path}</code>)}
            {report.orphanedPaths.length > 20 ? <small>외 {report.orphanedPaths.length - 20}개</small> : null}
            {report.orphanedPaths.length ? <button className="action-button danger" type="button" onClick={cleanUp} disabled={loading}>연결되지 않은 파일 삭제</button> : <small>정리할 파일이 없어요.</small>}
          </div>
        </div>
      ) : <p className="empty-note">Storage 사용량과 어느 게임에도 연결되지 않은 파일을 확인해요.</p>}
    </section>
  );
}

/* ---------- Icons ---------- */

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
function SearchIcon() { return <Icon><circle cx="8" cy="8" r="5" /><path d="M12 12l3.5 3.5" /></Icon>; }
function TrashIcon() { return <Icon size={17}><path d="M3 5h12M7 5V3.5h4V5M5 5l.8 10h6.4L13 5M7.5 8v4.5M10.5 8v4.5" /></Icon>; }
function ChevronLeftIcon() { return <Icon size={20}><path d="M11.5 4L6.5 9l5 5" /></Icon>; }
function ChevronRightIcon() { return <Icon size={16}><path d="M7 4.5L11.5 9 7 13.5" /></Icon>; }
