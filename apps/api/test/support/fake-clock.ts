import { Clock } from "../../src/common/clock";

/** Monday 2030-03-04, 09:00 in São Paulo: a fixed "now" far from real dates. */
export const DEFAULT_TEST_NOW = new Date("2030-03-04T12:00:00.000Z");

export class FakeClock extends Clock {
  private current = new Date(DEFAULT_TEST_NOW);

  override now(): Date {
    return new Date(this.current);
  }

  set(date: Date | string): void {
    this.current = new Date(date);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  reset(): void {
    this.current = new Date(DEFAULT_TEST_NOW);
  }
}
