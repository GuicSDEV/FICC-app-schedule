import { randomInt } from "node:crypto";

import { Injectable } from "@nestjs/common";

const RANGE = 2 ** 48 - 1;

/** Source of randomness for lots (tournament draws), so tests can control it. */
@Injectable()
export class Random {
  /** A number in [0, 1) from the crypto generator. */
  next(): number {
    return randomInt(RANGE) / RANGE;
  }
}
