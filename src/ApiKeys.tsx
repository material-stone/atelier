import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { AuthState } from "./types";
import { approveCliLogin, createApiKey, describeCliLogin, listApiKeys, revokeApiKey, signInWithGoogle, type ApiKeyInfo } from "./lib/services";

type Notify = (message: string) => void;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
function formatDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : "없음";
}

/** Settings panel for upload API keys: issue one (shown once), see where keys are used, revoke them. */
export function ApiKeySettings({ onNotify }: { onNotify: Notify }) {
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ key: string; label: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys(await listApiKeys());
    } catch (error) {
      onNotify(errorMessage(error, "키 목록을 불러오지 못했어요."));
      setKeys([]);
    }
  }, [onNotify]);

  useEffect(() => { void load(); }, [load]);

  async function issue(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      setIssued(await createApiKey(label.trim()));
      setLabel("");
      await load();
    } catch (error) {
      onNotify(errorMessage(error, "키를 발급하지 못했어요."));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKeyInfo) {
    if (!window.confirm(`"${key.label}" 키를 폐기할까요? 이 키를 쓰는 기기는 바로 업로드할 수 없게 돼요.`)) return;
    try {
      await revokeApiKey(key.id);
      onNotify("키를 폐기했어요.");
      await load();
    } catch (error) {
      onNotify(errorMessage(error, "키를 폐기하지 못했어요."));
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      onNotify("키를 복사했어요.");
    } catch {
      onNotify("복사하지 못했어요. 직접 선택해서 복사해 주세요.");
    }
  }

  const active = keys?.filter((key) => !key.revokedAt) ?? [];
  const revoked = keys?.filter((key) => key.revokedAt) ?? [];

  return (
    <>
      <div className="setting-row">
        <div className="setting-copy">
          <strong>CLI로 로그인</strong>
          <p>터미널에서 <code className="inline-code">atelier-cli login</code>을 실행하고 열린 페이지에서 승인하면, 키를 복사하지 않아도 그 기기에 저장돼요.</p>
        </div>
      </div>
      <form className="setting-row" onSubmit={issue}>
        <div className="setting-copy">
          <strong>직접 발급</strong>
          <p>스크립트나 CI처럼 로그인할 수 없는 곳에 쓸 키예요. 발급 직후 한 번만 보여요.</p>
          <input className="setting-input" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="키 이름 (예: 작업용 노트북)" maxLength={60} aria-label="키 이름" />
        </div>
        <button className="button button-quiet small" type="submit" disabled={busy}>{busy ? "발급 중…" : "새 키 발급"}</button>
      </form>
      {issued ? (
        <div className="setting-row key-reveal">
          <div className="setting-copy">
            <strong>{issued.label} <span className="status-badge is-on">새 키</span></strong>
            <p>지금 복사해 두세요. 서버에는 키 원문을 저장하지 않아서 다시 볼 수 없어요. 키는 관리자 권한과 같으니 공유하지 마세요.</p>
            <code className="key-value">{issued.key}</code>
          </div>
          <div className="key-actions">
            <button className="button button-primary small" type="button" onClick={() => void copy(issued.key)}>복사</button>
            <button className="button button-quiet small" type="button" onClick={() => setIssued(null)}>숨기기</button>
          </div>
        </div>
      ) : null}
      {keys === null ? <div className="setting-row"><p className="field-hint">키 목록을 불러오는 중…</p></div> : null}
      {keys && !active.length ? <div className="setting-row"><div className="setting-copy"><strong>사용 중인 키가 없어요</strong><p>업로드 API를 쓰려면 CLI로 로그인하거나 키를 발급하세요.</p></div></div> : null}
      {active.map((key) => (
        <div className="setting-row" key={key.id}>
          <div className="setting-copy">
            <strong>{key.label} <span className="status-badge">{key.source === "cli" ? "CLI 로그인" : "직접 발급"}</span></strong>
            <p><code className="inline-code">{key.preview}…</code> · 발급 {formatDate(key.createdAt)} · 마지막 사용 {formatDate(key.lastUsedAt)}</p>
          </div>
          <button className="button button-danger small" type="button" onClick={() => void revoke(key)}>폐기</button>
        </div>
      ))}
      {revoked.length ? (
        <details className="setting-row revoked-keys">
          <summary>폐기한 키 {revoked.length}개</summary>
          {revoked.map((key) => <p key={key.id}><code className="inline-code">{key.preview}…</code> {key.label} · 폐기 {formatDate(key.revokedAt)}</p>)}
        </details>
      ) : null}
    </>
  );
}

