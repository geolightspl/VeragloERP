/** Password policy validation — shared by reset flow and admin settings. */

export function passwordPolicy(sec) {
  const s = sec || {};
  return {
    minLength: Number(s.minPasswordLength) || 8,
    requireUpper: s.passwordRequireUpper !== false,
    requireLower: s.passwordRequireLower !== false,
    requireNumber: s.passwordRequireNumber !== false,
    requireSpecial: s.passwordRequireSpecial !== false,
  };
}

export function validatePassword(pwd, sec) {
  const p = passwordPolicy(sec);
  const text = String(pwd || "");
  const errors = [];
  if (text.length < p.minLength) errors.push(`At least ${p.minLength} characters`);
  if (p.requireUpper && !/[A-Z]/.test(text)) errors.push("One uppercase letter");
  if (p.requireLower && !/[a-z]/.test(text)) errors.push("One lowercase letter");
  if (p.requireNumber && !/\d/.test(text)) errors.push("One number");
  if (p.requireSpecial && !/[^A-Za-z0-9]/.test(text)) errors.push("One special character");
  return { ok: errors.length === 0, errors, policy: p };
}

export function passwordStrength(pwd, sec) {
  const text = String(pwd || "");
  if (!text) return { level: "weak", score: 0, label: "Weak" };
  let score = 0;
  if (text.length >= 8) score++;
  if (text.length >= 12) score++;
  if (/[A-Z]/.test(text)) score++;
  if (/[a-z]/.test(text)) score++;
  if (/\d/.test(text)) score++;
  if (/[^A-Za-z0-9]/.test(text)) score++;
  const valid = validatePassword(text, sec);
  if (!valid.ok) return score <= 2 ? { level: "weak", score, label: "Weak" } : { level: "medium", score, label: "Medium" };
  return score >= 5 ? { level: "strong", score, label: "Strong" } : { level: "medium", score, label: "Medium" };
}

export function generateTempPassword(sec) {
  const p = passwordPolicy(sec);
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const len = Math.max(p.minLength, 10);
  const chars = [];
  if (p.requireUpper) chars.push(upper[Math.floor(Math.random() * upper.length)]);
  if (p.requireLower) chars.push(lower[Math.floor(Math.random() * lower.length)]);
  if (p.requireNumber) chars.push(digits[Math.floor(Math.random() * digits.length)]);
  if (p.requireSpecial) chars.push(special[Math.floor(Math.random() * special.length)]);
  while (chars.length < len) chars.push(all[Math.floor(Math.random() * all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
