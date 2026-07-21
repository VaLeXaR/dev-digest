import { describe, expect, it } from "vitest";
import { NAV } from "./nav";

describe("NAV", () => {
  const allItems = NAV.flatMap((group) => group.items);

  it("has exactly one Multi-Agent Review entry pointing at /multi-agent-review", () => {
    const matches = allItems.filter((item) => item.label === "Multi-Agent Review");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.href).toBe("/multi-agent-review");
    expect(matches[0]?.key).toBe("multi-agent-review");
  });

  it("does not add an Agent Performance entry", () => {
    const matches = allItems.filter((item) => item.label === "Agent Performance");
    expect(matches).toHaveLength(0);
  });
});
