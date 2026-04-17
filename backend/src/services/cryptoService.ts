import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * AES-256-GCM encryption service for protecting sensitive data at rest
 * (e.g. certificate private keys stored in the database).
 *
 * Requires a 32-byte hex ENCRYPTION_KEY in the environment.
 */
export class CryptoService {
  private key: Buffer;

  constructor() {
    const envKey = process.env.ENCRYPTION_KEY;
    if (!envKey || envKey.length < 32) {
      // Derive a deterministic key from JWT_SECRET as fallback so the
      // service can start without a dedicated encryption key.
      const fallback = process.env.JWT_SECRET || 'fallback-secret-key';
      this.key = crypto.createHash('sha256').update(fallback).digest();
    } else {
      // Accept hex-encoded 32-byte key (64 hex chars) or raw 32-char string
      this.key = envKey.length === 64
        ? Buffer.from(envKey, 'hex')
        : crypto.createHash('sha256').update(envKey).digest();
    }
  }

  /**
   * Encrypt plaintext.
   * Returns a single base64 string: iv(12) + ciphertext + authTag(16).
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // Pack iv + ciphertext + tag into one buffer
    const combined = Buffer.concat([iv, encrypted, tag]);
    return combined.toString('base64');
  }

  /**
   * Decrypt a value previously produced by encrypt().
   */
  decrypt(packed: string): string {
    const combined = Buffer.from(packed, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}

// Singleton
export const cryptoService = new CryptoService();
