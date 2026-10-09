import { randomBytes } from "node:crypto";

import type { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env";
import { DocumentCryptoService } from "./document-crypto.service";

const config = (key: string) => ({ get: () => key }) as unknown as ConfigService<Env, true>;

describe("DocumentCryptoService", () => {
  const crypto = new DocumentCryptoService(config(randomBytes(32).toString("base64")));

  it("round-trips a document and never repeats a ciphertext", () => {
    const first = crypto.encrypt("12345678909");
    expect(crypto.decrypt(first)).toBe("12345678909");
    expect(crypto.encrypt("12345678909")).not.toBe(first);
  });

  it("refuses a truncated authentication tag", () => {
    const [version, iv, tag, data] = crypto.encrypt("12345678909").split(":");
    const short = Buffer.from(tag!, "base64").subarray(0, 4).toString("base64");
    expect(() => crypto.decrypt([version, iv, short, data].join(":"))).toThrow(
      "Invalid document ciphertext tag",
    );
  });

  it("refuses a tampered ciphertext", () => {
    const [version, iv, tag, data] = crypto.encrypt("12345678909").split(":");
    const bytes = Buffer.from(data!, "base64");
    bytes[0] = bytes[0]! ^ 0xff;
    expect(() => crypto.decrypt([version, iv, tag, bytes.toString("base64")].join(":"))).toThrow();
  });

  it("refuses a ciphertext from another key", () => {
    const other = new DocumentCryptoService(config(randomBytes(32).toString("base64")));
    expect(() => crypto.decrypt(other.encrypt("12345678909"))).toThrow();
  });
});
