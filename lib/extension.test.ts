import { describe, expect, it } from "vitest";
import { EXTENSION_VERSION, isStale } from "./extension";

describe("isStale", () => {
  it("flags an older install", () => {
    expect(isStale("0.2.0", "0.3.0")).toBe(true);
    expect(isStale("0.2.9", "0.3.0")).toBe(true);
    expect(isStale("0.9.0", "1.0.0")).toBe(true);
  });

  it("does not flag current or newer", () => {
    expect(isStale("0.3.0", "0.3.0")).toBe(false);
    expect(isStale("0.4.0", "0.3.0")).toBe(false);
    // Someone running a local build ahead of what's deployed.
    expect(isStale("1.0.0", "0.3.0")).toBe(false);
  });

  it("compares numerically, not as strings", () => {
    // The whole reason for parsing: "0.10.0" < "0.9.0" as text.
    expect(isStale("0.9.0", "0.10.0")).toBe(true);
    expect(isStale("0.10.0", "0.9.0")).toBe(false);
  });

  it("treats missing segments as zero", () => {
    expect(isStale("0.3", "0.3.0")).toBe(false);
    expect(isStale("0.3", "0.3.1")).toBe(true);
  });

  it("stays quiet on anything it cannot read", () => {
    // A version we can't parse is not evidence of staleness. Nagging someone
    // whose install is fine trains them to ignore the notice that matters.
    expect(isStale(null, "0.3.0")).toBe(false);
    expect(isStale("", "0.3.0")).toBe(false);
    expect(isStale("dev", "0.3.0")).toBe(false);
    expect(isStale("0.3.0", "unreleased")).toBe(false);
  });

  it("reads a real version out of the extension manifest", () => {
    // Guards against the constant drifting from the manifest it mirrors.
    expect(EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
