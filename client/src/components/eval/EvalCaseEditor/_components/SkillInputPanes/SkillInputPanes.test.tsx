import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/eval.json";
import { SkillInputPanes, type SkillInputPanesProps } from "./SkillInputPanes";

afterEach(() => {
  cleanup();
});

function renderPanes(overrides: Partial<SkillInputPanesProps> = {}) {
  const props: SkillInputPanesProps = {
    activeTab: "code",
    onTabChange: vi.fn(),
    mode: "modified_file",
    onModeChange: vi.fn(),
    before: "",
    onBeforeChange: vi.fn(),
    after: "",
    onAfterChange: vi.fn(),
    title: "",
    onTitleChange: vi.fn(),
    body: "",
    onBodyChange: vi.fn(),
    generatedDiff: "",
    readOnly: false,
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <SkillInputPanes {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("T-06 SkillInputPanes", () => {
  it("mode='modified_file' renders both Before code and After code", () => {
    renderPanes({ mode: "modified_file" });
    expect(screen.getByLabelText("Before code")).toBeInTheDocument();
    expect(screen.getByLabelText("After code")).toBeInTheDocument();
  });

  it("mode='new_file' renders only After code — no Before code", () => {
    renderPanes({ mode: "new_file" });
    expect(screen.getByLabelText("After code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Before code")).toBeNull();
  });

  it("clicking the New file sub-tab fires onModeChange('new_file')", () => {
    const onModeChange = vi.fn();
    renderPanes({ mode: "modified_file", onModeChange });

    fireEvent.click(screen.getByText("New file"));

    expect(onModeChange).toHaveBeenCalledWith("new_file");
  });

  it("clicking the Modified file sub-tab fires onModeChange('modified_file')", () => {
    const onModeChange = vi.fn();
    renderPanes({ mode: "new_file", onModeChange });

    fireEvent.click(screen.getByText("Modified file"));

    expect(onModeChange).toHaveBeenCalledWith("modified_file");
  });

  it("the main tab row renders Code and PR meta — no Files tab", () => {
    renderPanes();
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("PR meta")).toBeInTheDocument();
    expect(screen.queryByText("Files")).toBeNull();
  });

  it("no sub-tab row on the PR meta tab", () => {
    renderPanes({ activeTab: "prMeta" });
    expect(screen.queryByText("New file")).toBeNull();
    expect(screen.queryByText("Modified file")).toBeNull();
  });

  it("the disclosure is collapsed initially and reveals the generated diff after clicking", () => {
    renderPanes({ generatedDiff: "diff --git a/snippet.ts b/snippet.ts" });

    expect(screen.queryByLabelText("Generated diff")).toBeNull();

    fireEvent.click(screen.getByText("Preview generated diff"));

    const diffView = screen.getByLabelText("Generated diff");
    expect(diffView).toBeInTheDocument();
    expect(diffView).toHaveTextContent("diff --git a/snippet.ts b/snippet.ts");
  });

  it("the PR meta tab renders PR title/PR body fields carrying the design's placeholders and fires onChange", () => {
    const onTitleChange = vi.fn();
    const onBodyChange = vi.fn();
    renderPanes({ activeTab: "prMeta", onTitleChange, onBodyChange });

    const titleField = screen.getByLabelText("PR title");
    expect(titleField).toHaveAttribute("placeholder", "Add Stripe integration");
    fireEvent.change(titleField, { target: { value: "Add Stripe integration" } });
    expect(onTitleChange).toHaveBeenCalledWith("Add Stripe integration");

    const bodyField = screen.getByLabelText("PR body");
    expect(bodyField).toHaveAttribute("placeholder", "Wire up payments via Stripe SDK.");
    fireEvent.change(bodyField, { target: { value: "Wire up payments via Stripe SDK." } });
    expect(onBodyChange).toHaveBeenCalledWith("Wire up payments via Stripe SDK.");
  });

  // The Before/After placeholders are TypeScript snippets, so their values carry
  // `{`/`}` — ICU argument syntax. An unescaped brace makes next-intl fail to
  // parse the message and silently render the key PATH instead of the text, which
  // ships as a field literally reading "eval.caseEditor.codeTab.beforePlaceholder".
  // Asserting the rendered text (not just that a placeholder attribute exists) is
  // what pins the escaping; the PR-meta placeholders above are brace-free and so
  // can never catch this.
  it("the Before/After placeholders render their snippet text, not the raw i18n key", () => {
    renderPanes({ mode: "modified_file" });

    for (const label of ["Before code", "After code"]) {
      const placeholder = screen.getByLabelText(label).getAttribute("placeholder");
      expect(placeholder).toContain("type UserResponse = {");
      expect(placeholder).not.toContain("caseEditor.codeTab");
    }
  });

  it("readOnly renders <pre aria-readonly> views instead of textareas for Before/After", () => {
    renderPanes({
      mode: "modified_file",
      readOnly: true,
      before: "type UserResponse = {\n  id: string;\n  name: string;\n}",
      after: "type UserResponse = {\n  id: string;\n}",
    });

    const beforeField = screen.getByLabelText("Before code");
    const afterField = screen.getByLabelText("After code");
    expect(beforeField.tagName).toBe("PRE");
    expect(beforeField).toHaveAttribute("aria-readonly", "true");
    expect(afterField.tagName).toBe("PRE");
    expect(afterField).toHaveAttribute("aria-readonly", "true");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("readOnly renders PR title/PR body as read-only text, not inputs", () => {
    renderPanes({ activeTab: "prMeta", readOnly: true, title: "Add Stripe integration", body: "Wire up payments." });

    const titleField = screen.getByLabelText("PR title");
    const bodyField = screen.getByLabelText("PR body");
    expect(titleField.tagName).toBe("PRE");
    expect(bodyField.tagName).toBe("PRE");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("readOnly does not fire onModeChange when a sub-tab is clicked", () => {
    const onModeChange = vi.fn();
    renderPanes({ mode: "modified_file", readOnly: true, onModeChange });

    fireEvent.click(screen.getByText("New file"));

    expect(onModeChange).not.toHaveBeenCalled();
  });
});