type LoginStep = { kind: "enter" } | { kind: "loading" } | { kind: "confirm"; userCode: string; label: string } | { kind: "done"; approved: boolean; label: string } | { kind: "error"; message: string };

/** /cli-login?code=XXXX-XXXX — an admin confirms the code the terminal shows, and the CLI receives its key. */
export function CliLoginPage({ auth, onNotify }: { auth: AuthState; onNotify: Notify }) {
  const [params, setParams] = useSearchParams();
  const code = params.get("code") ?? "";
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState<LoginStep>({ kind: code ? "loading" : "enter" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code || !auth.isAdmin) return;
    let cancelled = false;
    setStep({ kind: "loading" });
    describeCliLogin(code)
      .then((login) => { if (!cancelled) setStep({ kind: "confirm", userCode: login.userCode, label: login.label }); })
      .catch((error) => { if (!cancelled) setStep({ kind: "error", message: errorMessage(error, "로그인 요청을 확인하지 못했어요.") }); });
    return () => { cancelled = true; };
  }, [code, auth.isAdmin]);

  async function decide(approve: boolean) {
    if (step.kind !== "confirm") return;
    setBusy(true);
    try {
      const result = await approveCliLogin(step.userCode, approve);
      setStep({ kind: "done", approved: approve, label: result.label });
    } catch (error) {
      setStep({ kind: "error", message: errorMessage(error, "처리하지 못했어요.") });
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    try {
      await signInWithGoogle();
    } catch (error) {
      onNotify(errorMessage(error, "로그인에 실패했습니다."));
    }
  }

  if (auth.loading) return <div className="center-state"><span className="state-symbol">✳</span><p>로그인 상태를 확인하는 중…</p></div>;
  if (!auth.user) {
    return <div className="center-state"><span className="state-symbol">✳</span><h1>CLI 로그인</h1><p>터미널의 atelier-cli를 승인하려면 관리자 Google 계정으로 로그인하세요.</p><button className="button button-primary" type="button" onClick={() => void signIn()}>Google로 로그인</button></div>;
  }
  if (!auth.isAdmin) return <div className="center-state"><span className="state-symbol">✳</span><h1>권한이 없어요</h1><p>이 Google 계정에는 Atelier 관리자 권한이 없어 업로드 키를 승인할 수 없어요.</p><Link className="button button-primary" to="/">홈으로</Link></div>;

  if (step.kind === "enter") {
    return (
      <form className="center-state cli-login" onSubmit={(event) => { event.preventDefault(); setParams({ code: typed.trim() }); }}>
        <span className="state-symbol">✳</span>
        <h1>CLI 로그인</h1>
        <p>터미널에 표시된 코드를 입력하세요.</p>
        <input className="setting-input code-input" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="XXXX-XXXX" maxLength={9} autoFocus aria-label="로그인 코드" />
        <button className="button button-primary" type="submit" disabled={typed.replace(/[^A-Za-z0-9]/g, "").length !== 8}>다음</button>
      </form>
    );
  }
  if (step.kind === "loading") return <div className="center-state"><span className="state-symbol">✳</span><p>로그인 요청을 확인하는 중…</p></div>;
  if (step.kind === "error") {
    return <div className="center-state"><span className="state-symbol">✳</span><h1>승인할 수 없어요</h1><p>{step.message}</p><button className="button button-quiet" type="button" onClick={() => { setTyped(""); setParams({}); setStep({ kind: "enter" }); }}>코드 다시 입력</button></div>;
  }
  if (step.kind === "done") {
    return step.approved
      ? <div className="center-state"><span className="state-symbol">✳</span><h1>승인했어요</h1><p>터미널로 돌아가세요. <b>{step.label}</b>에 업로드 키가 저장됩니다. 이 창은 닫아도 돼요.</p></div>
      : <div className="center-state"><span className="state-symbol">✳</span><h1>거절했어요</h1><p>이 로그인 요청은 키를 받지 못합니다. 이 창은 닫아도 돼요.</p></div>;
  }
  return (
    <div className="center-state cli-login">
      <span className="state-symbol">✳</span>
      <h1>이 기기에 업로드 권한을 줄까요?</h1>
      <p className="code-display" aria-label="로그인 코드">{step.userCode}</p>
      <p><b>{step.label}</b>에서 요청했어요. 터미널에 보이는 코드와 <b>정확히 같을 때만</b> 승인하세요. 승인하면 이 기기가 관리자 권한으로 게임을 올릴 수 있어요.</p>
      <div className="key-actions">
        <button className="button button-primary" type="button" onClick={() => void decide(true)} disabled={busy}>승인</button>
        <button className="button button-quiet" type="button" onClick={() => void decide(false)} disabled={busy}>거절</button>
      </div>
    </div>
  );
}
