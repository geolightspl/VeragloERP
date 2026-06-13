/** Customer portal — public quotation view by token. */

function sanitizeQuotation(q, customers) {
  if (!q) return null;
  const cust = (customers || []).find((c) => c.id === q.customerId) || {};
  let sub = 0;
  const lines = (q.lines || []).map((l) => {
    const qty = Number(l.qty) || 0;
    const rate = Number(l.rate) || 0;
    const disc = qty * rate * (Number(l.discountPct) || 0) / 100;
    const taxable = qty * rate - disc;
    const tax = taxable * (Number(l.taxPct) || 0) / 100;
    const lineTotal = taxable + tax;
    sub += lineTotal;
    return {
      sku: l.sku,
      name: l.name,
      desc: l.desc,
      qty,
      unit: l.unit,
      rate,
      lineTotal: Math.round(lineTotal * 100) / 100,
    };
  });
  const totals = q.totals || {};
  const grandTotal = Number(totals.final ?? totals.grand) || sub;
  return {
    no: q.no,
    rev: q.rev || 0,
    date: q.date,
    validity: q.validity,
    subject: q.subject,
    terms: q.terms,
    warranty: q.warranty,
    customerName: cust.name || q.contact || "",
    lines,
    grandTotal,
    status: q.status,
  };
}

export function findPortalLink(state, token) {
  const links = state.portalLinks || [];
  return links.find((l) => l.token === token && l.active !== false);
}

export function portalQuotePayload(state, token) {
  const link = findPortalLink(state, token);
  if (!link) return { ok: false, error: "not_found" };
  if (link.expiresAt && link.expiresAt < Date.now()) return { ok: false, error: "expired" };
  const q = (state.quotations || []).find((x) => x.id === link.entityId);
  if (!q) return { ok: false, error: "quotation_missing" };
  const quotation = sanitizeQuotation(q, state.customers);
  const co = state.company || {};
  return {
    ok: true,
    company: {
      name: co.name,
      tradeName: co.tradeName,
      logo: co.logo || co.letterheadLogo,
      email: co.salesEmail || co.email,
      phone: co.phone,
    },
    quotation,
    allowDownload: link.allowDownload !== false,
    viewCount: (link.views || []).length,
    expiresAt: link.expiresAt,
  };
}

export function recordPortalView(state, token, meta) {
  const link = findPortalLink(state, token);
  if (!link) return null;
  const view = {
    at: Date.now(),
    userAgent: (meta && meta.userAgent) || "",
    ip: (meta && meta.ip) || "",
  };
  link.views = (link.views || []).concat(view);
  const q = (state.quotations || []).find((x) => x.id === link.entityId);
  if (q) {
    q.portalViews = (q.portalViews || 0) + 1;
    q.lastPortalViewAt = view.at;
  }
  return link;
}
