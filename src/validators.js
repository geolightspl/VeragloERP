/* Veraglo ERP — Shared field validators (GST / PAN / email / mobile / IFSC / PIN) */
(function (VG) {
  const RX = {
    gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/,
    pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
    ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
    pin: /^[0-9]{6}$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    // Indian mobile: optional +91/0 prefix, 10 digits starting 6-9
    mobile: /^(?:\+?91[-\s]?|0)?[6-9]\d{9}$/,
  };

  function isEmail(v) { return !v || RX.email.test(String(v).trim()); }
  function isMobile(v) { return !v || RX.mobile.test(String(v).replace(/[\s-]/g, "")); }
  function isGSTIN(v) { return !v || RX.gstin.test(String(v).trim().toUpperCase()); }
  function isPAN(v) { return !v || RX.pan.test(String(v).trim().toUpperCase()); }
  function isIFSC(v) { return !v || RX.ifsc.test(String(v).trim().toUpperCase()); }
  function isPIN(v) { return !v || RX.pin.test(String(v).trim()); }

  function normalizeKey(v) {
    return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, " ");
  }
  function digitsOnly(v) {
    return String(v == null ? "" : v).replace(/\D/g, "");
  }

  /**
   * Validate a record's standard fields. Returns { ok, message, errors[] }.
   * Only checks fields that are present (non-empty).
   */
  function validateRecord(obj, opts) {
    const o = obj || {};
    const errors = [];
    if (o.email && !isEmail(o.email)) errors.push("Invalid email address");
    if (o.mobile && !isMobile(o.mobile)) errors.push("Invalid mobile number (expected 10-digit Indian mobile)");
    if (o.phone && !isMobile(o.phone)) errors.push("Invalid phone number");
    if (o.gstin && !isGSTIN(o.gstin)) errors.push("Invalid GSTIN format");
    if (o.pan && !isPAN(o.pan)) errors.push("Invalid PAN format");
    if (o.ifsc && !isIFSC(o.ifsc)) errors.push("Invalid IFSC code");
    if (o.pincode && !isPIN(o.pincode)) errors.push("Invalid PIN code");
    if (opts && opts.require) {
      opts.require.forEach((f) => {
        if (!o[f] || !String(o[f]).trim()) errors.push((opts.labels && opts.labels[f]) || f + " is required");
      });
    }
    return { ok: errors.length === 0, message: errors.join("; "), errors };
  }

  VG.validators = {
    RX, isEmail, isMobile, isGSTIN, isPAN, isIFSC, isPIN,
    normalizeKey, digitsOnly, validateRecord,
  };
})(window.VG);
