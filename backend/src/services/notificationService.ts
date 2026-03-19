import nodemailer from 'nodemailer';

/**
 * Email notification service for critical MDM events.
 *
 * Configure via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ALERT_EMAIL
 *
 * When SMTP is not configured the service logs a warning and silently skips
 * sending so the application can still start in development.
 */
export class NotificationService {
  private transporter: nodemailer.Transporter | null = null;
  private from: string;
  private alertRecipient: string;

  constructor() {
    this.from = process.env.SMTP_FROM || 'mdm-alerts@yourdomain.com';
    this.alertRecipient = process.env.ALERT_EMAIL || '';

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      console.log(`NotificationService: SMTP configured (${host}:${port})`);
    } else {
      console.warn('NotificationService: SMTP not configured — email alerts disabled');
    }
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      console.error('NotificationService: failed to send email', err);
    }
  }

  async sendDeviceOfflineAlert(deviceId: string, lastSeen: Date): Promise<void> {
    if (!this.alertRecipient) return;
    await this.send(
      this.alertRecipient,
      `[MDM Alert] Device Offline: ${deviceId}`,
      `<h3>Device Offline</h3>
       <p>Device <strong>${deviceId}</strong> has not sent a heartbeat since
       <strong>${lastSeen.toISOString()}</strong>.</p>
       <p>Please check the device status in the admin dashboard.</p>`,
    );
  }

  async sendSecurityViolationAlert(deviceId: string, violation: string): Promise<void> {
    if (!this.alertRecipient) return;
    await this.send(
      this.alertRecipient,
      `[MDM Alert] Security Violation: ${deviceId}`,
      `<h3>Security Violation Detected</h3>
       <p>Device <strong>${deviceId}</strong> triggered a security alert:</p>
       <blockquote>${violation}</blockquote>
       <p>Take immediate action in the admin dashboard.</p>`,
    );
  }

  async sendCertExpiryAlert(certName: string, expiresAt: Date): Promise<void> {
    if (!this.alertRecipient) return;
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    await this.send(
      this.alertRecipient,
      `[MDM Alert] Certificate Expiring: ${certName}`,
      `<h3>Certificate Expiry Warning</h3>
       <p>Certificate <strong>${certName}</strong> expires on
       <strong>${expiresAt.toISOString()}</strong> (${daysLeft} days remaining).</p>
       <p>Renew the certificate before it expires to avoid service disruption.</p>`,
    );
  }
}

// Singleton
export const notificationService = new NotificationService();
