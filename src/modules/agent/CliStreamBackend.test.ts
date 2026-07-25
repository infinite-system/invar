import { expect, test } from "bun:test";
import { CliStreamBackend } from "./CliStreamBackend";

test("a disposed CLI backend ignores later sends", () => {
  const backend = new CliStreamBackend.Class({ claudePath: "/missing/claude" });
  const events: unknown[] = [];
  backend.onEvent((event) => events.push(event));

  backend.dispose();
  backend.send("ignored");

  expect(events).toEqual([]);
});

test("child exit completes a CLI turn even while stdout never closes", async () => {
  class ExitFirstCliStreamBackend extends CliStreamBackend.$Class {
    protected override spawn(_argumentsAfterExecutable: string[]) {
      return {
        stdout: {
          async *[Symbol.asyncIterator]() {
            await new Promise<void>(() => {});
          },
        },
        stderr: null,
        exited: Promise.resolve(17),
        kill: () => {},
      } as never;
    }
  }
  const backend = new ExitFirstCliStreamBackend({
    claudePath: "unused",
  });
  const events: unknown[] = [];
  backend.onEvent((event) => events.push(event));

  backend.send("hang");
  await Bun.sleep(0);

  expect(events).toContainEqual({ kind: "session-end", reason: "error" });
});
