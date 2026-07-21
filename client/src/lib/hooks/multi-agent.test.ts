import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  MultiAgentEstimateResponse,
  MultiAgentRunCreateResponse,
  MultiAgentRunDetail,
  MultiAgentRunListItem,
} from "@devdigest/shared";
import {
  useMultiRunEstimate,
  useCreateMultiRun,
  useMultiRun,
  useMultiRunHistory,
  useDeleteMultiRun,
} from "./multi-agent";
import { API_BASE } from "../api";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMultiRunEstimate", () => {
  it("POSTs to /pulls/:id/multi-agent-runs/estimate and returns typed data", async () => {
    const response: MultiAgentEstimateResponse = {
      perAgent: [
        { agentId: "agent-1", estCostUsd: null, estDurationMs: null, basis: "diff-size" },
      ],
      summary: { estCostUsd: null, estDurationMs: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMultiRunEstimate(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ prId: "pr-1", agentIds: ["agent-1"] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(response);
    // nullable cold-start fields must round-trip as null, not coerced away
    expect(result.current.data?.summary.estCostUsd).toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/pulls/pr-1/multi-agent-runs/estimate`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ agentIds: ["agent-1"] });
  });
});

describe("useCreateMultiRun", () => {
  it("POSTs to /pulls/:id/multi-agent-runs and returns { multiRunId, runs }", async () => {
    const response: MultiAgentRunCreateResponse = {
      multiRunId: "multi-1",
      runs: [{ agentId: "agent-1", runId: "run-1" }],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCreateMultiRun(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ prId: "pr-1", agentIds: ["agent-1"] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(response);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/pulls/pr-1/multi-agent-runs`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ agentIds: ["agent-1"] });
  });
});

describe("useMultiRun", () => {
  it("GETs /multi-agent-runs/:id and returns typed data", async () => {
    const detail: MultiAgentRunDetail = {
      id: "multi-1",
      prId: "pr-1",
      status: "complete",
      ranAt: "2026-07-19T00:00:00.000Z",
      agents: [],
      groups: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(detail));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMultiRun("multi-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(detail);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe(`${API_BASE}/multi-agent-runs/multi-1`);
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("does not fetch when id is null/undefined (gated via enabled, not a null query key)", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useMultiRun(undefined), { wrapper: createWrapper() });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls while status is running, and stops once status settles", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const running: MultiAgentRunDetail = {
        id: "multi-1",
        prId: "pr-1",
        status: "running",
        ranAt: "2026-07-19T00:00:00.000Z",
        agents: [],
        groups: [],
      };
      const complete: MultiAgentRunDetail = { ...running, status: "complete" };
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(running))
        .mockResolvedValueOnce(jsonResponse(complete));
      vi.stubGlobal("fetch", fetchMock);

      const { result } = renderHook(() => useMultiRun("multi-1"), { wrapper: createWrapper() });

      await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.status).toBe("running");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      await vi.waitFor(() => expect(result.current.data?.status).toBe("complete"));
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // status is now settled ("complete") — a further interval tick must not
      // trigger a third fetch.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useMultiRunHistory", () => {
  it("GETs /pulls/:id/multi-agent-runs and returns typed list data", async () => {
    const history: MultiAgentRunListItem[] = [
      {
        id: "multi-1",
        ranAt: "2026-07-19T00:00:00.000Z",
        status: "complete",
        agentCount: 2,
        totalCostUsd: null,
        totalDurationMs: null,
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(history));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMultiRunHistory("pr-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(history);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe(`${API_BASE}/pulls/pr-1/multi-agent-runs`);
  });

  it("does not fetch when prId is null/undefined", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useMultiRunHistory(undefined), { wrapper: createWrapper() });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useDeleteMultiRun", () => {
  it("DELETEs /multi-agent-runs/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(undefined, 204));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDeleteMultiRun(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate("multi-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/multi-agent-runs/multi-1`);
    expect(init.method).toBe("DELETE");
  });
});
