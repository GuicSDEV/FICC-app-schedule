import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { GuestDocumentType } from "@ficc/db";

import type { Env } from "../config/env";

const VERSION = "v1";
const IV_BYTES = 12;

/** Fields a guest pass or block keeps about a document. */
export interface StoredDocument {
  documentType: GuestDocumentType;
  /** Legacy plaintext (rows from before encryption, until the encrypt-legacy job runs). */
  documentNumber: string | null;
  documentCipher: string | null;
}

/**
 * Guest documents at rest (LGPD): AES-256-GCM ciphertext for display at the gate and a keyed
 * HMAC for equality lookups (blocklist, per-document history), both from DATA_ENCRYPTION_KEY.
 * Ciphertexts are versioned ("v1:iv:tag:data") so the key can be rotated later.
 */
@Injectable()
export class DocumentCryptoService {
  private readonly encryptionKey: Buffer;
  private readonly hashKey: Buffer;

  constructor(config: ConfigService<Env, true>) {
    const master = Buffer.from(config.get("DATA_ENCRYPTION_KEY", { infer: true }), "base64");
    this.encryptionKey = Buffer.from(
      hkdfSync("sha256", master, "", "guest-document-encryption", 32),
    );
    this.hashKey = Buffer.from(hkdfSync("sha256", master, "", "guest-document-hash", 32));
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data]
      .map((part) => (typeof part === "string" ? part : part.toString("base64")))
      .join(":");
  }

  decrypt(stored: string): string {
    const [version, iv, tag, data] = stored.split(":");
    if (version !== VERSION || !iv || !tag || !data)
      throw new Error("Unknown document ciphertext format");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
      "utf8",
    );
  }

  /** Stable lookup key for a normalized document (type included: a CPF and an RG never collide). */
  hash(documentType: GuestDocumentType, documentNumber: string): string {
    return createHmac("sha256", this.hashKey)
      .update(`${documentType}:${documentNumber}`)
      .digest("hex");
  }

  /** Columns to store for a document. */
  seal(documentType: GuestDocumentType, documentNumber: string) {
    return {
      documentNumber: null,
      documentCipher: this.encrypt(documentNumber),
      documentHash: this.hash(documentType, documentNumber),
    };
  }

  /** The plaintext number of a stored document, or null once anonymized. */
  reveal(row: StoredDocument): string | null {
    if (row.documentCipher) return this.decrypt(row.documentCipher);
    return row.documentNumber;
  }
}
