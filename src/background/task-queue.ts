/**
 * Serialized async task queue.
 *
 * All storage mutations are enqueued here so read-modify-write is safe even
 * when multiple panel windows are open. The key invariant: a task starts only
 * after the previous task has settled, and a rejection in one task never
 * prevents subsequent tasks from running.
 */

interface TaskQueue {
  push<T>(fn: () => Promise<T>): Promise<T>;
}

function createTaskQueue(): TaskQueue {
  // Internal tail tracks when the previous task settled (always resolves, never rejects).
  let tail: Promise<void> = Promise.resolve();

  return {
    push<T>(fn: () => Promise<T>): Promise<T> {
      // Schedule fn to run after the current tail.
      const task = tail.then(() => fn());
      // Advance the tail, absorbing any rejection so future tasks always run.
      tail = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
  };
}

export const taskQueue: TaskQueue = createTaskQueue();
