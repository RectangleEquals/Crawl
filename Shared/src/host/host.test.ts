import { beforeAll, describe, expect, it } from "vitest";
import { GameHost } from "./gameHost.js";
import { initPhysics } from "../sim/physics.js";
import type { ConnectionListener } from "../protocol/transport.js";

const noopListener: ConnectionListener = { onConnection: () => undefined };

beforeAll(async () => {
  await initPhysics();
});

describe("GameHost.publicInfo (read-only REST source)", () => {
  it("reports areas + occupancy with no secrets, empty before anyone joins", () => {
    const host = new GameHost(noopListener, { seed: "rest-test", botCount: 0, enemyCount: 0 });
    const info = host.publicInfo();
    expect(info.server.areas).toBeGreaterThan(0);
    expect(info.areas.length).toBe(info.server.areas);
    expect(info.server.players).toBe(0);
    expect(info.players).toEqual([]);
    for (const a of info.areas) {
      expect(typeof a.name).toBe("string");
      expect(a.players).toBe(0);
    }
    host.stop();
  });
});
