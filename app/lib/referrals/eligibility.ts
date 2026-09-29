type Wallet = `0x${string}`;
const ZERO = "0x0000000000000000000000000000000000000000";

/** A user's first referrer is permanent; reciprocal referrals are allowed. */
export function canBindReferral(user: Wallet, candidate: Wallet, currentReferrer: Wallet) {
  const owner = user.toLowerCase();
  const target = candidate.toLowerCase();
  return owner !== ZERO && target !== ZERO && owner !== target
    && currentReferrer.toLowerCase() === ZERO;
}
