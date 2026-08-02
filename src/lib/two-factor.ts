import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { CredentialsSignin } from "next-auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export class TwoFactorRequiredError extends CredentialsSignin {
  static type = "TwoFactorRequiredError";
  code = "two_factor_required";
}

export class InvalidTwoFactorCodeError extends CredentialsSignin {
  static type = "InvalidTwoFactorCodeError";
  code = "invalid_two_factor_code";
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// RFC 4226 HOTP.
function hotp(secret: Buffer, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

export function generateTotpSecret(bytes = 20) {
  return base32Encode(randomBytes(bytes));
}

export function totpUri(secret: string, email: string, issuer = "Consultainer") {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// RFC 6238 TOTP, 30s step, +/-1 step tolerance for clock drift.
export function verifyTotp(secret: string, token: string, window = 1) {
  const clean = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const expected = hotp(key, counter + errorWindow);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => randomBytes(5).toString("hex"));
}

/** Verifies a login-time 2FA code — a 6-digit TOTP, or a single-use recovery code. */
export async function verifyLoginTwoFactor(userId: string, encryptedSecret: string, code: string) {
  const clean = code.trim();
  if (/^\d{6}$/.test(clean)) {
    return verifyTotp(decrypt(encryptedSecret), clean);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorRecoveryCodes: true },
  });
  if (!user) return false;

  for (const hash of user.twoFactorRecoveryCodes) {
    if (await bcrypt.compare(clean, hash)) {
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorRecoveryCodes: user.twoFactorRecoveryCodes.filter((h) => h !== hash) },
      });
      return true;
    }
  }
  return false;
}
