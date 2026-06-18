/** IP whitelisting — parse rules, match client IP, enforce access control. */

function normalizeIp(raw) {
  let ip = String(raw || "").trim();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  return ip;
}

export function clientIp(req) {
  const xf = req.headers["x-forwarded-for"] || req.headers["x-real-ip"];
  if (xf) return normalizeIp(String(xf).split(",")[0]);
  return normalizeIp(req.ip || req.socket?.remoteAddress || "");
}

export function parseWhitelist(allowedIps) {
  return String(allowedIps || "")
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ipv4ToLong(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function matchCidr(ip, cidr) {
  const [base, bitsStr] = String(cidr).split("/");
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipLong = ipv4ToLong(ip);
  const baseLong = ipv4ToLong(normalizeIp(base));
  if (ipLong == null || baseLong == null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipLong & mask) === (baseLong & mask);
}

export function isIpWhitelisted(ip, whitelist, opts) {
  const options = opts || {};
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  if (options.allowLocalhost !== false) {
    if (normalized === "127.0.0.1" || normalized === "localhost") return true;
  }
  const list = Array.isArray(whitelist) ? whitelist : parseWhitelist(whitelist);
  if (!list.length) return false;
  for (const entry of list) {
    const rule = entry.trim();
    if (!rule) continue;
    if (rule.includes("/")) {
      if (matchCidr(normalized, rule)) return true;
    } else if (normalized === normalizeIp(rule)) {
      return true;
    }
  }
  return false;
}

export function ipAccessSettings(state) {
  const sec = (state && state.settings && state.settings.security) || {};
  return {
    enabled: !!sec.ipRestriction,
    allowedIps: sec.allowedIps || "",
    allowLocalhost: sec.ipAllowLocalhost !== false,
    whitelist: parseWhitelist(sec.allowedIps),
  };
}

export function checkIpAccess(state, ip) {
  const cfg = ipAccessSettings(state);
  if (!cfg.enabled) return { ok: true, allowed: true };
  if (!cfg.whitelist.length) {
    return {
      ok: false,
      allowed: false,
      reason: "IP restriction is enabled but no addresses are whitelisted.",
    };
  }
  const allowed = isIpWhitelisted(ip, cfg.whitelist, { allowLocalhost: cfg.allowLocalhost });
  if (!allowed) {
    return {
      ok: false,
      allowed: false,
      reason: "Access from your network is not permitted. Contact your administrator.",
      clientIp: ip,
    };
  }
  return { ok: true, allowed: true };
}

export const IP_EXEMPT_PATHS = new Set([
  "/api/health",
  "/api/auth/client-ip",
  "/api/auth/login",
  "/api/auth/status",
  "/api/auth/system-diagnostic",
  "/api/auth/login-organizations",
  "/api/auth/diagnose-user",
  "/api/auth/test-credentials",
  "/api/auth/forgot-password/settings",
  "/api/auth/forgot-password/request",
  "/api/auth/forgot-password/verify-otp",
  "/api/auth/forgot-password/verify-questions",
  "/api/auth/forgot-password/verify-link",
  "/api/auth/forgot-password/reset",
  "/api/auth/forgot-password/approval-status",
  "/api/tenants",
]);

export function accessDeniedHtml(ip) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Access denied — Veraglo ERP</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
.card{max-width:420px;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;text-align:center}
h1{font-size:1.25rem;margin:0 0 8px}p{font-size:.9rem;opacity:.85;line-height:1.5;margin:0}
code{background:#0f172a;padding:2px 8px;border-radius:6px;font-size:.85rem}</style></head>
<body><div class="card"><h1>Access denied</h1><p>This ERP installation allows sign-in only from approved IP addresses.</p>
<p style="margin-top:12px">Your address: <code>${String(ip || "unknown").replace(/</g, "")}</code></p>
<p style="margin-top:12px;font-size:.8rem;opacity:.65">Ask your administrator to add this IP under Admin → Security → IP whitelisting.</p></div></body></html>`;
}
