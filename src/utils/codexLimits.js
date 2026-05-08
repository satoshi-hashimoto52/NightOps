const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const DEFAULT_LIMIT5H_RESET_TIME = "00:00";
export const DEFAULT_WEEKLY_RESET_MONTH = 1;
export const DEFAULT_WEEKLY_RESET_DAY = 1;
export const DEFAULT_WEEKLY_RESET_TIME = "00:00";

export function normalizeTimeString(value, fallback = DEFAULT_LIMIT5H_RESET_TIME) {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!(hour >= 0 && hour <= 23) || !(minute >= 0 && minute <= 59)) {
    return fallback;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeHexColor(value, fallback = "#8fd3ff") {
  const color = typeof value === "string" ? value.trim() : "";
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }
  return fallback;
}

export function normalizeHexColorList(value, fallback) {
  if (!Array.isArray(value)) {
    return Array.isArray(fallback) ? fallback.slice(0, 6) : [];
  }

  const nextFallback = Array.isArray(fallback) ? fallback : [];
  const normalized = Array.from({ length: 6 }, (_, index) =>
    normalizeHexColor(value[index], nextFallback[index] || nextFallback[0] || "#8fd3ff")
  );
  return normalized;
}

export function normalizeMonth(value, fallback = DEFAULT_WEEKLY_RESET_MONTH) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 12) {
    return parsed;
  }
  return fallback;
}

export function normalizeDayOfMonth(value, fallback = DEFAULT_WEEKLY_RESET_DAY) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 31) {
    return parsed;
  }
  return fallback;
}

export function parseTimeString(value, fallbackHour = 0, fallbackMinute = 0) {
  const normalized = normalizeTimeString(value, `${String(fallbackHour).padStart(2, "0")}:${String(fallbackMinute).padStart(2, "0")}`);
  const [hour, minute] = normalized.split(":").map(Number);
  return { hour, minute };
}

export function formatTimeInput(value) {
  return normalizeTimeString(value, DEFAULT_LIMIT5H_RESET_TIME);
}

export function formatResetDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function estimateCodexTokens(text) {
  const raw = typeof text === "string" ? text : String(text ?? "");
  return Math.max(1, Math.ceil(raw.length / 4));
}

export function getCurrentLimit5hWindowStart(now, resetTime) {
  const current = now instanceof Date ? now : new Date(now);
  const nextResetAt = getNextLimit5hResetAt(current, resetTime);
  return new Date(nextResetAt.getTime() - FIVE_HOURS_MS);
}

export function getCurrentWeeklyWindowStart(now, resetMonth, resetDay, resetTime) {
  const current = now instanceof Date ? now : new Date(now);
  const month = normalizeMonth(resetMonth, DEFAULT_WEEKLY_RESET_MONTH);
  const day = normalizeDayOfMonth(resetDay, DEFAULT_WEEKLY_RESET_DAY);
  const { hour, minute } = parseTimeString(resetTime, 0, 0);
  const candidate = new Date(current);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);
  candidate.setMonth(month - 1, Math.min(day, getDaysInMonth(candidate.getFullYear(), month)));
  if (candidate > current) {
    candidate.setFullYear(candidate.getFullYear() - 1);
    candidate.setMonth(month - 1, Math.min(day, getDaysInMonth(candidate.getFullYear(), month)));
  }
  return candidate;
}

export function getNextLimit5hResetAt(now, resetTime, previousResetAt = "") {
  const current = now instanceof Date ? now : new Date(now);
  if (previousResetAt) {
    const parsedPrevious = new Date(previousResetAt);
    if (!Number.isNaN(parsedPrevious.getTime())) {
      const nextFromPrevious = new Date(parsedPrevious.getTime() + FIVE_HOURS_MS);
      while (nextFromPrevious <= current) {
        nextFromPrevious.setTime(nextFromPrevious.getTime() + FIVE_HOURS_MS);
      }
      return nextFromPrevious;
    }
  }

  const { hour, minute } = parseTimeString(resetTime, 0, 0);
  const next = new Date(current);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);

  while (next <= current) {
    next.setTime(next.getTime() + FIVE_HOURS_MS);
  }

  return next;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function getNextWeeklyResetAt(now, resetMonth, resetDay, resetTime, previousResetAt = "") {
  const current = now instanceof Date ? now : new Date(now);
  if (previousResetAt) {
    const parsedPrevious = new Date(previousResetAt);
    if (!Number.isNaN(parsedPrevious.getTime())) {
      const nextFromPrevious = new Date(parsedPrevious);
      nextFromPrevious.setFullYear(nextFromPrevious.getFullYear() + 1);
      while (nextFromPrevious <= current) {
        nextFromPrevious.setFullYear(nextFromPrevious.getFullYear() + 1);
      }
      return nextFromPrevious;
    }
  }

  const month = normalizeMonth(resetMonth, DEFAULT_WEEKLY_RESET_MONTH);
  const day = normalizeDayOfMonth(resetDay, DEFAULT_WEEKLY_RESET_DAY);
  const { hour, minute } = parseTimeString(resetTime, 0, 0);
  const next = new Date(current);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);

  const currentYear = next.getFullYear();
  const safeDay = Math.min(day, getDaysInMonth(currentYear, month));
  next.setMonth(month - 1, safeDay);

  while (next <= current) {
    next.setFullYear(next.getFullYear() + 1);
    next.setMonth(month - 1, Math.min(day, getDaysInMonth(next.getFullYear(), month)));
  }

  return next;
}

