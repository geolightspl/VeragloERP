/** Email service abstraction for Gmail, Outlook, IMAP accounts */

import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import Imap from "imap";
import { PassThrough } from "stream";

/**
 * Abstract email service supporting:
 * - Gmail (OAuth or App password)
 * - Microsoft 365 / Outlook (OAuth)
 * - IMAP/SMTP (generic email accounts)
 */

export class EmailService {
  constructor(config) {
    this.provider = config.provider; // "gmail", "outlook", "imap"
    this.email = config.email;
    this.config = config;
    this.transporter = null;
    this.imap = null;
  }

  /**
   * Initialize connection based on provider
   */
  async init() {
    if (this.provider === "gmail") {
      await this.initGmail();
    } else if (this.provider === "outlook") {
      await this.initOutlook();
    } else if (this.provider === "imap") {
      this.initImap();
    }
  }

  /**
   * Gmail setup via OAuth or App Password
   */
  async initGmail() {
    const transportConfig = {
      service: "gmail",
      auth: {
        user: this.email,
        pass: this.config.appPassword || this.config.password,
      },
    };

    // OAuth support (future: implement OAuth token refresh)
    if (this.config.oauthAccessToken) {
      transportConfig.auth = {
        user: this.email,
        accessToken: this.config.oauthAccessToken,
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        refreshToken: this.config.refreshToken,
      };
    }

    this.transporter = nodemailer.createTransport(transportConfig);
    await this.transporter.verify();
  }

  /**
   * Outlook / Office 365 setup
   */
  async initOutlook() {
    const transportConfig = {
      host: this.config.smtpHost || "smtp.office365.com",
      port: this.config.smtpPort || 587,
      secure: false,
      auth: {
        user: this.email,
        pass: this.config.password,
      },
    };

    this.transporter = nodemailer.createTransport(transportConfig);
    await this.transporter.verify();
  }

  /**
   * Generic IMAP/SMTP setup
   */
  initImap() {
    this.imap = new Imap({
      user: this.email,
      password: this.config.password,
      host: this.config.imapHost,
      port: this.config.imapPort || 993,
      tls: this.config.tls !== false,
    });

    // Setup SMTP for sending
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort || 587,
      secure: this.config.smtpPort === 465,
      auth: {
        user: this.email,
        pass: this.config.password,
      },
    });
  }

  /**
   * Fetch recent emails from inbox
   * @param limit Number of emails to fetch
   * @returns Array of { from, to, subject, text, html, date, messageId, attachments }
   */
  async fetchEmails(limit = 50) {
    if (this.provider === "gmail") {
      return this.fetchGmailEmails(limit);
    } else if (this.provider === "outlook") {
      return this.fetchOutlookEmails(limit);
    } else if (this.provider === "imap") {
      return this.fetchImapEmails(limit);
    }
    return [];
  }

  /**
   * Fetch from Gmail via IMAP (Gmail IMAP is same as generic IMAP)
   */
  async fetchGmailEmails(limit) {
    return this.fetchImapEmails(limit);
  }

  /**
   * Fetch from Outlook via IMAP
   */
  async fetchOutlookEmails(limit) {
    // Outlook supports IMAP, so use generic IMAP fetch
    return this.fetchImapEmails(limit);
  }

  /**
   * Generic IMAP fetch
   */
  async fetchImapEmails(limit) {
    return new Promise((resolve, reject) => {
      const emails = [];
      let openBox = false;

      this.imap.openBox("INBOX", false, async (err, box) => {
        if (err) return reject(err);
        openBox = true;

        // Get recent emails
        const searchCriteria = ["UNSEEN"];
        this.imap.search(searchCriteria, (err, results) => {
          if (err) {
            if (openBox) this.imap.closeBox(() => resolve(emails));
            return reject(err);
          }

          if (!results || results.length === 0) {
            if (openBox) this.imap.closeBox(() => resolve(emails));
            return resolve(emails);
          }

          const f = this.imap.fetch(results.slice(0, limit), { bodies: "" });
          f.on("message", (msg, seqno) => {
            simpleParser(msg, async (err, parsed) => {
              if (err) return;
              emails.push({
                from: parsed.from.text,
                fromEmail: parsed.from.value[0].address,
                fromName: parsed.from.value[0].name || "",
                to: parsed.to.text,
                subject: parsed.subject,
                text: parsed.text || "",
                html: parsed.html || "",
                date: parsed.date,
                messageId: parsed.messageId,
                attachments: (parsed.attachments || []).map((a) => ({
                  filename: a.filename,
                  mimetype: a.contentType,
                  size: a.size,
                  content: a.content, // Buffer
                })),
              });
            });
          });

          f.on("error", reject);
          f.on("end", () => {
            if (openBox) this.imap.closeBox(() => resolve(emails));
            else resolve(emails);
          });
        });
      });

      this.imap.openBox("INBOX", false, (err) => {
        if (err && !openBox) {
          resolve(emails);
        }
      });
    });
  }

  /**
   * Send email reply
   */
  async sendEmail({ to, subject, text, html, replyTo, attachments }) {
    if (!this.transporter) {
      throw new Error("Email service not initialized");
    }

    const mailOptions = {
      from: this.email,
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, "<br>"),
      replyTo: replyTo || this.email,
      attachments: attachments || [],
    };

    const info = await this.transporter.sendMail(mailOptions);
    return { ok: true, messageId: info.messageId };
  }

  /**
   * Close connections
   */
  async close() {
    if (this.imap) {
      return new Promise((resolve) => {
        this.imap.closeBox((err) => {
          if (err) console.error("Error closing IMAP box:", err);
          this.imap.end();
          resolve();
        });
      });
    }
  }
}

export function createEmailService(config) {
  return new EmailService(config);
}
