/** Email-to-Enquiry converter: Extract details from email and create structured enquiry */

/**
 * Parse email content to extract enquiry details
 */
export function extractEnquiryDetailsFromEmail(email) {
  return {
    companyName: extractCompanyName(email),
    contactPerson: extractContactName(email),
    email: email.fromEmail,
    mobile: extractPhoneNumber(email),
    projectName: extractProjectName(email),
    itemDescription: extractItemDescription(email),
    subject: email.subject,
    emailBody: email.text || email.html,
    sourceEmail: email.messageId,
    attachmentCount: (email.attachments || []).length,
  };
}

function extractCompanyName(email) {
  const fromName = email.fromName || "";
  const domainMatch = email.fromEmail?.match(/([^@]+)/);
  const domain = domainMatch ? domainMatch[1].split('.')[0] : "";
  
  // Try to extract company name from from display name
  const nameMatch = fromName.match(/(.+?)(?: [-–] |,| at )/i);
  if (nameMatch) return nameMatch[1].trim();
  
  return fromName || domain || "Unknown Company";
}

function extractContactName(email) {
  const fromName = email.fromName || "";
  if (!fromName) return email.fromEmail?.split('@')[0] || "";
  
  // Extract first part if email format is "Name <email@domain.com>"
  const nameOnly = fromName.split('<')[0].trim();
  return nameOnly;
}

function extractPhoneNumber(email) {
  // Look for phone patterns in email
  const phoneRegex = /(?:phone|mobile|contact|call)[:\s]+(\+?[0-9\s\-\(\)]{8,})/gi;
  const match = phoneRegex.exec(email.text + email.subject);
  if (match) {
    return match[1].replace(/\s/g, "");
  }
  return "";
}

function extractProjectName(email) {
  // Look for project-related keywords
  const projRegex = /(?:project|order|ref|rq|rfq)[:\s]+([^\n,;]+)/i;
  const match = projRegex.exec(email.subject + "\n" + email.text);
  return match ? match[1].trim().substring(0, 100) : "";
}

function extractItemDescription(email) {
  // Get first meaningful lines from email body
  const lines = (email.text || email.html || "")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, 5)
    .join("\n");
  
  return lines.substring(0, 500);
}

/**
 * Check for duplicate enquiries
 */
export function findDuplicateEnquiry(enquiries, email) {
  if (!enquiries || enquiries.length === 0) return null;
  
  const emailDomain = email.fromEmail?.split("@")[1];
  const similarEnquiries = enquiries.filter((enq) => {
    // Check same email
    if (enq.contactEmail === email.fromEmail) return true;
    
    // Check same domain for company emails
    if (enq.contactEmail?.includes(emailDomain)) return true;
    
    // Check similar subject
    if (enq.subject && email.subject) {
      const similarity = calculateStringSimilarity(enq.subject, email.subject);
      if (similarity > 0.7) return true;
    }
    
    // Check similar company name
    if (enq.companyName && email.fromName) {
      const similarity = calculateStringSimilarity(enq.companyName, email.fromName);
      if (similarity > 0.6) return true;
    }
    
    return false;
  });
  
  return similarEnquiries.length > 0 ? similarEnquiries[0] : null;
}

function calculateStringSimilarity(str1, str2) {
  const a = str1.toLowerCase();
  const b = str2.toLowerCase();
  const longer = a.length > b.length ? a : b;
  const shorter = longer === a ? b : a;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1, s2) {
  const costs = {};
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Create enquiry from email
 */
export function createEnquiryFromEmail(email, defaultOwnerId, autoCreate = true) {
  const details = extractEnquiryDetailsFromEmail(email);
  
  return {
    id: "enq_" + Date.now().toString(36),
    no: undefined, // Will be auto-assigned by store.nextEnquiryNo()
    date: new Date(email.date || Date.now()).toISOString().split("T")[0],
    type: "Sales",
    customerType: "New",
    customerSource: "Email",
    status: autoCreate ? "New Enquiry" : "Under Review",
    customerId: null,
    customerName: details.companyName,
    contactPerson: details.contactPerson,
    contactEmail: details.email,
    contactPhone: details.mobile,
    subject: details.subject,
    remarks: details.itemDescription,
    projectName: details.projectName,
    assignedTo: defaultOwnerId || null,
    priority: "Normal",
    lines: details.itemDescription ? [
      {
        key: Math.random().toString(36).slice(2),
        desc: details.itemDescription,
        category: "",
        qty: 1,
        unit: "Nos",
        techSpec: "",
      }
    ] : [],
    documents: (email.attachments || []).map((att, i) => ({
      type: "Email Attachment",
      name: att.filename,
      reference: `email-${email.messageId}-${i}`,
      size: att.size,
    })),
    timeline: [{
      id: "tl_" + Date.now(),
      ts: Date.now(),
      action: "created",
      by: "email-system",
      detail: `Auto-created from email from ${details.contactPerson} <${details.email}>`,
    }],
    emailSourceMessageId: email.messageId,
    emailSourceDate: email.date,
    emailSourceFrom: email.fromEmail,
    quotationIds: [],
    followups: [],
  };
}

/**
 * Log email operation for audit trail
 */
export function logEmailOperation(action, details) {
  return {
    id: "el_" + Date.now().toString(36),
    ts: Date.now(),
    action, // "email_fetched", "enquiry_created", "attachment_saved", "duplicate_detected", etc.
    ...details,
  };
}
