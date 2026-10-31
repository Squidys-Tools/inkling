import { describe, expect, it } from "bun:test";
import { createReconnectingClient, restartedMessage } from "./reconnecting.ts";

type FakeClient = {
  read: (payload: { id: string }) => Promise<string>;
  changes: (onValue: (value: string) => void) => () => void;
};

function deferred() {
  let resolve = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((done, fail) => {
    resolve = () => done();
    reject = fail;
  });
  return { promise, resolve, reject };
}

// Each port opens when the test says so. Reads on port "one" never answer, as
// on a process that died; reads elsewhere answer with the port and the id.
function fakeLibrary() {
  const opens = new Map<string, ReturnType<typeof deferred>>();
  const closed: string[] = [];
  let requests = 0;
  const library = createReconnectingClient<FakeClient, string>({
    open: async (port) => {
      const opening = deferred();
      opens.set(port, opening);
      await opening.promise;
      return {
        client: {
          read: ({ id }) =>
            port === "one" ? new Promise<string>(() => {}) : Promise.resolve(`${port}:${id}`),
          changes: () => () => {},
        },
        close: async () => void closed.push(port),
      };
    },
    requestPort: () => void (requests += 1),
  });
  const connect = async (port: string) => {
    const received = library.receivePort(port);
    opens.get(port)?.resolve();
    await received;
  };
  return { library, opens, closed, connect, requests: () => requests };
}

describe("reconnecting library client", () => {
  it("points the client at the new port before reconnect listeners run", async () => {
    const fake = fakeLibrary();
    const first = fake.library.client();
    await fake.connect("one");
    await first;
    const reloads: Promise<string>[] = [];
    fake.library.onReconnect(() => {
      reloads.push(fake.library.client().then((client) => client.read({ id: "reload" })));
    });
    await fake.connect("two");
    expect(fake.closed).toEqual(["one"]);
    expect(await Promise.all(reloads)).toEqual(["two:reload"]);
  });

  it("rejects calls cut off by a restart plainly, and makes calls during it wait", async () => {
    const fake = fakeLibrary();
    void fake.library.client();
    await fake.connect("one");
    const old = await fake.library.client();
    const cutOff = old.read({ id: "in-flight" });

    const received = fake.library.receivePort("two");
    await expect(cutOff).rejects.toThrow(restartedMessage);
    // Made while the new port connects: through the retired client, and through a fresh lookup.
    const viaOld = old.read({ id: "stale-reference" });
    const viaNew = fake.library.client().then((client) => client.read({ id: "during" }));
    fake.opens.get("two")?.resolve();
    await received;
    expect(await viaOld).toBe("two:stale-reference");
    expect(await viaNew).toBe("two:during");
  });

  it("rejects the first load when connecting fails, and asks again on the next call", async () => {
    const fake = fakeLibrary();
    const first = fake.library.client();
    expect(fake.requests()).toBe(1);
    const broken = fake.library.receivePort("one");
    fake.opens.get("one")?.reject(new Error("no library"));
    await broken;
    await expect(first).rejects.toThrow("no library");

    let reconnected = false;
    fake.library.onReconnect(() => (reconnected = true));
    const retry = fake.library.client();
    expect(fake.requests()).toBe(2);
    await fake.connect("two");
    expect(await (await retry).read({ id: "retry" })).toBe("two:retry");
    // Whatever failed on the first port reloads now that one works.
    expect(reconnected).toBe(true);
  });
});
