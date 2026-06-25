"use client";

import { ErrorState } from "@devdigest/ui";

export default function PrDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      fullScreen
      title="Couldn't load this pull request"
      body={error.message || undefined}
      onRetry={reset}
    />
  );
}
