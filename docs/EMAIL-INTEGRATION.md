# Email Integration for Veraglo ERP Sales & CRM

## Overview

The Email Integration feature automatically fetches emails from Gmail, Microsoft 365, Outlook, and custom IMAP accounts, and converts them into structured Enquiries in the Sales & CRM module.

## Architecture

### Backend Components

#### 1. `server/email-service.js` — Email Service Abstraction
- Supports multiple email providers:
  - **Gmail**: OAuth or App Password authentication
  - **Microsoft 365/Outlook**: OAuth or App Password
  - **Custom IMAP/SMTP**: Generic email account support
- Methods:
  - `init()`: Initialize connection based on provider
  - `fetchEmails(limit)`: Fetch unread emails from inbox
  - `sendEmail()`: Send email replies
  - `close()`: Close connection

#### 2. `server/email-enquiry-converter.js` — Email Processing
- `extractEnquiryDetailsFromEmail()`: Parse email and extract:
  - Company name
  - Contact person
  - Email and phone
  - Project name
  - Item description
  - Attachments
- `findDuplicateEnquiry()`: Detect duplicate emails using:
  - Email address matching
  - Domain matching
  - Subject similarity (70%)
  - Company name similarity (60%)
- `createEnquiryFromEmail()`: Generate enquiry object from email
- `logEmailOperation()`: Audit trail logging

#### 3. `server/index.js` — Email API Endpoints

**Settings Management:**
- `POST /api/email-integration/settings` — Save configuration
- `GET /api/email-integration/settings` — Retrieve current settings

**Email Sync & Processing:**
- `POST /api/email-integration/sync` — Fetch and sync emails
- `POST /api/email-integration/convert-to-enquiry` — Create enquiry from email
- `POST /api/email-integration/send-reply` — Send email response
- `GET /api/email-integration/logs` — Email operation logs

### Frontend Components

#### 1. `src/email-integration.jsx` — Admin Settings UI
- **EmailIntegrationSettings**: Configuration panel
  - Email service provider selection
  - Authentication credentials
  - IMAP/SMTP settings for custom accounts
  - Sync frequency configuration (5-1440 minutes)
  - Auto-enquiry creation toggle
  - Default owner assignment
  - Connection testing

- **PendingEmailEnquiries**: Manual review queue
  - Display unprocessed emails
  - Accept/Skip actions
  - Link to existing enquiry
  - Assign salesperson

#### 2. `src/email-thread-viewer.jsx` — Email Thread UI
- **EmailThreadViewer**: Modal for email conversations
  - Display email history
  - Send inline replies
  - Attach files to replies
  - Email badge indicator
  
- **EmailSourceBadge**: Visual indicator for email-sourced enquiries

## Configuration

### Admin → System → Email Integration

#### Step 1: Select Email Provider

- **Gmail / Google Workspace**
  - Uses Gmail IMAP API
  - Requires app password
  - Generate at: myaccount.google.com/security → App passwords

- **Microsoft 365 / Outlook**
  - Uses Outlook IMAP
  - Can use account password or app-specific password
  - Generate at: account.microsoft.com/security → App passwords

- **Custom IMAP/SMTP**
  - Enter IMAP host (e.g., imap.company.com)
  - Enter IMAP port (usually 993 with TLS)
  - Enter SMTP host (e.g., smtp.company.com)
  - Enter SMTP port (usually 587 or 465)
  - Enter password/app password

#### Step 2: Configure Sync Settings

- **Sync Frequency**: Check for new emails every N minutes (5-1440)
- **Default Enquiry Owner**: Assign to specific sales person
- **Auto-create Enquiry**: Yes = create immediately, No = require manual review
- **Enable Integration**: Toggle on/off

#### Step 3: Test Connection

- Click "Test & Sync Now" to validate settings
- System will fetch sample emails to confirm access

## Email-to-Enquiry Workflow

```
┌─────────────────────┐
│  Email Received     │
│  (Gmail, Outlook)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Fetch via IMAP     │
│  Read: Subject, From│
│  Body, Attachments  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Extract Details    │
│  Company, Contact   │
│  Email, Phone       │
│  Project, Items     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Check Duplicates   │
│  By email/domain    │
│  By subject         │
│  By company name    │
└──────────┬──────────┘
           │
      ┌────┴─────────────────┐
      │ Duplicate            │ New Email
      ▼                      ▼
  Attach to       ┌──────────────────────┐
  Existing        │  Auto-create Option  │
  Enquiry         │  YES = Create Now    │
                  │  NO = Manual Review  │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Create Enquiry      │
                  │  - Auto-fill fields  │
                  │  - Save attachments  │
                  │  - Add to list       │
                  │  - Assign owner      │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ Enquiry List         │
                  │ Status: New Enquiry  │
                  │ Source: Email        │
                  │ Thread: Visible      │
                  └──────────────────────┘
```

