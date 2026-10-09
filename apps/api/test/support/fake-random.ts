import { Random } from "../../src/common/random";

/**
 * Test lots. By default every lot keeps the seed order (Fisher–Yates always picks the last place),
 * so draws are predictable; `use()` plays a fixed sequence instead.
 */
export class FakeRandom extends Random {
  private values: number[] = [];
  private index = 0;

  override next(): number {
    if (this.values.length === 0) return 0.999_999;
    return this.values[this.index++ % this.values.length]!;
  }

  use(...values: number[]): void {
    this.values = values;
    this.index = 0;
  }

  reset(): void {
    this.use();
  }
}
