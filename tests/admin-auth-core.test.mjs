import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptAdminSecret,
  encryptAdminSecret,
  findMatchingTotpCounter,
  isAdminSessionSufficient,
  issueAdminSessionToken,
  safeEqualText,
  shouldRejectUnconfiguredTotpCode,
  verifyAdminSessionToken,
  verifyTotp,
} from "../lib/admin-auth-core.ts";
import { normalizeLocalRedirectPath } from "../lib/safe-redirect.ts";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const SESSION_KEY = "test-session-secret-that-is-long-and-random";

test("TOTP accepts the expected RFC HOTP value and rejects arbitrary six-digit input", () => {
  // Unix time 59 seconds uses counter 1. RFC 4226's 6-digit HOTP value for
  // counter 1 and the shared RFC test secret is 287082.
  assert.equal(verifyTotp("287082", RFC_SECRET, { nowMs: 59_000, window: 0 }), true);
  assert.equal(verifyTotp("123456", RFC_SECRET, { nowMs: 59_000, window: 0 }), false);
  assert.equal(verifyTotp("000000", RFC_SECRET, { nowMs: 59_000, window: 0 }), false);
  assert.equal(verifyTotp("28708", RFC_SECRET, { nowMs: 59_000, window: 0 }), false);
});

test("TOTP matching returns the exact counter needed for replay prevention", () => {
  assert.equal(findMatchingTotpCounter("287082", RFC_SECRET, { nowMs: 59_000, window: 0 }), 1);
  assert.equal(findMatchingTotpCounter("287082", RFC_SECRET, { nowMs: 89_000, window: 1 }), 1);
  assert.equal(findMatchingTotpCounter("287082", RFC_SECRET, { nowMs: 89_000, window: 0 }), null);
});

test("TOTP rejects malformed Base32 secrets instead of silently ignoring characters", () => {
  assert.equal(verifyTotp("287082", `${RFC_SECRET}!`, { nowMs: 59_000 }), false);
  assert.equal(verifyTotp("287082", "", { nowMs: 59_000 }), false);
});

test("a supplied OTP is never silently accepted before 2FA is configured", () => {
  assert.equal(shouldRejectUnconfiguredTotpCode("123456", false), true);
  assert.equal(shouldRejectUnconfiguredTotpCode(" 123456 ", false), true);
  assert.equal(shouldRejectUnconfiguredTotpCode("", false), false);
  assert.equal(shouldRejectUnconfiguredTotpCode("123456", true), false);
});

test("a primary admin identity alone cannot authorize when 2FA is enabled", () => {
  assert.equal(isAdminSessionSufficient(null, true), false);
  const primaryOnlyToken = issueAdminSessionToken(SESSION_KEY, {
    subject: "user:admin-id",
    mfa: false,
    nowMs: 1_000_000,
    ttlMs: 60_000,
    sessionId: "primary-only-session-id",
  });
  const claims = verifyAdminSessionToken(primaryOnlyToken, SESSION_KEY, 1_010_000);
  assert.ok(claims);
  assert.equal(isAdminSessionSufficient(claims, true), false);
  assert.equal(isAdminSessionSufficient(claims, false), true);
});

test("an MFA session authorizes while valid and fails after expiry", () => {
  const token = issueAdminSessionToken(SESSION_KEY, {
    subject: "password",
    mfa: true,
    nowMs: 2_000_000,
    ttlMs: 60_000,
    sessionId: "mfa-session-identifier",
  });
  const claims = verifyAdminSessionToken(token, SESSION_KEY, 2_030_000);
  assert.ok(claims);
  assert.equal(claims.mfa, true);
  assert.equal(isAdminSessionSufficient(claims, true), true);
  assert.equal(verifyAdminSessionToken(token, SESSION_KEY, 2_060_000), null);
});

test("admin session signature and signing key are enforced", () => {
  const token = issueAdminSessionToken(SESSION_KEY, {
    subject: "password",
    mfa: true,
    nowMs: 3_000_000,
    ttlMs: 60_000,
    sessionId: "signed-session-identifier",
  });
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.equal(verifyAdminSessionToken(tampered, SESSION_KEY, 3_001_000), null);
  assert.equal(verifyAdminSessionToken(token, "wrong-key", 3_001_000), null);
});

test("stored TOTP secrets use authenticated encryption", () => {
  const encrypted = encryptAdminSecret(RFC_SECRET, SESSION_KEY);
  assert.match(encrypted, /^enc\.v1\./);
  assert.equal(encrypted.includes(RFC_SECRET), false);
  assert.equal(decryptAdminSecret(encrypted, SESSION_KEY), RFC_SECRET);
  assert.equal(decryptAdminSecret(encrypted, "wrong-key"), null);

  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("a") ? "b" : "a"}`;
  assert.equal(decryptAdminSecret(tampered, SESSION_KEY), null);
});

test("constant-time text comparison helper preserves equality semantics", () => {
  assert.equal(safeEqualText("correct horse battery staple", "correct horse battery staple"), true);
  assert.equal(safeEqualText("correct horse battery staple", "wrong"), false);
});

test("authentication callbacks only redirect to local paths", () => {
  assert.equal(normalizeLocalRedirectPath("/account?tab=billing#current"), "/account?tab=billing#current");
  assert.equal(normalizeLocalRedirectPath("//evil.example/phish"), "/");
  assert.equal(normalizeLocalRedirectPath("/\\evil.example/phish"), "/");
  assert.equal(normalizeLocalRedirectPath("https://evil.example/phish"), "/");
  assert.equal(normalizeLocalRedirectPath("/account\nSet-Cookie:bad"), "/");
});