## Enquiry Fields Populated from Email

| Field | Source | Example |
|-------|--------|---------|
| Customer Name | Email from name | "ABC Corporation" |
| Contact Person | Display name | "John Smith" |
| Email | From address | "john@abc.com" |
| Mobile | Extracted from body | "+1-555-1234" |
| Subject | Email subject | "RFQ: Steel Components" |
| Project Name | Body keywords | "Project Alpha" |
| Item Description | First lines of body | "We need 1000 units..." |
| Attachments | Email attachments | RFQ.pdf, BOQ.xlsx |
| Date | Email date | 2026-06-12 |
| Source | Set to "Email" | Email |
| Status | Set to "New Enquiry" | New Enquiry |
| Owner | Admin setting | Assigned salesperson |

## Reply & Communication

### From Enquiry Screen

1. Click "Email Thread" button on email-sourced enquiry
2. View full email conversation
3. Click "Reply by Email"
4. Type message and send
5. Reply appears in thread with timestamp
6. Can attach PDFs (quotation, revised offer, etc.)

### Supported Actions

- **Reply by Email**: Send message back to customer
- **Send PDF**: Attach quotation, offer, or technical document
- **Send Clarification**: Request additional information
- **View Thread**: Full conversation history

## Duplicate Prevention

### Detection Logic

**Email Match (100%)**
- Exact match of sender email address

**Domain Match (High)**
- Same company domain (e.g., @abc.com)

**Subject Similarity (70%)**
- Levenshtein distance on email subject

**Company Name Similarity (60%)**
- Fuzzy match on extracted company name

### Resolution

When duplicate detected:
- Attach new email to existing enquiry timeline
- Add to enquiry history as "Related Email"
- Do NOT create duplicate enquiry
- Notify salesperson of related inquiry

## Security

### Authentication

- **Gmail/Outlook OAuth**: Recommended (automatic token refresh)
- **App Passwords**: Supported for 2FA accounts
- **IMAP/SMTP**: Encrypted with TLS

### Data Protection

- Passwords never logged
- Credentials encrypted in database (in production)
- HTTPS-only API communication
- Role-based access control on settings

### Audit Trail

All email operations logged:
- Email fetched
- Enquiry created
- Attachment downloaded
- Email linked to enquiry
- Reply sent
- Quotation emailed

Access via: Admin → System → Email Integration → Logs

## Settings Persistence

Configuration stored in ERP state:
```javascript
emailIntegration: {
  provider: "gmail",
  email: "sales@company.com",
  appPassword: "xxxx xxxx xxxx xxxx",  // Never exposed in frontend
  syncFrequency: 15,
  defaultOwner: "USR-0002",
  autoCreateEnquiry: true,
  enabled: true,
  lastSynced: "2026-06-12T14:30:00Z",
}
```

## Limitations & Future Enhancements

### Current Phase (MVP)

- ✅ Gmail, Outlook, IMAP support
- ✅ Basic email parsing
- ✅ Auto-enquiry creation
- ✅ Duplicate detection
- ✅ Manual review queue
- ✅ Email reply capability
- ✅ Audit logging

### Planned Enhancements

- [ ] Scheduled email sync (background job)
- [ ] Advanced NLP for item extraction
- [ ] Multi-language support
- [ ] BCC tracking for sent offers
- [ ] Email signature preservation
- [ ] Threaded conversation grouping
- [ ] Bulk import from email archive
- [ ] Customizable field mapping
- [ ] Webhook support for email notifications
- [ ] Mobile app email capture

## Troubleshooting

### Connection Failed

- Verify email and password correct
- Check IMAP is enabled in email account settings
- Ensure app password (not account password) used for Gmail/Outlook
- Verify port is correct (usually 993 for IMAP, 587 for SMTP)
- Check firewall allows outbound IMAP/SMTP

### Emails Not Syncing

- Click "Test & Sync Now" in settings
- Check sync frequency (should be less than email volume)
- Verify auto-create toggle is ON
- Review Email Integration → Logs for errors

### Duplicates Being Created

- Duplicate detection uses fuzzy matching
- Lower thresholds can reduce false duplicates
- Manually link related enquiries if needed

## API Reference

See `/server/index.js` for complete endpoint documentation.