export function normalizeCodexLimitSettings(settings, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  const limit5hResetTime = normalizeTimeString(settings.limit5hResetTime, DEFAULT_LIMIT5H_RESET_TIME);
  const weeklyResetMonth = normalizeMonth(settings.weeklyResetMonth, DEFAULT_WEEKLY_RESET_MONTH);
  const weeklyResetDay = normalizeDayOfMonth(settings.weeklyResetDay, DEFAULT_WEEKLY_RESET_DAY);
  const weeklyResetTime = normalizeTimeString(settings.weeklyResetTime, DEFAULT_WEEKLY_RESET_TIME);
  const parsedLimit5hNextResetAt = settings.limit5hNextResetAt ? new Date(settings.limit5hNextResetAt) : null;
  const parsedWeeklyNextResetAt = settings.weeklyNextResetAt ? new Date(settings.weeklyNextResetAt) : null;
  const limit5hNextResetAt =
    parsedLimit5hNextResetAt && !Number.isNaN(parsedLimit5hNextResetAt.getTime())
      ? parsedLimit5hNextResetAt
      : getNextLimit5hResetAt(current, limit5hResetTime);
  const weeklyNextResetAt =
    parsedWeeklyNextResetAt && !Number.isNaN(parsedWeeklyNextResetAt.getTime())
      ? parsedWeeklyNextResetAt
      : getNextWeeklyResetAt(current, weeklyResetMonth, weeklyResetDay, weeklyResetTime);

  return {
    limit5hResetTime,
    weeklyResetMonth,
    weeklyResetDay,
    weeklyResetTime,
    limit5hNextResetAt: limit5hNextResetAt.toISOString(),
    weeklyNextResetAt: weeklyNextResetAt.toISOString()
  };
}

export function needsReset(nextResetAt, now = new Date()) {
  if (!nextResetAt) {
    return false;
  }

  const current = now instanceof Date ? now : new Date(now);
  const parsed = new Date(nextResetAt);
  return !Number.isNaN(parsed.getTime()) && parsed <= current;
}

export function getLimitUsageRemaining(tokenEstimate, baselineTokenEstimate, divisor) {
  const windowTokens = Math.max(0, Number(tokenEstimate) - Number(baselineTokenEstimate || 0));
  const scale = Number(divisor) > 0 ? Number(divisor) : 1;
  return Math.max(0, 100 - windowTokens / scale);
}

export function calculateUsage({
  requestCount = 0,
  tokenEstimate = 0,
  modelFactor = 1,
  weeklyDivisor = 750,
  limit5hDivisor = 350,
  weeklyBaselineTokenEstimate = 0,
  limit5hBaselineTokenEstimate = 0,
  weeklyUsedTokenEstimate = 0,
  limit5hUsedTokenEstimate = 0
} = {}) {
  const safeRequestCount = Math.max(0, Number(requestCount) || 0);
  const safeTokenEstimate = Math.max(0, Number(tokenEstimate) || 0);
  const safeModelFactor = Number(modelFactor) > 0 ? Number(modelFactor) : 1;
  const safeWeeklyDivisor = Number(weeklyDivisor) > 0 ? Number(weeklyDivisor) : 1;
  const safeLimit5hDivisor = Number(limit5hDivisor) > 0 ? Number(limit5hDivisor) : 1;
  const safeWeeklyBaselineTokenEstimate = Number.isFinite(Number(weeklyBaselineTokenEstimate))
    ? Number(weeklyBaselineTokenEstimate)
    : 0;
  const safeLimit5hBaselineTokenEstimate = Number.isFinite(Number(limit5hBaselineTokenEstimate))
    ? Number(limit5hBaselineTokenEstimate)
    : 0;
  const safeWeeklyUsedTokenEstimate = Math.max(0, Number(weeklyUsedTokenEstimate) || 0);
  const safeLimit5hUsedTokenEstimate = Math.max(0, Number(limit5hUsedTokenEstimate) || 0);
  const remainingWeeklyTokens = Math.max(0, safeWeeklyBaselineTokenEstimate - safeWeeklyUsedTokenEstimate);
  const remainingLimit5hTokens = Math.max(0, safeLimit5hBaselineTokenEstimate - safeLimit5hUsedTokenEstimate);
  const weeklyRemaining = safeWeeklyBaselineTokenEstimate > 0 ? (remainingWeeklyTokens / safeWeeklyBaselineTokenEstimate) * 100 : 0;
  const limit5hRemaining = safeLimit5hBaselineTokenEstimate > 0 ? (remainingLimit5hTokens / safeLimit5hBaselineTokenEstimate) * 100 : 0;

  console.log({
    baseline: {
      weekly: safeWeeklyBaselineTokenEstimate,
      limit5h: safeLimit5hBaselineTokenEstimate
    },
    used: {
      weekly: safeWeeklyUsedTokenEstimate,
      limit5h: safeLimit5hUsedTokenEstimate
    },
    remaining: {
      weekly: remainingWeeklyTokens,
      limit5h: remainingLimit5hTokens
    }
  });

  return {
    weeklyRemaining,
    limit5hRemaining,
    weeklyRemainingTokens: remainingWeeklyTokens,
    limit5hRemainingTokens: remainingLimit5hTokens,
    weeklyUsedTokenEstimate: safeWeeklyUsedTokenEstimate,
    limit5hUsedTokenEstimate: safeLimit5hUsedTokenEstimate,
    weeklyBaselineTokenEstimate: safeWeeklyBaselineTokenEstimate,
    limit5hBaselineTokenEstimate: safeLimit5hBaselineTokenEstimate
  };
}
