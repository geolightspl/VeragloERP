import { ensureBuiltInRoles } from "./auth-utils.js";

/** Ensure a fresh deployment can sign in: evaluation trial + default settings. */
export function ensureDeploymentReady(state) {
  if (!state || typeof state !== "object") return state;
  state.settings = state.settings || {};
  state.settings.activation = state.settings.activation || {};
  const act = state.settings.activation;
  const today = new Date().toISOString().slice(0, 10);

  if (!act.trialEndsAt) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    act.trialEndsAt = trialEnd.toISOString().slice(0, 10);
  }

  const trialValid = act.trialEndsAt && act.trialEndsAt >= today;
  if (!act.licenseKeyId && trialValid && act.status !== "Active") {
    act.status = "Trial";
  }

  state.settings.security = state.settings.security || {
    minPasswordLength: 8,
    maxLoginAttempts: 5,
    sessionTimeoutMins: 60,
  };

  ensureBuiltInRoles(state);
  return state;
}
