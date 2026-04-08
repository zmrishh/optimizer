import semver from 'semver';

/**
 * Calculates a severity score and confidence level for fixing the duplicate.
 * @param {Array} duplicates The raw duplicate analysis
 * @returns {Array} Duplicates with embedded severity/confidence scores
 */
export function scoreDuplicates(duplicates) {
  const scored = duplicates.map(dup => {
    let severity = 'LOW';
    // Update severity based on counts based on user prompt (e.g. 4+ -> HIGH)
    if (dup.totalInstances >= 4 || dup.wastedBytes > 200 * 1024) {
      severity = 'HIGH';
    } else if (dup.totalInstances >= 2 || dup.wastedBytes > 50 * 1024) {
      severity = 'MEDIUM';
    }

    let confidence = 'LOW';
    if (dup.safety === 'SAFE') {
      confidence = 'HIGH';
    } else if (dup.details && dup.details.length > 0 && dup.details[0].count >= dup.totalInstances * 0.8) {
      confidence = 'MEDIUM';
    }

    let severityWeight = 10;
    if (severity === 'HIGH') severityWeight = 100;
    else if (severity === 'MEDIUM') severityWeight = 50;
    
    const score = (dup.totalInstances * 10) + severityWeight;

    return {
      ...dup,
      severity,
      confidence,
      score
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}
