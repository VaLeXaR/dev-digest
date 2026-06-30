import { describe, it, expect } from "vitest";
import { classifyFile, classifyFiles } from "./classifier.js";

describe("classifyFile", () => {
  // boilerplate cases
  it("classifies package-lock.json as boilerplate", () => {
    expect(classifyFile("package-lock.json")).toBe("boilerplate");
  });
  it("classifies pnpm-lock.yaml as boilerplate", () => {
    expect(classifyFile("pnpm-lock.yaml")).toBe("boilerplate");
  });
  it("classifies *.lock as boilerplate", () => {
    expect(classifyFile("some.lock")).toBe("boilerplate");
  });
  it("classifies dist/ paths as boilerplate", () => {
    expect(classifyFile("dist/index.js")).toBe("boilerplate");
    expect(classifyFile("packages/app/dist/bundle.js")).toBe("boilerplate");
  });
  it("classifies *.snap as boilerplate", () => {
    expect(classifyFile("src/__snapshots__/foo.snap")).toBe("boilerplate");
  });
  it("classifies __snapshots__/ paths as boilerplate", () => {
    expect(classifyFile("src/__snapshots__/bar.test.ts.snap")).toBe("boilerplate");
  });
  it("classifies *.generated.ts as boilerplate", () => {
    expect(classifyFile("src/api.generated.ts")).toBe("boilerplate");
  });

  // wiring cases
  it("classifies src/server.ts as wiring", () => {
    expect(classifyFile("src/server.ts")).toBe("wiring");
  });
  it("classifies src/index.ts as wiring", () => {
    expect(classifyFile("src/index.ts")).toBe("wiring");
  });
  it("classifies nested index.ts as wiring", () => {
    expect(classifyFile("src/modules/x/index.ts")).toBe("wiring");
  });
  it("classifies config.ts as wiring", () => {
    expect(classifyFile("src/config.ts")).toBe("wiring");
  });
  it("classifies /config/ paths as wiring", () => {
    expect(classifyFile("src/config/db.ts")).toBe("wiring");
  });
  it("classifies routes.ts as wiring", () => {
    expect(classifyFile("src/modules/auth/routes.ts")).toBe("wiring");
  });

  // core cases
  it("classifies service.ts as core", () => {
    expect(classifyFile("src/modules/auth/service.ts")).toBe("core");
  });
  it("classifies middleware as core", () => {
    expect(classifyFile("src/middleware/rateLimit.ts")).toBe("core");
  });

  // trap case — indexer.ts must NOT be wiring
  it("classifies indexer.ts as core, not wiring", () => {
    expect(classifyFile("src/modules/search/indexer.ts")).toBe("core");
  });
});

describe("classifyFiles", () => {
  it("groups files by role", () => {
    const files = [
      { path: "src/middleware/rateLimit.ts" },
      { path: "package-lock.json" },
      { path: "src/server.ts" },
    ];
    const result = classifyFiles(files);
    expect(result.get("core")).toHaveLength(1);
    expect(result.get("wiring")).toHaveLength(1);
    expect(result.get("boilerplate")).toHaveLength(1);
  });
});
