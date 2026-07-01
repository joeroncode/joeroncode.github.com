import { VerificationVerdict, type VerificationItemResult } from "@ordercheck/shared";

export function deriveVerdict(itemResults: VerificationItemResult[]): {
  verdict: VerificationVerdict;
  confidence: number;
} {
  if (itemResults.length === 0) {
    return { verdict: VerificationVerdict.NEEDS_REVIEW, confidence: 0 };
  }

  const matchedCount = itemResults.filter((r) => r.matched).length;
  const matchRatio = matchedCount / itemResults.length;

  if (matchRatio === 1) {
    return { verdict: VerificationVerdict.MATCH, confidence: 0.95 };
  }
  if (matchRatio === 0) {
    return { verdict: VerificationVerdict.MISMATCH, confidence: 0.9 };
  }
  return { verdict: VerificationVerdict.PARTIAL_MATCH, confidence: 0.6 };
}
