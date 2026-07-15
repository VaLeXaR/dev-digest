import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OnThisPageNav } from "./OnThisPageNav";

let domContainer: HTMLDivElement | null = null;

afterEach(() => {
  cleanup();
  // Sections live outside the RTL-rendered tree (they stand in for
  // OnboardingView's SectionCard elements elsewhere on the page) — clean
  // them up manually so a stale id from a prior test isn't the first match
  // getElementById returns.
  domContainer?.remove();
  domContainer = null;
});

const SECTIONS = [
  { id: "architecture", label: "Architecture overview" },
  { id: "criticalPaths", label: "Critical paths" },
];

function renderSectionsInDom(tops: Record<string, number>) {
  const container = document.createElement("div");
  for (const [id, top] of Object.entries(tops)) {
    const el = document.createElement("div");
    el.id = id;
    el.getBoundingClientRect = () => ({ top } as DOMRect);
    container.appendChild(el);
  }
  document.body.appendChild(container);
  domContainer = container;
  return container;
}

describe("OnThisPageNav", () => {
  it("highlights the first section by default", () => {
    renderSectionsInDom({ architecture: 200, criticalPaths: 600 });
    render(<OnThisPageNav label="On this page" sections={SECTIONS} />);
    expect(screen.getByRole("button", { name: "Architecture overview" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("tracks scroll position — highlights the section nearest the viewport top", () => {
    renderSectionsInDom({ architecture: -400, criticalPaths: -20 });
    render(<OnThisPageNav label="On this page" sections={SECTIONS} />);

    // Scrolled down: "criticalPaths" has scrolled just above the top offset.
    fireEvent.scroll(window);

    expect(screen.getByRole("button", { name: "Critical paths" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Architecture overview" })).not.toHaveAttribute("aria-current");
  });

  it("highlights the last section once the scroll container bottoms out, even if its top never crossed the offset", () => {
    // Reproduces a live-verification finding: a short trailing section's top
    // can never cross the offset before the container maxes out its
    // scrollTop, so without an explicit "at bottom" check it never lights up.
    renderSectionsInDom({ architecture: -400, criticalPaths: 40 });

    const scrollParent = document.createElement("div");
    scrollParent.style.overflowY = "auto";
    Object.defineProperty(scrollParent, "scrollTop", { value: 500, configurable: true });
    Object.defineProperty(scrollParent, "clientHeight", { value: 600, configurable: true });
    Object.defineProperty(scrollParent, "scrollHeight", { value: 1100, configurable: true });
    document.body.appendChild(scrollParent);

    const { container } = render(<OnThisPageNav label="On this page" sections={SECTIONS} />, {
      container: scrollParent,
    });

    fireEvent.scroll(scrollParent);

    expect(screen.getByRole("button", { name: "Critical paths" })).toHaveAttribute("aria-current", "true");
    container.remove();
    scrollParent.remove();
  });

  it("clicking an entry scrolls to that section", () => {
    renderSectionsInDom({ architecture: 200, criticalPaths: 600 });
    const scrollSpy = vi.fn();
    const el = document.getElementById("criticalPaths")!;
    el.scrollIntoView = scrollSpy;

    render(<OnThisPageNav label="On this page" sections={SECTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Critical paths" }));

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
});
