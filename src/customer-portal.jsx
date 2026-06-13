/* Veraglo ERP — customer portal helpers + admin link management. */
(function (VG) {
  const store = VG.store;

  function randomToken() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  function portalBaseUrl() {
    if (typeof window !== "undefined" && window.location) {
      return window.location.origin + "/portal.html";
    }
    return "/portal.html";
  }

  function createQuotationPortalLink(quotationId, actor, opts) {
    const q = store.get("quotations", quotationId);
    if (!q) return null;
    const cfg = (store.settings().customerPortal) || {};
    const days = (opts && opts.expiryDays) || cfg.defaultExpiryDays || 30;
    const expiresAt = Date.now() + days * 86400000;
    const existing = store.list("portalLinks").find((l) => l.entityType === "quotations" && l.entityId === quotationId && l.active && l.expiresAt > Date.now());
    if (existing) return { ...existing, url: portalBaseUrl() + "?t=" + existing.token };
    const token = randomToken();
    const link = store.create("portalLinks", {
      token,
      entityType: "quotations",
      entityId: quotationId,
      entityNo: q.no,
      customerId: q.customerId,
      active: true,
      expiresAt,
      views: [],
      allowDownload: cfg.allowDownload !== false,
      createdBy: actor,
    }, actor);
    return { ...link, url: portalBaseUrl() + "?t=" + token };
  }

  function portalLinkForQuotation(quotationId) {
    const l = store.list("portalLinks").find((x) => x.entityType === "quotations" && x.entityId === quotationId && x.active && x.expiresAt > Date.now());
    return l ? { ...l, url: portalBaseUrl() + "?t=" + l.token } : null;
  }

  function revokePortalLink(linkId, actor) {
    store.update("portalLinks", linkId, { active: false, revokedAt: Date.now() }, actor);
  }

  async function copyPortalUrl(url) {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(url);
      else {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      VG.toast("Portal link copied");
      return true;
    } catch (e) {
      VG.toast("Copy failed — select link manually", "warn");
      return false;
    }
  }

  VG.customerPortal = {
    createQuotationPortalLink,
    portalLinkForQuotation,
    revokePortalLink,
    copyPortalUrl,
    portalBaseUrl,
  };
})(window.VG);
