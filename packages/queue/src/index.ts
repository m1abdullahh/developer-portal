/**
 * @idp/queue — job orchestration behind a driver interface.
 *
 * InProcessDriver is the P1 implementation; BullMQDriver lands in P2 behind the same interface.
 * See docs/plan/06-orchestration-queue-vcs.md §2.
 */

export * from './types.js';
export * from './in-process.js';
