import { describe, it, expect } from "vitest";
import { classifyFile } from "../smart-diff/classifier.js";

describe("classifyFile — boilerplate", () => {
  it("pnpm-lock.yaml → boilerplate", () => {
    expect(classifyFile("pnpm-lock.yaml")).toBe("boilerplate");
  });
  it("yarn.lock → boilerplate", () => {
    expect(classifyFile("yarn.lock")).toBe("boilerplate");
  });
  it("dist/index.js → boilerplate", () => {
    expect(classifyFile("dist/index.js")).toBe("boilerplate");
  });
  it("src/__snapshots__/auth.snap → boilerplate", () => {
    expect(classifyFile("src/__snapshots__/auth.snap")).toBe("boilerplate");
  });
  it("0001_migration.sql → boilerplate", () => {
    expect(classifyFile("0001_migration.sql")).toBe("boilerplate");
  });
});

describe("classifyFile — core", () => {
  it("src/modules/reviews/service.ts → core", () => {
    expect(classifyFile("src/modules/reviews/service.ts")).toBe("core");
  });
  it("src/modules/auth/handler.ts → core", () => {
    expect(classifyFile("src/modules/auth/handler.ts")).toBe("core");
  });
  it("src/middleware/rateLimit.ts → core", () => {
    expect(classifyFile("src/middleware/rateLimit.ts")).toBe("core");
  });
  it("src/modules/search/indexer.ts → core (not wiring despite 'index' in name)", () => {
    expect(classifyFile("src/modules/search/indexer.ts")).toBe("core");
  });
  it("src/utils/format.ts → core", () => {
    expect(classifyFile("src/utils/format.ts")).toBe("core");
  });
});

describe("classifyFile — wiring", () => {
  it("src/index.ts → wiring", () => {
    expect(classifyFile("src/index.ts")).toBe("wiring");
  });
  it("src/server.ts → wiring", () => {
    expect(classifyFile("src/server.ts")).toBe("wiring");
  });
  it("src/modules/auth/routes.ts → wiring", () => {
    expect(classifyFile("src/modules/auth/routes.ts")).toBe("wiring");
  });
  it("src/config.ts → wiring", () => {
    expect(classifyFile("src/config.ts")).toBe("wiring");
  });
  it("src/app.ts → wiring", () => {
    expect(classifyFile("src/app.ts")).toBe("wiring");
  });
});
