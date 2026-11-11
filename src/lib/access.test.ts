import { describe, expect, it } from "vitest";
import type { AuthState } from "../types";
import { accessPermission, defaultStage, normalizeAccessLevel, parseEmailList, rotationCount, weekIndex, weeklyRotationIds } from "./access";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const ids = Array.from({ length: 12 }, (_, index) => `game-${index}`);
const anonymous: AuthState = { user: null, profile: null, isAdmin: false, isSubscriber: false, isMember: false, loading: false };
const signedIn = { ...anonymous, user: {} as AuthState["user"] };

describe("weekly rotation", () => {
  it("opens 30% of the pool, at least one, and is stable within a KST week", () => {
    const monday = new Date("2026-11-16T00:00:00+09:00");
    const sunday = new Date("2026-11-22T23:59:00+09:00");
    const picked = weeklyRotationIds(ids, monday);
    expect(picked.size).toBe(4);
    expect([...weeklyRotationIds(ids, sunday)]).toEqual([...picked]);
    expect(weekIndex(sunday) + 1).toBe(weekIndex(new Date("2026-11-23T00:00:00+09:00")));
    expect(rotationCount(0)).toBe(0);
    expect(rotationCount(1)).toBe(1);
    expect(rotationCount(2)).toBe(1);
    expect(rotationCount(10)).toBe(3);
  });

  it("never repeats last week's games while the rest of the pool can fill the week", () => {
    const start = new Date("2026-11-09T12:00:00+09:00").getTime();
    for (let week = 0; week < 80; week += 1) {
      const thisWeek = weeklyRotationIds(ids, new Date(start + (week + 1) * WEEK));
      const lastWeek = weeklyRotationIds(ids, new Date(start + week * WEEK));
      expect([...thisWeek].filter((id) => lastWeek.has(id))).toEqual([]);
    }
  });

  it("repeats only what it must when the pool is small", () => {
    const small = ["a", "b", "c"];
    const first = weeklyRotationIds(small, new Date("2026-11-10T00:00:00+09:00"));
    const second = weeklyRotationIds(small, new Date("2026-11-17T00:00:00+09:00"));
    expect(first.size).toBe(1);
    expect(second.size).toBe(1);
    expect([...second][0]).not.toBe([...first][0]);
    expect([...weeklyRotationIds(["only"], new Date("2026-11-17T00:00:00+09:00"))]).toEqual(["only"]);
  });

  it("matches the server implementation", async () => {
    const server = await import("../../functions/src/access");
    for (let week = 0; week < 60; week += 1) {
      const date = new Date(Date.UTC(2026, 0, 1) + week * WEEK);
      expect([...weeklyRotationIds(ids, date)]).toEqual([...server.weeklyRotationIds(ids, date)]);
    }
  });

  it("does not depend on input order", () => {
    const date = new Date("2026-11-19T12:00:00+09:00");
    expect([...weeklyRotationIds([...ids].reverse(), date)].sort()).toEqual([...weeklyRotationIds(ids, date)].sort());
  });
});

describe("access permission", () => {
  const rotation = new Set(["free"]);
  const subscriber = { ...signedIn, isSubscriber: true };

  it("opens public games, demos included, to everyone", () => {
    expect(accessPermission({ id: "demo", accessLevel: "public" }, anonymous, rotation).allowed).toBe(true);
  });

  it("opens this week's member games to subscribers only", () => {
    const free = { id: "free", accessLevel: "member" as const };
    expect(accessPermission(free, anonymous, rotation)).toEqual({ allowed: false, reason: "login" });
    expect(accessPermission(free, signedIn, rotation)).toEqual({ allowed: false, reason: "subscriber" });
    expect(accessPermission(free, subscriber, rotation).allowed).toBe(true);
  });

  it("keeps the rest of the member games for members and admins", () => {
    const game = { id: "locked", accessLevel: "member" as const };
    expect(accessPermission(game, subscriber, rotation)).toEqual({ allowed: false, reason: "member" });
    expect(accessPermission(game, { ...signedIn, isMember: true }, rotation).allowed).toBe(true);
    expect(accessPermission(game, { ...signedIn, isAdmin: true }, rotation).allowed).toBe(true);
  });

  it("asks visitors to sign in before a private game", () => {
    const game = { id: "secret", accessLevel: "private" as const };
    expect(accessPermission(game, anonymous, rotation)).toEqual({ allowed: false, reason: "login" });
    expect(accessPermission(game, signedIn, rotation).allowed).toBe(true);
  });
});

describe("stage and legacy levels", () => {
  it("reads retired levels: login as a public demo, subscriber as a member prototype", async () => {
    const server = await import("../../functions/src/access");
    for (const impl of [{ normalizeAccessLevel, defaultStage }, server]) {
      expect(impl.normalizeAccessLevel("login")).toBe("public");
      expect(impl.normalizeAccessLevel("member")).toBe("member");
      expect(impl.normalizeAccessLevel("subscriber")).toBe("member");
      expect(impl.normalizeAccessLevel("nope")).toBeNull();
      expect(impl.defaultStage("login")).toBe("demo");
      expect(impl.defaultStage("subscriber")).toBe("prototype");
      expect(impl.defaultStage("public")).toBe("release");
    }
  });
});

describe("private game emails", () => {
  it("normalizes and splits the invite list", () => {
    expect(parseEmailList(" Friend@Gmail.com, tester@example.com\nfriend@gmail.com ; nope ")).toEqual({
      emails: ["friend@gmail.com", "tester@example.com"],
      invalid: ["nope"],
    });
  });

  it("agrees with the server on which emails are valid", async () => {
    const server = await import("../../functions/src/access");
    const { emails } = parseEmailList("a@b.co, Someone@Example.com");
    expect(server.normalizeEmailList(emails)).toEqual(emails);
    expect(server.normalizeEmailList(["not-an-email"])).toBeNull();
    expect(server.normalizeEmailList("a@b.co")).toBeNull();
  });
});
