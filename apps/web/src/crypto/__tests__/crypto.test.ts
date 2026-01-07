import { describe, expect, it } from "vitest";

import { aesGcmDecrypt, aesGcmEncrypt } from "../aesGcm";
import { base64UrlToBytes, bytesToBase64Url } from "../base64url";
import { bytesToUtf8, utf8ToBytes } from "../bytes";
import { canonicalizeJson } from "../canonical";
import { generateEd25519KeyPair, signEd25519, verifyEd25519 } from "../ed25519";
import { bytesToHex } from "../hex";
import { hkdfSha256, hmacSha256, sha256Hex } from "../hash";
import { randomBytes } from "../random";
import { generateX25519KeyPair, x25519SharedSecret } from "../x25519";

describe("crypto utilities", () => {
  it("round-trips base64url encoding", () => {
    const input = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = bytesToBase64Url(input);
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = base64UrlToBytes(encoded);
    expect(decoded).toEqual(input);
  });

  it("canonicalizes JSON with stable key ordering and no undefined fields", () => {
    const value = { b: 1, a: 2, nested: { z: 3, y: 4 }, omit: undefined };
    const result = canonicalizeJson(value);
    expect(result).toBe('{"a":2,"b":1,"nested":{"y":4,"z":3}}');
  });

  it("hashes with SHA-256", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("computes HMAC-SHA256", () => {
    const key = new Uint8Array(20).fill(0x0b);
    const mac = hmacSha256(key, "Hi There");
    expect(bytesToHex(mac)).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
  });

  it("derives HKDF-SHA256 output", () => {
    const ikm = new Uint8Array(22).fill(0x0b);
    const salt = Uint8Array.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
      0x0b, 0x0c,
    ]);
    const info = Uint8Array.from([
      0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9,
    ]);
    const okm = hkdfSha256({ ikm, salt, info, length: 42 });
    expect(bytesToHex(okm)).toBe(
      "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
    );
  });

  it("encrypts and decrypts with AES-GCM", async () => {
    const key = new Uint8Array(32).fill(0x11);
    const nonce = new Uint8Array(12).fill(0x22);
    const ciphertext = await aesGcmEncrypt({
      key,
      plaintext: "hello",
      nonce,
    });
    const plaintext = await aesGcmDecrypt({ key, ciphertext });
    expect(bytesToUtf8(plaintext)).toBe("hello");
  });

  it("fails AES-GCM decryption with the wrong key", async () => {
    const key = new Uint8Array(32).fill(0x11);
    const nonce = new Uint8Array(12).fill(0x22);
    const ciphertext = await aesGcmEncrypt({
      key,
      plaintext: "hello",
      nonce,
    });

    await expect(
      aesGcmDecrypt({
        key: new Uint8Array(32).fill(0x33),
        ciphertext,
      }),
    ).rejects.toThrow();
  });

  it("signs and verifies Ed25519", () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const message = utf8ToBytes("command");
    const signature = signEd25519(message, privateKey);
    expect(verifyEd25519(signature, message, publicKey)).toBe(true);
    expect(
      verifyEd25519(signature, utf8ToBytes("tampered"), publicKey),
    ).toBe(false);
  });

  it("derives X25519 shared secrets", () => {
    const alice = generateX25519KeyPair();
    const bob = generateX25519KeyPair();
    const secret1 = x25519SharedSecret(alice.privateKey, bob.publicKey);
    const secret2 = x25519SharedSecret(bob.privateKey, alice.publicKey);
    expect(secret1).toEqual(secret2);
  });

  it("creates random bytes", () => {
    const bytes = randomBytes(16);
    expect(bytes).toHaveLength(16);
  });
});
