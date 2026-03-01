/**
 * Async semaphore for limiting concurrent operations.
 * Used to enforce per-key concurrency limits to prevent rate limit exhaustion.
 */
class Semaphore {
  /**
   * @param {number} max - Maximum number of concurrent acquisitions
   */
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  /**
   * Acquire a semaphore slot. Waits if limit is reached.
   * @returns {Promise<void>}
   */
  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }

    // Wait in queue until a slot becomes available
    await new Promise((resolve) => this.queue.push(resolve));
    this.current++;
  }

  /**
   * Release a semaphore slot and notify next waiting task.
   */
  release() {
    this.current--;
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
    }
  }

  /**
   * Get current number of active acquisitions.
   * @returns {number}
   */
  getActive() {
    return this.current;
  }

  /**
   * Get number of waiting tasks in queue.
   * @returns {number}
   */
  getWaiting() {
    return this.queue.length;
  }
}

module.exports = Semaphore;
