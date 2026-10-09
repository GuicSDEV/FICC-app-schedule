import { Injectable } from "@nestjs/common";

/** Source of "now" for every time-based rule, so tests can control time. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
