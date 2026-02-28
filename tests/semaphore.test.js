const Semaphore = require("../services/semaphore");

describe("Semaphore - Concurrency Control", () => {
  test("should limit concurrent acquisitions", async () => {
    const sem = new Semaphore(2); // Max 2 concurrent

    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      await sem.acquire();
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 50));
      running--;
      sem.release();
    };

    await Promise.all([task(), task(), task(), task()]);

    expect(maxRunning).toBe(2); // Never exceeded limit
  });

  test("should handle sequential acquisitions", async () => {
    const sem = new Semaphore(1);

    let counter = 0;
    const task = async () => {
      await sem.acquire();
      const value = counter;
      await new Promise((resolve) => setTimeout(resolve, 10));
      counter = value + 1;
      sem.release();
    };

    await Promise.all([task(), task(), task()]);
    expect(counter).toBe(3);
  });

  test("should allow acquisition when under limit", async () => {
    const sem = new Semaphore(5);

    await sem.acquire();
    await sem.acquire();
    expect(sem.current).toBe(2);

    sem.release();
    sem.release();
    expect(sem.current).toBe(0);
  });
});
