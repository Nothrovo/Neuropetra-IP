/**
 * Threat Verdict Scoring Engine
 * Computes a normalized composite score (0-100) and severity verdict.
 */

export type ThreatVerdict = 'Malicious' | 'Suspicious' | 'Low risk' | 'Unknown';

export interface ScoreBreakdown {
  compositeScore: number;
  verdict: ThreatVerdict;
  verdictColor: 'red' | 'amber' | 'emerald' | 'slate';
  components: {
    abuseipdb: {
      rawScore: number | null;
      weightedScore: number;
      weight: number;
    };
    virustotal: {
      rawScore: number | null;
      weightedScore: number;
      weight: number;
    };
    localSignal: {
      rawScore: number;
      weightedScore: number;
      weight: number;
      details: {
        volumeScore: number; // based on log(alert_count)
        targetSpreadScore: number; // based on distinct targets
        recencyMultiplier: number; // recency decay factor
        criticalOutcomeBonus: number; // +35 if compromised/success
      };
    };
  };
}

export interface ScoreInput {
  abuseScore?: number | null;
  vtMalicious?: number | null;
  vtTotalEngines?: number | null;
  totalAlertCount?: number | null;
  distinctTargetsCount?: number;
  lastSeen?: string | Date | null;
  hasCriticalOutcome?: boolean;
}

const CRITICAL_OUTCOMES = new Set(['success', 'compromised', 'allowed', 'pwned', 'bypassed']);

export function isCriticalOutcome(outcome?: string | null): boolean {
  if (!outcome) return false;
  return CRITICAL_OUTCOMES.has(outcome.trim().toLowerCase());
}

/**
 * Calculates threat verdict score from external reputation & local SOC telemetry.
 */
export function calculateVerdictScore(input: ScoreInput): ScoreBreakdown {
  const hasAbuse = input.abuseScore !== null && input.abuseScore !== undefined;
  const rawAbuse = hasAbuse ? Math.max(0, Math.min(100, Number(input.abuseScore))) : null;

  // VirusTotal score calculation: either malicious engine count mapped, or ratio
  const hasVT = input.vtMalicious !== null && input.vtMalicious !== undefined;
  let rawVT: number | null = null;
  if (hasVT) {
    const malicious = Number(input.vtMalicious);
    if (input.vtTotalEngines && input.vtTotalEngines > 0) {
      rawVT = Math.min(100, Math.round((malicious / input.vtTotalEngines) * 100));
    } else {
      // Threshold mapping from sidecar
      rawVT = malicious >= 5 ? 100 : malicious >= 2 ? 60 : malicious >= 1 ? 25 : 0;
    }
  }

  // --- Local Signal Calculation (0 - 100) ---
  const alertCount = Math.max(0, Number(input.totalAlertCount || 1));
  const distinctTargets = Math.max(1, Number(input.distinctTargetsCount || 1));

  // 1. Volume component: logarithmic scaling up to 45 pts
  const volumeScore = Math.min(45, Math.round(Math.log2(alertCount + 1) * 8));

  // 2. Target spread component: up to 25 pts
  const targetSpreadScore = Math.min(25, distinctTargets * 5);

  // 3. Recency decay multiplier
  let recencyMultiplier = 0.5;
  if (input.lastSeen) {
    const lastSeenDate = new Date(input.lastSeen);
    const now = new Date();
    const hoursSinceLastSeen = Math.max(0, (now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60));

    if (hoursSinceLastSeen <= 24) {
      recencyMultiplier = 1.0;
    } else if (hoursSinceLastSeen <= 24 * 7) {
      recencyMultiplier = 0.8;
    } else if (hoursSinceLastSeen <= 24 * 30) {
      recencyMultiplier = 0.5;
    } else {
      recencyMultiplier = 0.2;
    }
  }

  // 4. Critical outcome bonus (+35 pts)
  const criticalOutcomeBonus = input.hasCriticalOutcome ? 35 : 0;

  // Base local signal
  const rawLocalSignal = Math.min(
    100,
    Math.round((volumeScore + targetSpreadScore) * recencyMultiplier + criticalOutcomeBonus)
  );

  // --- Weight Allocation & Dynamic Re-normalization ---
  let baseWeightAbuse = hasAbuse ? 0.4 : 0;
  let baseWeightVT = hasVT ? 0.3 : 0;
  let baseWeightLocal = 0.3;

  const totalBaseWeight = baseWeightAbuse + baseWeightVT + baseWeightLocal;
  const weightAbuse = Number((baseWeightAbuse / totalBaseWeight).toFixed(3));
  const weightVT = Number((baseWeightVT / totalBaseWeight).toFixed(3));
  const weightLocal = Number((1 - (weightAbuse + weightVT)).toFixed(3));

  const weightedAbuse = rawAbuse !== null ? rawAbuse * weightAbuse : 0;
  const weightedVT = rawVT !== null ? rawVT * weightVT : 0;
  const weightedLocal = rawLocalSignal * weightLocal;

  const compositeScore = Math.min(100, Math.max(0, Math.round(weightedAbuse + weightedVT + weightedLocal)));

  let verdict: ThreatVerdict = 'Unknown';
  let verdictColor: 'red' | 'amber' | 'emerald' | 'slate' = 'slate';

  if (!hasAbuse && !hasVT && alertCount <= 1 && !input.hasCriticalOutcome) {
    verdict = 'Unknown';
    verdictColor = 'slate';
  } else if (compositeScore >= 75 || input.hasCriticalOutcome) {
    verdict = 'Malicious';
    verdictColor = 'red';
  } else if (compositeScore >= 40) {
    verdict = 'Suspicious';
    verdictColor = 'amber';
  } else if (compositeScore >= 1) {
    verdict = 'Low risk';
    verdictColor = 'emerald';
  } else {
    verdict = 'Unknown';
    verdictColor = 'slate';
  }

  return {
    compositeScore,
    verdict,
    verdictColor,
    components: {
      abuseipdb: {
        rawScore: rawAbuse,
        weightedScore: Math.round(weightedAbuse),
        weight: weightAbuse,
      },
      virustotal: {
        rawScore: rawVT,
        weightedScore: Math.round(weightedVT),
        weight: weightVT,
      },
      localSignal: {
        rawScore: rawLocalSignal,
        weightedScore: Math.round(weightedLocal),
        weight: weightLocal,
        details: {
          volumeScore,
          targetSpreadScore,
          recencyMultiplier,
          criticalOutcomeBonus,
        },
      },
    },
  };
}
