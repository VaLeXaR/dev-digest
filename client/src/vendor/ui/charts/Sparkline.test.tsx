import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

afterEach(() => {
  cleanup();
});

describe("Sparkline", () => {
  it("R11.2: a single-point series renders a finite-position dot, never NaN", () => {
    const { container } = render(<Sparkline data={[0.82]} />);

    const circle = container.querySelector("circle");
    expect(circle).not.toBeNull();
    const cx = Number(circle!.getAttribute("cx"));
    const cy = Number(circle!.getAttribute("cy"));
    expect(Number.isNaN(cx)).toBe(false);
    expect(Number.isNaN(cy)).toBe(false);

    const path = container.querySelector("path");
    expect(path?.getAttribute("d") ?? "").not.toContain("NaN");
  });

  it("a two-point series still renders both a path and a terminal circle", () => {
    const { container } = render(<Sparkline data={[0.7, 0.8]} />);

    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path!.getAttribute("d") ?? "").not.toContain("NaN");

    const circle = container.querySelector("circle");
    expect(circle).not.toBeNull();
    const cx = Number(circle!.getAttribute("cx"));
    const cy = Number(circle!.getAttribute("cy"));
    expect(Number.isNaN(cx)).toBe(false);
    expect(Number.isNaN(cy)).toBe(false);
  });
});
