import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE_INTENT = {
  intent: "Adds rate limiting",
  in_scope: ["rate limiting"],
  out_of_scope: ["auth"],
  pr_id: "pr1",
};

describe("IntentCard", () => {
  it("renders intent summary with quotes and in/out scope columns", () => {
    renderWithIntl(
      <IntentCard
        intentData={BASE_INTENT}
        risksData={{ risks: [] }}
        risksLoading={false}
        recalcButton={<button>Recalculate</button>}
      />,
    );

    expect(screen.getByText('"Adds rate limiting"')).toBeInTheDocument();
    expect(screen.getByText("rate limiting")).toBeInTheDocument();
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("Recalculate")).toBeInTheDocument();
  });

  it("shows empty state when no intent data", () => {
    renderWithIntl(
      <IntentCard
        intentData={undefined}
        risksData={undefined}
        risksLoading={false}
        recalcButton={<button>Recalculate</button>}
      />,
    );

    expect(screen.getByText("No intent yet")).toBeInTheDocument();
  });

  it("renders risk chips by severity", () => {
    renderWithIntl(
      <IntentCard
        intentData={BASE_INTENT}
        risksData={{
          risks: [
            { kind: "security", title: "Possible secret leak", severity: "high", explanation: "", file_refs: [] },
            { kind: "perf", title: "N+1 query", severity: "medium", explanation: "", file_refs: [] },
          ],
        }}
        risksLoading={false}
        recalcButton={<button>Recalculate</button>}
      />,
    );

    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Possible secret leak")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });
});
