import { 
  dbGetStats, 
  dbRecordRequest, 
  dbClearStats 
} from './db.js';

// Reset session stats on server startup
dbClearStats('session');

/**
 * Record performance telemetry from a request
 */
export function recordRequest(perf) {
  if (!perf) return;
  const prefillTokens = perf.prefill_tokens || 0;
  const generateTokens = perf.generate_tokens || 0;
  const prefillTime = perf.prefill_time_ms || 0;
  const generateTime = perf.generate_time_ms || 0;

  dbRecordRequest(prefillTokens, generateTokens, prefillTime, generateTime);
}

/**
 * Retrieve current statistics
 */
export function getStats() {
  const defaultStats = {
    totalRequests: 0,
    totalPrefillTokens: 0,
    totalGeneratedTokens: 0,
    totalPrefillTimeMs: 0,
    totalGenerateTimeMs: 0
  };

  return {
    session: dbGetStats('session') || { ...defaultStats },
    allTime: dbGetStats('all_time') || { ...defaultStats }
  };
}

/**
 * Clear session stats
 */
export function clearSessionStats() {
  dbClearStats('session');
}

/**
 * Clear all time stats
 */
export function clearAllTimeStats() {
  dbClearStats('all_time');
}
