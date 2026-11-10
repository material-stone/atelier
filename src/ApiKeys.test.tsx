import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "./types";

const services = vi.hoisted(() => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  describeCliLogin: vi.fn(),
  approveCliLogin: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock("./lib/services", () => services);

const { ApiKeySettings, CliLoginPage } = await import("./ApiKeys");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const admin = { user: { uid: "u1" }, profile: null, isAdmin: true, isSubscriber: false, isMember: false, loading: false } as unknown as AuthState;
const visitor = { ...admin, isAdmin: false } as AuthState;
const signedOut = { ...admin, user: null, isAdmin: false } as AuthState;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function render(element: React.ReactElement) {
  await act(async () => root.render(element));
}

async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`no button "${text}" in: ${container.textContent}`);
  await act(async () => button.click());
}

describe("CliLoginPage", () => {
  const page = (auth: AuthState, path = "/cli-login?code=BX4K-9TQM") => (
    <MemoryRouter initialEntries={[path]}><CliLoginPage auth={auth} onNotify={vi.fn()} /></MemoryRouter>
  );

  it("asks a signed-out visitor to sign in with Google and does not look up the code", async () => {
    await render(page(signedOut));
    expect(container.textContent).toContain("Google로 로그인");
    expect(services.describeCliLogin).not.toHaveBeenCalled();
  });

  it("refuses accounts without the admin claim", async () => {
    await render(page(visitor));
    expect(container.textContent).toContain("권한이 없어요");
    expect(services.describeCliLogin).not.toHaveBeenCalled();
  });

  it("shows the code and the requesting machine, then approves", async () => {
    services.describeCliLogin.mockResolvedValue({ userCode: "BX4K-9TQM", label: "작업용 노트북", expiresAt: new Date().toISOString() });
    services.approveCliLogin.mockResolvedValue({ ok: true, label: "작업용 노트북" });
    await render(page(admin));
    expect(services.describeCliLogin).toHaveBeenCalledWith("BX4K-9TQM");
    expect(container.textContent).toContain("BX4K-9TQM");
    expect(container.textContent).toContain("작업용 노트북");
    await click("승인");
    expect(services.approveCliLogin).toHaveBeenCalledWith("BX4K-9TQM", true);
    expect(container.textContent).toContain("승인했어요");
  });

  it("can deny the request", async () => {
    services.describeCliLogin.mockResolvedValue({ userCode: "BX4K-9TQM", label: "모르는 기기", expiresAt: new Date().toISOString() });
    services.approveCliLogin.mockResolvedValue({ ok: true, label: "모르는 기기" });
    await render(page(admin));
    await click("거절");
    expect(services.approveCliLogin).toHaveBeenCalledWith("BX4K-9TQM", false);
    expect(container.textContent).toContain("거절했어요");
  });

  it("explains an expired or unknown code", async () => {
    services.describeCliLogin.mockRejectedValue(new Error("코드가 없거나 만료되었습니다."));
    await render(page(admin));
    expect(container.textContent).toContain("코드가 없거나 만료되었습니다.");
  });

  it("asks for the code when the link has none", async () => {
    await render(page(admin, "/cli-login"));
    expect(container.querySelector("input[aria-label='로그인 코드']")).not.toBeNull();
    expect(services.describeCliLogin).not.toHaveBeenCalled();
  });
});

describe("ApiKeySettings", () => {
  const keys = [
    { id: "a".repeat(64), label: "노트북", preview: "atl_AbCd", source: "cli", createdAt: "2026-11-10T00:00:00Z", lastUsedAt: null, revokedAt: null },
    { id: "b".repeat(64), label: "옛 키", preview: "atl_Old1", source: "settings", createdAt: "2026-11-01T00:00:00Z", lastUsedAt: null, revokedAt: "2026-11-05T00:00:00Z" },
  ];

  it("lists active keys by preview only and folds revoked ones away", async () => {
    services.listApiKeys.mockResolvedValue(keys);
    await render(<ApiKeySettings onNotify={vi.fn()} />);
    expect(container.textContent).toContain("노트북");
    expect(container.textContent).toContain("atl_AbCd…");
    expect(container.textContent).toContain("폐기한 키 1개");
  });

  it("shows a newly issued key once and hides it on request", async () => {
    services.listApiKeys.mockResolvedValue([]);
    services.createApiKey.mockResolvedValue({ key: "atl_secret-value", label: "CI" });
    await render(<ApiKeySettings onNotify={vi.fn()} />);
    await click("새 키 발급");
    expect(container.querySelector(".key-value")?.textContent).toBe("atl_secret-value");
    await click("숨기기");
    expect(container.textContent).not.toContain("atl_secret-value");
  });

  it("revokes only after confirmation", async () => {
    services.listApiKeys.mockResolvedValue(keys);
    services.revokeApiKey.mockResolvedValue({ ok: true });
    await render(<ApiKeySettings onNotify={vi.fn()} />);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await click("폐기");
    expect(services.revokeApiKey).not.toHaveBeenCalled();
    await click("폐기");
    expect(services.revokeApiKey).toHaveBeenCalledWith("a".repeat(64));
    confirm.mockRestore();
  });
});
