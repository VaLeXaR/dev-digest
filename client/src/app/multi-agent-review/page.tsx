import { Suspense } from "react";
import { ConfigureRun } from "./_components/ConfigureRun/ConfigureRun";

// ConfigureRun reads `?configure=1` via useSearchParams, which Next requires to
// sit under a Suspense boundary.
export default function MultiAgentReviewPage() {
  return (
    <Suspense>
      <ConfigureRun />
    </Suspense>
  );
}
