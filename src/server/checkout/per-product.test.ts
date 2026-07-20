import { beforeEach, describe, expect, it, vi } from "vitest";

const getProductById = vi.hoisted(() => vi.fn());
vi.mock("@/libs/product", () => ({ getProductById }));

const { perProduct } = await import("./per-product");

describe("perProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds once per product id and caches the value", () => {
    getProductById.mockImplementation((id: string) => ({ id }));
    const build = vi.fn((definition: { id: string }) => ({
      seen: definition.id,
    }));
    const resolve = perProduct(build);

    const first = resolve("p1");
    const second = resolve("p1");

    expect(first).toBe(second); // same cached instance
    expect(build).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ seen: "p1" });
  });

  it("caches a null for an unknown product without re-fetching", () => {
    getProductById.mockReturnValue(undefined);
    const build = vi.fn();
    const resolve = perProduct(build);

    expect(resolve("nope")).toBeNull();
    expect(resolve("nope")).toBeNull();
    expect(build).not.toHaveBeenCalled();
    expect(getProductById).toHaveBeenCalledTimes(1);
  });
});
