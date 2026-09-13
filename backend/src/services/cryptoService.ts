import * as crypto from 'crypto';
import config from '../config/env';

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
    // Resolved and validated once, at boot, by src/config/env.ts. In production
    // a real ENCRYPTION_KEY is mandatory; outside it, a domain-separated key is
    // derived from JWT_SECRET. There is no literal fallback.
    this.key = config.encryptionKey;
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
