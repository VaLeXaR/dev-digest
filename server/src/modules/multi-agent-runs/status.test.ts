import { describe, it, expect } from 'vitest';
import { deriveMultiRunStatus } from './status.js';

describe('deriveMultiRunStatus', () => {
  it('returns running when any child run is still running, regardless of others', () => {
    const status = deriveMultiRunStatus([
      { status: 'done' },
      { status: 'running' },
      { status: 'failed' },
    ]);
    expect(status).toBe('running');
  });

  it('returns complete only when every child run is done', () => {
    const status = deriveMultiRunStatus([{ status: 'done' }, { status: 'done' }]);
    expect(status).toBe('complete');
  });

  it('returns failed when all children are terminal but at least one is not done', () => {
    const mixed = deriveMultiRunStatus([{ status: 'done' }, { status: 'failed' }]);
    expect(mixed).toBe('failed');

    const allFailed = deriveMultiRunStatus([{ status: 'failed' }, { status: 'cancelled' }]);
    expect(allFailed).toBe('failed');
  });
});
