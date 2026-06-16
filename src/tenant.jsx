/* Veraglo ERP — multi-tenant client context (organization isolation). */
(function (VG) {
  const SLUG_KEY = "veraglo-tenant-slug";
  const DEFAULT = "default";

  function normalizeSlug(raw) {
    const s = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    return s || DEFAULT;
  }

  function currentSlug() {
    return normalizeSlug(localStorage.getItem(SLUG_KEY) || DEFAULT);
  }

  function setSlug(slug) {
    const next = normalizeSlug(slug);
    localStorage.setItem(SLUG_KEY, next);
    return next;
  }

  function useDefault() {
    return setSlug(DEFAULT);
  }

  function storageKey(base) {
    return String(base || "veraglo-erp-db") + ":" + currentSlug();
  }

  function headers(extra) {
    return Object.assign({ "X-Tenant-Slug": currentSlug() }, extra || {});
  }

  function apiBase() {
    return (typeof VG.apiBase === "function" ? VG.apiBase() : "") || "";
  }

  async function listTenants() {
    const res = await fetch(apiBase() + "/api/tenants");
    if (!res.ok) throw new Error("Could not load organizations");
    const body = await res.json();
    return body.tenants || [];
  }

  async function fetchApi(path, opts) {
    const o = opts || {};
    const h = headers(o.headers);
    if (o.body && !h["Content-Type"]) h["Content-Type"] = "application/json";
    return fetch(apiBase() + path, Object.assign({}, o, { headers: h }));
  }

  async function switchTenant(slug) {
    setSlug(slug);
    if (VG.store && VG.store.init) {
      await VG.store.init();
    }
    if (typeof window !== "undefined") window.location.reload();
  }

  VG.tenant = {
    DEFAULT,
    currentSlug,
    setSlug,
    useDefault,
    storageKey,
    headers,
    fetchApi,
    listTenants,
    switchTenant,
    primaryLabel: function () {
      const s = currentSlug();
      return s === DEFAULT ? "Default Organization" : s;
    },
  };

  try { setSlug(localStorage.getItem(SLUG_KEY)); } catch (e) { setSlug(DEFAULT); }

  /* Raw IP hostnames used to resolve tenant slug "13" from 13.x.x.x — reset bogus numeric org codes. */
  try {
    const host = typeof window !== "undefined" ? (window.location.hostname || "") : "";
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const cur = normalizeSlug(localStorage.getItem(SLUG_KEY));
      if (/^\d+$/.test(cur)) useDefault();
    }
  } catch (e) { /* noop */ }
})(window.VG);
