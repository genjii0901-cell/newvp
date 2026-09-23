export type TrialOffer = "first" | "winback" | null;

type TrialProfile = {
  trial_used?: unknown;
  winback_trial_used?: unknown;
  winback_trial_eligible_at?: unknown;
};

export const TRIAL_DAYS = 7;
export const WINBACK_WAIT_DAYS = 90;

export function getTrialOffer(profile: TrialProfile | null | undefined, now = new Date()): TrialOffer {
  if (!profile?.trial_used) return "first";
  if (profile.winback_trial_used) return null;

  const eligibleAt =
    typeof profile.winback_trial_eligible_at === "string"
      ? new Date(profile.winback_trial_eligible_at)
      : null;

  if (!eligibleAt || Number.isNaN(eligibleAt.getTime()) || eligibleAt > now) return null;
  return "winback";
}

export function getWinbackEligibleAt(from = new Date()) {
  return new Date(from.getTime() + WINBACK_WAIT_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
