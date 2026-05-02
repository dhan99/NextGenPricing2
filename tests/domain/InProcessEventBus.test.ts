/**
 * F1.4.3 — InProcessEventBus tests.
 *
 * The bus is the synchronous fanout seam between the application
 * layer and subscribers (auto-push, activity-log writers). Pin:
 *   - sequential dispatch in registration order
 *   - subscriber failures don't break the chain
 *   - unsubscribe cancels exactly one handler
 *   - publishAll preserves event order
 */
import { describe, it, expect, vi } from "vitest";
import { InProcessEventBus } from "@dealpad/infrastructure";
import type { DomainEvent } from "@dealpad/domain";

const mkEvent = (over: Partial<DomainEvent> = {}): DomainEvent => ({
  type: "TestEvent",
  version: 1,
  aggregateId: 1,
  occurredAt: new Date("2026-05-02T00:00:00Z"),
  ...over,
});

describe("InProcessEventBus.subscribe + publish", () => {
  it("dispatches to handlers in registration order", async () => {
    const bus = new InProcessEventBus();
    const order: number[] = [];
    bus.subscribe("TestEvent", () => {
      order.push(1);
    });
    bus.subscribe("TestEvent", async () => {
      await Promise.resolve();
      order.push(2);
    });
    bus.subscribe("TestEvent", () => {
      order.push(3);
    });
    await bus.publish(mkEvent());
    expect(order).toEqual([1, 2, 3]);
  });

  it("only fires handlers matching the event type", async () => {
    const bus = new InProcessEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe("TypeA", a);
    bus.subscribe("TypeB", b);
    await bus.publish(mkEvent({ type: "TypeA" }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(0);
  });

  it("publishing a type with zero subscribers is a no-op", async () => {
    const bus = new InProcessEventBus();
    await expect(bus.publish(mkEvent({ type: "Nobody" }))).resolves.toBeUndefined();
  });
});

describe("InProcessEventBus error isolation", () => {
  it("a throwing subscriber does not block later subscribers", async () => {
    const errors: unknown[] = [];
    const bus = new InProcessEventBus({ onError: (err) => errors.push(err) });
    const ranAfter = vi.fn();
    bus.subscribe("TestEvent", () => {
      throw new Error("boom");
    });
    bus.subscribe("TestEvent", ranAfter);
    await bus.publish(mkEvent());
    expect(ranAfter).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("boom");
  });

  it("an async subscriber that rejects is reported, not propagated", async () => {
    const errors: unknown[] = [];
    const bus = new InProcessEventBus({ onError: (err) => errors.push(err) });
    bus.subscribe("TestEvent", async () => {
      throw new Error("async boom");
    });
    await expect(bus.publish(mkEvent())).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});

describe("InProcessEventBus.subscribe returns unsubscribe", () => {
  it("unsubscribe removes only its own handler", async () => {
    const bus = new InProcessEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = bus.subscribe("TestEvent", a);
    bus.subscribe("TestEvent", b);
    unsubA();
    await bus.publish(mkEvent());
    expect(a).toHaveBeenCalledTimes(0);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("calling unsubscribe twice is safe", async () => {
    const bus = new InProcessEventBus();
    const a = vi.fn();
    const unsub = bus.subscribe("TestEvent", a);
    unsub();
    unsub(); // no-op
    await bus.publish(mkEvent());
    expect(a).toHaveBeenCalledTimes(0);
  });
});

describe("InProcessEventBus.publishAll", () => {
  it("preserves event order across multiple publish calls", async () => {
    const bus = new InProcessEventBus();
    const seen: number[] = [];
    bus.subscribe("TestEvent", (e) => {
      seen.push(e.aggregateId);
    });
    await bus.publishAll([
      mkEvent({ aggregateId: 1 }),
      mkEvent({ aggregateId: 2 }),
      mkEvent({ aggregateId: 3 }),
    ]);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("empty array is a no-op", async () => {
    const bus = new InProcessEventBus();
    await expect(bus.publishAll([])).resolves.toBeUndefined();
  });
});

describe("InProcessEventBus.clear", () => {
  it("removes all subscribers", async () => {
    const bus = new InProcessEventBus();
    const a = vi.fn();
    bus.subscribe("TestEvent", a);
    bus.clear();
    await bus.publish(mkEvent());
    expect(a).toHaveBeenCalledTimes(0);
  });
});
