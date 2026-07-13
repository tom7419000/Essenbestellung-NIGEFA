import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * E-Mail-Versand über SMTP (Dev: MailHog). Ohne SMTP_HOST werden Mails
 * nur geloggt — die Anwendung funktioniert auch ohne Mail-Server.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(configService: ConfigService) {
    const host = configService.get<string>('smtp.host');
    this.from = configService.get<string>('smtp.from') as string;
    this.appUrl = configService.get<string>('appUrl') as string;

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: configService.get<number>('smtp.port'),
        secure: configService.get<boolean>('smtp.secure'),
        auth: configService.get<string>('smtp.user')
          ? {
              user: configService.get<string>('smtp.user'),
              pass: configService.get<string>('smtp.pass'),
            }
          : undefined,
      });
    } else {
      this.transporter = null;
      this.logger.log('Kein SMTP_HOST konfiguriert — E-Mails werden nur geloggt.');
    }
  }

  /** Versand ist fire-and-forget: Mail-Fehler brechen keine fachliche Aktion ab. */
  async send(to: string, subject: string, bodyText: string, locale: string): Promise<void> {
    const html = this.wrap(subject, bodyText, locale);
    if (!this.transporter) {
      this.logger.debug(`[Mail-Stub] an ${to}: ${subject}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text: bodyText, html });
    } catch (error) {
      this.logger.error(`E-Mail an ${to} fehlgeschlagen: ${String(error)}`);
    }
  }

  private wrap(title: string, body: string, locale: string): string {
    const cta = locale === 'en' ? 'Open app' : 'Zur App';
    return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <p style="margin:0 0 4px;color:#059669;font-weight:600;font-size:13px;">NIGEFA Essensbestellung</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:#18181b;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">${escapeHtml(body)}</p>
      <a href="${this.appUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;">${cta}</a>
    </div>
  </body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
