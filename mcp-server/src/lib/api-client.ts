// Typed fetch wrapper for the DevDigest API — HTTP transport only, no business logic.

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// Agent returned by GET /agents
export interface Agent {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
}

// Run returned by GET /pulls/:id/runs
export interface Run {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
}

// Finding inside a review
export interface Finding {
  id: string;
  severity: string;
  title: string;
  file: string | null;
  line: number | null;
  body: string;
}

// Review returned by GET /pulls/:id/reviews (array item)
export interface Review {
  id: string;
  score: number | null;
  verdict: string | null;
  findings: Finding[];
}

// Convention returned by GET /repos/:id/conventions
export interface Convention {
  id: string;
  rule: string;
  accepted: boolean | null;
}

export interface ApiClient {
  listAgents(): Promise<Agent[]>;
  startReview(pullId: string, agentId: string): Promise<{ runs: Run[] }>;
  listRuns(pullId: string): Promise<Run[]>;
  getReviews(pullId: string): Promise<Review[]>;
  getConventions(repoId: string): Promise<Convention[]>;
}

export function createApiClient(baseUrl?: string): ApiClient {
  const base =
    baseUrl ?? process.env['DEVDIGEST_API_URL'] ?? 'http://localhost:4001';

  async function request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${base}${path}`, init);
    if (!res.ok) {
      throw new ApiError(`HTTP ${res.status}: ${res.statusText}`, res.status);
    }
    return res.json() as Promise<T>;
  }

  return {
    listAgents(): Promise<Agent[]> {
      return request<Agent[]>('/agents');
    },

    startReview(pullId: string, agentId: string): Promise<{ runs: Run[] }> {
      return request<{ runs: Run[] }>(`/pulls/${pullId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
    },

    listRuns(pullId: string): Promise<Run[]> {
      return request<Run[]>(`/pulls/${pullId}/runs`);
    },

    getReviews(pullId: string): Promise<Review[]> {
      return request<Review[]>(`/pulls/${pullId}/reviews`);
    },

    getConventions(repoId: string): Promise<Convention[]> {
      return request<Convention[]>(`/repos/${repoId}/conventions`);
    },
  };
}
