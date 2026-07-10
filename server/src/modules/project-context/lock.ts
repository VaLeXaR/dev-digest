/**
 * Per-clone async mutex (D5 — MVP only). Serializes this feature's own
 * create/upload/edit/extract calls against each other for the same clone,
 * via a `Map<clonePath, Promise>` chain.
 *
 * Does NOT serialize against the review pipeline's `git sync` →
 * `reset --hard` (`server/src/adapters/git/simple-git.ts:77-88`) — an
 * accepted trade-off (plan Decision D5): `reset --hard` never deletes
 * untracked files, so the real exposure is a rare torn read/inconsistent
 * scan during a concurrent sync, not data loss of user-created content.
 */
const chains = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` only after every previously-queued `withCloneLock` call for the
 * same `clonePath` has settled (succeeded or failed) — writes to the same
 * clone never interleave. The returned promise carries `fn`'s own
 * result/rejection straight through to the caller.
 */
export function withCloneLock<T>(clonePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(clonePath) ?? Promise.resolve();
  const previousSettled = previous.then(
    () => undefined,
    () => undefined,
  );
  const result = previousSettled.then(fn);
  chains.set(
    clonePath,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}
