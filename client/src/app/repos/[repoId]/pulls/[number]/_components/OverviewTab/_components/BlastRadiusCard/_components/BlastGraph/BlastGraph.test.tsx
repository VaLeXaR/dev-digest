import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastGraph } from "./BlastGraph";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("BlastGraph", () => {
  it("renders the stub placeholder with the graph.empty copy and an aria-label on the container", () => {
    renderWithIntl(<BlastGraph />);

    const container = screen.getByLabelText("Blast radius graph");
    expect(container).toBeInTheDocument();
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
  });
});
