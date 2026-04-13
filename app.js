// === SimpleTri — Training Plan Generator ===

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKLY_HOURS_ORDER = ['lt3', '3-6', '6-10', '10-15', '15+'];
const WEEKLY_HOURS_LABELS = {
  'lt3': 'minder dan 3 uur',
  '3-6': '3-6 uur',
  '6-10': '6-10 uur',
  '10-15': '10-15 uur',
  '15+': '15+ uur',
};
const DISCIPLINE_LABELS_NL = {
  run: 'loop',
  bike: 'fiets',
  swim: 'zwem',
  strength: 'kracht',
};
const READINESS_TIER_LABELS_NL = {
  novice: 'starter',
  developing: 'opbouw',
  durable: 'duurzaam',
};
const RISK_LEVEL_LABELS_NL = {
  low: 'laag',
  moderate: 'matig',
  high: 'hoog',
  unsafe: 'onveilig',
};

// Race distances in km: [swim, bike, run]
const RACE_LABELS = {
  sprint: 'Sprint',
  quarter: 'Quarter',
  olympic: 'Olympic',
  half: 'Half Ironman',
  full: 'Ironman',
};

const RACE_DISTANCES = {
  sprint:  { swim: 0.75,  bike: 20,  run: 5 },
  quarter: { swim: 1.0,   bike: 40,  run: 10 },
  olympic: { swim: 1.5,   bike: 40,  run: 10 },
  half:    { swim: 1.9,   bike: 90,  run: 21.1 },
  full:    { swim: 3.8,   bike: 180, run: 42.2 },
};

// === Fitness Level System ===

function parseTime(str) {
  if (!str) return null;
  const parts = str.trim().split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0]), s = parseInt(parts[1]);
    if (isNaN(m) || isNaN(s) || s >= 60 || m < 0 || s < 0) return null;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const h = parseInt(parts[0]), m = parseInt(parts[1]), s = parseInt(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s) || m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

function clampLevel(numeric) {
  if (numeric <= 0) return 'beginner';
  if (numeric >= 2) return 'advanced';
  return 'intermediate';
}

const LEVEL_NUM = { beginner: 0, intermediate: 1, advanced: 2 };

function levelFromNum(n) {
  if (n <= 0) return 'beginner';
  if (n >= 2) return 'advanced';
  return 'intermediate';
}

function maxLevel(...levels) {
  const max = levels
    .map(level => LEVEL_NUM[level])
    .filter(n => Number.isFinite(n))
    .reduce((best, curr) => Math.max(best, curr), 0);
  return levelFromNum(max);
}

function applyLevelCeiling(level, ceiling) {
  if (!level || !ceiling) return level;
  const levelNum = LEVEL_NUM[level];
  const ceilingNum = LEVEL_NUM[ceiling];
  if (!Number.isFinite(levelNum) || !Number.isFinite(ceilingNum)) return level;
  return levelNum > ceilingNum ? ceiling : level;
}

function bumpLevel(level) {
  if (level === 'beginner') return 'intermediate';
  if (level === 'intermediate') return 'advanced';
  return 'advanced';
}

// Experience x hours → base numeric level (0 = beginner, 1 = intermediate, 2 = advanced)
const PROFILE_MATRIX = {
  'new':  { 'lt3': 0, '3-6': 0, '6-10': 0, '10-15': 1, '15+': 1 },
  'lt1':  { 'lt3': 0, '3-6': 0, '6-10': 1, '10-15': 1, '15+': 1 },
  '1-3':  { 'lt3': 0, '3-6': 1, '6-10': 1, '10-15': 1, '15+': 2 },
  '3+':   { 'lt3': 0, '3-6': 1, '6-10': 1, '10-15': 2, '15+': 2 },
};

function estimateLevelFromProfile(experience, weeklyHours, strongestDiscipline) {
  const row = PROFILE_MATRIX[experience];
  if (!row) return { run: 'beginner', bike: 'beginner', swim: 'beginner' };
  const baseNum = row[weeklyHours] ?? 0;
  const base = clampLevel(baseNum);

  const result = { run: base, bike: base, swim: base };

  if (strongestDiscipline && strongestDiscipline !== 'balanced' && result[strongestDiscipline]) {
    result[strongestDiscipline] = bumpLevel(result[strongestDiscipline]);
  }

  return result;
}

// Simplified VDOT-style conversion: equivalent 5K seconds from other distances
const RUN_DISTANCE_FACTOR = {
  '5k': 1,
  '10k': 0.4816,
  'hm': 0.2173,
  'marathon': 0.1026,
};

function normalizeRunBenchmark(distance, timeStr) {
  const totalSecs = parseTime(timeStr);
  if (!totalSecs || totalSecs <= 0) return null;
  const factor = RUN_DISTANCE_FACTOR[distance];
  if (!factor) return null;
  const equiv5kSecs = totalSecs * factor;
  if (equiv5kSecs < 20 * 60) return 'advanced';
  if (equiv5kSecs < 25 * 60) return 'intermediate';
  return 'beginner';
}

// Convert swim times to 100m pace, then classify
const SWIM_DISTANCE_DIVISOR = { '100m': 1, '400m': 4.15, '1500m': 16 };

function normalizeSwimBenchmark(distance, timeStr) {
  const totalSecs = parseTime(timeStr);
  if (!totalSecs || totalSecs <= 0) return null;
  const divisor = SWIM_DISTANCE_DIVISOR[distance];
  if (!divisor) return null;
  const pace100m = totalSecs / divisor;
  if (pace100m < 90) return 'advanced';
  if (pace100m < 120) return 'intermediate';
  return 'beginner';
}

function normalizeBikeBenchmark(type, valueStr) {
  const num = parseFloat(valueStr);
  if (!num || num <= 0) return null;
  if (type === 'ftp') {
    if (num > 250) return 'advanced';
    if (num > 180) return 'intermediate';
    return 'beginner';
  }
  if (num > 32) return 'advanced';
  if (num > 26) return 'intermediate';
  return 'beginner';
}

function normalizeCapacityLevel(discipline, capacityMinutes) {
  const mins = parseCapacityMinutes(capacityMinutes);
  if (!mins) return null;
  if (discipline === 'run') {
    if (mins >= 60) return 'advanced';
    if (mins >= 35) return 'intermediate';
    return 'beginner';
  }
  if (discipline === 'bike') {
    if (mins >= 120) return 'advanced';
    if (mins >= 60) return 'intermediate';
    return 'beginner';
  }
  if (discipline === 'swim') {
    if (mins >= 45) return 'advanced';
    if (mins >= 25) return 'intermediate';
    return 'beginner';
  }
  return null;
}

function getCapacityLevelCeiling(discipline, capacityMinutes) {
  const mins = parseCapacityMinutes(capacityMinutes);
  if (!mins) return null;
  const noviceUnlock = INTENSITY_UNLOCKS.novice?.[discipline];
  const normalized = normalizeCapacityLevel(discipline, mins);
  if (!Number.isFinite(noviceUnlock)) return normalized;
  if (mins < noviceUnlock) return 'beginner';
  return normalized;
}

function getFitnessLevels(profileData, benchmarkData) {
  const estimated = estimateLevelFromProfile(
    profileData.experience, profileData.weeklyHours, profileData.strongest
  );

  const runBench = benchmarkData.runTime
    ? normalizeRunBenchmark(benchmarkData.runDist, benchmarkData.runTime)
    : null;
  const bikeBench = benchmarkData.bikeValue
    ? normalizeBikeBenchmark(benchmarkData.bikeType, benchmarkData.bikeValue)
    : null;
  const swimBench = benchmarkData.swimTime
    ? normalizeSwimBenchmark(benchmarkData.swimDist, benchmarkData.swimTime)
    : null;

  const runCapacityLevel = normalizeCapacityLevel('run', profileData.runCapacity);
  const bikeCapacityLevel = normalizeCapacityLevel('bike', profileData.bikeCapacity);
  const swimCapacityLevel = normalizeCapacityLevel('swim', profileData.swimCapacity);
  const runCapacityCeiling = getCapacityLevelCeiling('run', profileData.runCapacity);
  const bikeCapacityCeiling = getCapacityLevelCeiling('bike', profileData.bikeCapacity);
  const swimCapacityCeiling = getCapacityLevelCeiling('swim', profileData.swimCapacity);

  const uncappedRun = maxLevel(estimated.run, runBench, runCapacityLevel);
  const uncappedBike = maxLevel(estimated.bike, bikeBench, bikeCapacityLevel);
  const uncappedSwim = maxLevel(estimated.swim, swimBench, swimCapacityLevel);

  const finalRun = applyLevelCeiling(uncappedRun, runCapacityCeiling);
  const finalBike = applyLevelCeiling(uncappedBike, bikeCapacityCeiling);
  const finalSwim = applyLevelCeiling(uncappedSwim, swimCapacityCeiling);

  return {
    run: {
      level: finalRun,
      source: finalRun !== uncappedRun ? 'capacity' :
        runBench === finalRun ? 'measured' :
        runCapacityLevel === finalRun ? 'capacity' : 'estimated'
    },
    bike: {
      level: finalBike,
      source: finalBike !== uncappedBike ? 'capacity' :
        bikeBench === finalBike ? 'measured' :
        bikeCapacityLevel === finalBike ? 'capacity' : 'estimated'
    },
    swim: {
      level: finalSwim,
      source: finalSwim !== uncappedSwim ? 'capacity' :
        swimBench === finalSwim ? 'measured' :
        swimCapacityLevel === finalSwim ? 'capacity' : 'estimated'
    },
  };
}

function isProfileComplete() {
  const exp = document.getElementById('tri-experience').value;
  const hrs = document.getElementById('weekly-hours').value;
  const str = document.getElementById('strongest-discipline').value;
  return exp !== '' && hrs !== '' && str !== '';
}

// === Duration Calculations ===

// Base per-session minutes per discipline per level (start of plan)
const BASE_MINUTES = {
  run:      { beginner: 30, intermediate: 35, advanced: 40 },
  bike:     { beginner: 45, intermediate: 50, advanced: 60 },
  swim:     { beginner: 30, intermediate: 35, advanced: 40 },
  strength: { beginner: 30, intermediate: 35, advanced: 40 },
};

// Peak per-session minutes (end of plan, pre-taper)
const PEAK_MINUTES = {
  sprint: {
    run:  { beginner: 35, intermediate: 40, advanced: 50 },
    bike: { beginner: 60, intermediate: 75, advanced: 90 },
    swim: { beginner: 35, intermediate: 40, advanced: 45 },
  },
  quarter: {
    run:  { beginner: 40, intermediate: 50, advanced: 60 },
    bike: { beginner: 70, intermediate: 85, advanced: 100 },
    swim: { beginner: 40, intermediate: 45, advanced: 55 },
  },
  olympic: {
    run:  { beginner: 45, intermediate: 55, advanced: 65 },
    bike: { beginner: 75, intermediate: 90, advanced: 105 },
    swim: { beginner: 45, intermediate: 50, advanced: 60 },
  },
  half: {
    run:  { beginner: 55, intermediate: 65, advanced: 80 },
    bike: { beginner: 90, intermediate: 110, advanced: 130 },
    swim: { beginner: 50, intermediate: 55, advanced: 65 },
  },
  full: {
    run:  { beginner: 60, intermediate: 75, advanced: 90 },
    bike: { beginner: 105, intermediate: 130, advanced: 150 },
    swim: { beginner: 55, intermediate: 65, advanced: 75 },
  },
};

const LOAD_PRESETS = {
  mild: {
    weeklyHoursTarget: {
      'lt3': 150,
      '3-6': 260,
      '6-10': 450,
      '10-15': 720,
      '15+': 930,
    },
    longSessionMultiplier: {
      sprint:  { run: 1.45, bike: 1.45, swim: 1.15 },
      quarter: { run: 1.55, bike: 1.70, swim: 1.20 },
      olympic: { run: 1.65, bike: 1.80, swim: 1.25 },
      half:    { run: 1.85, bike: 2.30, swim: 1.30 },
      full:    { run: 2.20, bike: 2.70, swim: 1.35 },
    },
    disciplinePeakFloorRatio: { run: 0.80, bike: 0.78, swim: 0.70 },
    scaleFactorCapsByPhaseAndHours: {
      base:  { 'lt3': 1.02, '3-6': 1.05, '6-10': 1.08, '10-15': 1.10, '15+': 1.12 },
      build: { 'lt3': 1.05, '3-6': 1.08, '6-10': 1.12, '10-15': 1.15, '15+': 1.18 },
      peak:  { 'lt3': 1.08, '3-6': 1.12, '6-10': 1.16, '10-15': 1.20, '15+': 1.24 },
    },
    strengthBudget: {
      reservePerSession: 40,
      minEnduranceBudget: 120,
    },
    phaseBudgetMultiplier: {
      base: 0.82,
      build: 0.96,
      peak: 1.20,
      taper: 0.72,
    },
    lowFrequencyLongGuard: {
      sessionThreshold: 1,
      multiplierFactor: { run: 0.92, bike: 0.82, swim: 0.88 },
      longIncreaseFactor: { run: 0.90, bike: 0.75, swim: 0.85 },
      minLongIncreaseCap: { run: 6, bike: 8, swim: 5 },
    },
    budgetSafeFloorRatio: 1.00,
  },
  balanced: {
    weeklyHoursTarget: {
      'lt3': 150,
      '3-6': 270,
      '6-10': 480,
      '10-15': 750,
      '15+': 960,
    },
    longSessionMultiplier: {
      sprint:  { run: 1.5, bike: 1.5, swim: 1.20 },
      quarter: { run: 1.6, bike: 1.7, swim: 1.25 },
      olympic: { run: 1.7, bike: 1.8, swim: 1.30 },
      half:    { run: 2.0, bike: 2.5, swim: 1.35 },
      full:    { run: 2.5, bike: 3.0, swim: 1.40 },
    },
    disciplinePeakFloorRatio: { run: 0.85, bike: 0.80, swim: 0.75 },
    scaleFactorCapsByPhaseAndHours: {
      base:  { 'lt3': 1.05, '3-6': 1.08, '6-10': 1.12, '10-15': 1.16, '15+': 1.20 },
      build: { 'lt3': 1.08, '3-6': 1.12, '6-10': 1.18, '10-15': 1.24, '15+': 1.30 },
      peak:  { 'lt3': 1.12, '3-6': 1.18, '6-10': 1.26, '10-15': 1.34, '15+': 1.42 },
    },
    strengthBudget: {
      reservePerSession: 35,
      minEnduranceBudget: 120,
    },
    phaseBudgetMultiplier: {
      base: 0.85,
      build: 1.00,
      peak: 1.15,
      taper: 0.75,
    },
    lowFrequencyLongGuard: {
      sessionThreshold: 1,
      multiplierFactor: { run: 0.96, bike: 0.88, swim: 0.92 },
      longIncreaseFactor: { run: 0.95, bike: 0.82, swim: 0.90 },
      minLongIncreaseCap: { run: 8, bike: 10, swim: 6 },
    },
    budgetSafeFloorRatio: 1.05,
  },
  assertive: {
    weeklyHoursTarget: {
      'lt3': 170,
      '3-6': 300,
      '6-10': 520,
      '10-15': 810,
      '15+': 1020,
    },
    longSessionMultiplier: {
      sprint:  { run: 1.55, bike: 1.55, swim: 1.20 },
      quarter: { run: 1.7, bike: 1.85, swim: 1.30 },
      olympic: { run: 1.8, bike: 2.0, swim: 1.35 },
      half:    { run: 2.1, bike: 2.6, swim: 1.40 },
      full:    { run: 2.6, bike: 3.1, swim: 1.45 },
    },
    disciplinePeakFloorRatio: { run: 0.88, bike: 0.82, swim: 0.78 },
    scaleFactorCapsByPhaseAndHours: {
      base:  { 'lt3': 1.08, '3-6': 1.12, '6-10': 1.18, '10-15': 1.24, '15+': 1.30 },
      build: { 'lt3': 1.12, '3-6': 1.18, '6-10': 1.26, '10-15': 1.34, '15+': 1.42 },
      peak:  { 'lt3': 1.16, '3-6': 1.24, '6-10': 1.34, '10-15': 1.44, '15+': 1.52 },
    },
    strengthBudget: {
      reservePerSession: 30,
      minEnduranceBudget: 140,
    },
    phaseBudgetMultiplier: {
      base: 0.90,
      build: 1.05,
      peak: 1.15,
      taper: 0.78,
    },
    lowFrequencyLongGuard: {
      sessionThreshold: 1,
      multiplierFactor: { run: 0.98, bike: 0.92, swim: 0.95 },
      longIncreaseFactor: { run: 0.96, bike: 0.88, swim: 0.92 },
      minLongIncreaseCap: { run: 8, bike: 12, swim: 6 },
    },
    budgetSafeFloorRatio: 1.10,
  },
};
const DEFAULT_LOAD_PRESET = 'mild';

function resolveLoadPresetConfig(presetName = DEFAULT_LOAD_PRESET) {
  return LOAD_PRESETS[presetName] || LOAD_PRESETS[DEFAULT_LOAD_PRESET] || LOAD_PRESETS.balanced;
}

const ACTIVE_LOAD_PRESET = DEFAULT_LOAD_PRESET;
const ACTIVE_LOAD_CONFIG = resolveLoadPresetConfig(ACTIVE_LOAD_PRESET);
const LONG_SESSION_MULTIPLIER = ACTIVE_LOAD_CONFIG.longSessionMultiplier;

const MAX_LONG_DURATION = { run: 150, bike: 300, swim: 90 };

// Taper length in weeks by race distance
const TAPER_WEEKS = {
  sprint:  1,
  quarter: 1,
  olympic: 1,
  half:    1,
  full:    2,
};

const RACE_WEEK_SESSION_CAPS = {
  sprint:  { run: 1, bike: 1, swim: 1, strength: 0 },
  quarter: { run: 1, bike: 1, swim: 1, strength: 0 },
  olympic: { run: 1, bike: 1, swim: 1, strength: 0 },
  half:    { run: 2, bike: 2, swim: 1, strength: 0 },
  full:    { run: 2, bike: 2, swim: 1, strength: 0 },
};

const RACE_EVENT_DURATION_MINUTES = {
  sprint: 90,
  quarter: 150,
  olympic: 180,
  half: 360,
  full: 720,
};

// Brick run duration (minutes) by race distance
const BRICK_RUN_MINUTES = {
  sprint:  10,
  quarter: 15,
  olympic: 15,
  half:    20,
  full:    25,
};

// Training phase splits (fraction of pre-taper weeks)
const PHASE_SPLITS = {
  base:  0.40,
  build: 0.35,
  peak:  0.25,
};

// Target weekly non-strength minutes by hours setting (preset-driven).
const WEEKLY_HOURS_TARGET = ACTIVE_LOAD_CONFIG.weeklyHoursTarget;

const SESSION_MIN_MINUTES = { run: 15, bike: 20, swim: 15 };

// === Safety Guardrails ===

const SAFE_START_FRACTION = 0.8;
const CAPACITY_FLOORS = { run: 10, bike: 20, swim: 10 };
const CAPACITY_FALLBACK_START = { run: 20, bike: 35, swim: 20 };
const CAPACITY_START_BOOST_CAP = { run: 25, bike: 45, swim: 20 };
const MIN_PROGRESS_STEP = { run: 5, bike: 5, swim: 5 };
const READINESS_ORDER = ['novice', 'developing', 'durable'];
const RISK_ORDER = ['low', 'moderate', 'high', 'unsafe'];

const PROGRESSION_CAPS = {
  novice:    { pctCap: 0.06, absMinuteCap: 8, longIncreaseCap: 10 },
  developing:{ pctCap: 0.08, absMinuteCap: 12, longIncreaseCap: 15 },
  durable:   { pctCap: 0.10, absMinuteCap: 15, longIncreaseCap: 20 },
};

const LONG_MULTIPLIER_CAPS = {
  novice: {
    earlyWeeks: 4,
    early: { run: 1.25, bike: 1.35, swim: 1.20 },
    late: { run: 1.40, bike: 1.60, swim: 1.20 },
  },
  developing: {
    earlyWeeks: 0,
    early: { run: 1.60, bike: 2.00, swim: 1.35 },
    late: { run: 1.60, bike: 2.00, swim: 1.35 },
  },
  durable: {
    earlyWeeks: 0,
    early: { run: 9.99, bike: 9.99, swim: 1.50 },
    late: { run: 9.99, bike: 9.99, swim: 1.50 },
  },
};

const INTENSITY_UNLOCKS = {
  novice: {
    run: 40,
    bike: 60,
    swim: 30,
    stableWeeks: 2,
    thresholdWeeksBeforeInterval: 2,
  },
  developing: {
    run: 35,
    bike: 50,
    swim: 25,
  },
};

const TIMELINE_MIN_WEEKS = {
  novice:    { sprint: 12, quarter: 16, olympic: 16, half: 24, full: 36 },
  developing:{ sprint: 8, quarter: 12, olympic: 12, half: 20, full: 32 },
  durable:   { sprint: 6, quarter: 10, olympic: 10, half: 16, full: 28 },
};

const RACE_CAPACITY_MIN = {
  sprint:  { run: 20, bike: 45, swim: 15 },
  quarter: { run: 25, bike: 55, swim: 20 },
  olympic: { run: 30, bike: 60, swim: 20 },
  half:    { run: 40, bike: 90, swim: 25 },
  full:    { run: 50, bike: 120, swim: 30 },
};

const RACE_DEMAND_MINUTES = {
  sprint:  { run: 45, bike: 75, swim: 35 },
  quarter: { run: 60, bike: 100, swim: 45 },
  olympic: { run: 70, bike: 115, swim: 50 },
  half:    { run: 100, bike: 180, swim: 60 },
  full:    { run: 140, bike: 260, swim: 75 },
};

const PEAK_SESSION_FLOORS = {
  sprint:  { run: 30, bike: 60, swim: 30 },
  quarter: { run: 45, bike: 85, swim: 40 },
  olympic: { run: 60, bike: 105, swim: 45 },
  half:    { run: 90, bike: 210, swim: 55 },
  full:    { run: 150, bike: 300, swim: 70 },
};

const VOLUME_WARNING_TARGET_MINUTES = {
  sprint:  { run: 45, bike: 75, swim: 35 },
  quarter: { run: 65, bike: 110, swim: 45 },
  olympic: { run: 80, bike: 130, swim: 55 },
  half:    { run: 115, bike: 210, swim: 65 },
  full:    { run: 180, bike: 330, swim: 90 },
};

const VOLUME_WARNING_THRESHOLDS = {
  runGap: 0.85,
  bikeGap: 0.85,
  totalGap: 0.82,
  nonStrengthBudgetShare: 0.80,
  minWeeksToAssess: 10,
};

const EARLY_WEEKS_RAMP_GUARD = 3;
const EARLY_WEEK_ABS_INCREASE_CAP = { 1: 5, 2: 5, 3: 8 };
const EARLY_SCALE_FACTOR_CAP = { 1: 1.15, 2: 1.20, 3: 1.25 };
const BASE_QUALITY_START_WEEK = 1;
const BASE_INTERVAL_UNLOCKS = {
  run: 25,
  bike: 40,
  swim: 20,
};
const SINGLE_BIKE_LONG_RIDE_SUPPORT = {
  base: { multiplierFloor: 1.55, longIncreaseCapFloor: 18, peakFloorRatio: 0 },
  build: { multiplierFloor: 1.75, longIncreaseCapFloor: 24, peakFloorRatio: 0 },
  peak: { multiplierFloor: 1.90, longIncreaseCapFloor: 30, peakFloorRatio: 0.83 },
};
const SINGLE_SESSION_RECOVERY_REDUCTION = {
  run: 0.70,
  bike: 0.80,
  swim: 0.70,
};
const PROGRESSION_STAGE_RULES = {
  early: { minWeek: 1, maxWeek: 4 },
  adapted: { minWeek: 5, maxWeek: 10 },
  established: { minWeek: 11, maxWeek: Infinity },
};
const DISCIPLINE_STAGE_CAPS = {
  run: {
    early: { pctCap: 0.06, absMinuteCap: 8, longIncreaseCap: 10 },
    adapted: { pctCap: 0.08, absMinuteCap: 10, longIncreaseCap: 14 },
    established: { pctCap: 0.09, absMinuteCap: 10, longIncreaseCap: 14 },
  },
  bike: {
    early: { pctCap: 0.07, absMinuteCap: 10, longIncreaseCap: 15 },
    adapted: { pctCap: 0.10, absMinuteCap: 16, longIncreaseCap: 22 },
    established: { pctCap: 0.11, absMinuteCap: 20, longIncreaseCap: 24 },
  },
  swim: {
    early: { pctCap: 0.07, absMinuteCap: 8, longIncreaseCap: 8 },
    adapted: { pctCap: 0.09, absMinuteCap: 10, longIncreaseCap: 10 },
    established: { pctCap: 0.10, absMinuteCap: 10, longIncreaseCap: 10 },
  },
};
const DISCIPLINE_PEAK_FLOOR_RATIO = ACTIVE_LOAD_CONFIG.disciplinePeakFloorRatio;
const SCALE_FACTOR_CAPS_BY_PHASE_AND_HOURS = ACTIVE_LOAD_CONFIG.scaleFactorCapsByPhaseAndHours;
const STRENGTH_BUDGET_RULES = ACTIVE_LOAD_CONFIG.strengthBudget;
const PHASE_BUDGET_MULTIPLIER = ACTIVE_LOAD_CONFIG.phaseBudgetMultiplier;
const LOW_FREQUENCY_LONG_GUARD = ACTIVE_LOAD_CONFIG.lowFrequencyLongGuard;
const BUDGET_SAFE_FLOOR_RATIO = ACTIVE_LOAD_CONFIG.budgetSafeFloorRatio;

function clampMinutes(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseCapacityMinutes(raw, maxMinutes = 600) {
  if (raw == null || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return clampMinutes(Math.round(parsed), 1, maxMinutes);
}

function getCapacitiesFromConfig(config) {
  return {
    run: parseCapacityMinutes(config.runCapacity, 300),
    bike: parseCapacityMinutes(config.bikeCapacity, 480),
    swim: parseCapacityMinutes(config.swimCapacity, 240),
  };
}

function computeStartingDurations(levels, capacities) {
  const disciplines = ['run', 'bike', 'swim'];
  const startDurations = {};
  const missing = [];

  disciplines.forEach(discipline => {
    const level = levels[discipline]?.level || levels[discipline] || 'beginner';
    const base = BASE_MINUTES[discipline]?.[level] || CAPACITY_FALLBACK_START[discipline];
    const capacity = capacities[discipline];
    if (capacity == null) {
      startDurations[discipline] = CAPACITY_FALLBACK_START[discipline];
      missing.push(discipline);
      return;
    }
    const safeFromCapacity = Math.round((capacity * SAFE_START_FRACTION) / 5) * 5;
    const capacityAnchoredStart = capacity > base
      ? Math.min(safeFromCapacity, base + (CAPACITY_START_BOOST_CAP[discipline] || 0))
      : safeFromCapacity;
    startDurations[discipline] = clampMinutes(
      capacityAnchoredStart,
      CAPACITY_FLOORS[discipline],
      Math.max(capacity, base)
    );
  });

  return { startDurations, missingCapacities: missing };
}

function computeReadinessTier(config, fitnessLevels, capacities) {
  const levels = [
    LEVEL_NUM[fitnessLevels.run.level],
    LEVEL_NUM[fitnessLevels.bike.level],
    LEVEL_NUM[fitnessLevels.swim.level],
  ].filter(n => Number.isFinite(n));

  const avgLevel = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const lowCapacityCount =
    (capacities.run != null && capacities.run < INTENSITY_UNLOCKS.developing.run ? 1 : 0) +
    (capacities.bike != null && capacities.bike < INTENSITY_UNLOCKS.developing.bike ? 1 : 0) +
    (capacities.swim != null && capacities.swim < INTENSITY_UNLOCKS.developing.swim ? 1 : 0);

  if (
    config.experience === 'new' ||
    config.experience === 'lt1' ||
    avgLevel < 0.75 ||
    lowCapacityCount >= 2
  ) {
    return 'novice';
  }

  if (
    config.experience === '3+' &&
    avgLevel >= 1.5 &&
    (config.weeklyHours === '10-15' || config.weeklyHours === '15+')
  ) {
    return 'durable';
  }

  return 'developing';
}

function elevateRisk(current, next) {
  return RISK_ORDER.indexOf(next) > RISK_ORDER.indexOf(current) ? next : current;
}

function assessPlanRisk(config, capacities, raceType, weeksToRace, readinessTier) {
  const race = raceType || config.raceType || 'olympic';
  const tier = readinessTier || 'developing';
  const raceLabel = RACE_LABELS[race] || race;
  const tierLabel = READINESS_TIER_LABELS_NL[tier] || tier;
  const timelineMin = TIMELINE_MIN_WEEKS[tier]?.[race] || 12;
  const minCapacity = RACE_CAPACITY_MIN[race] || RACE_CAPACITY_MIN.olympic;
  const reasons = [];
  const capacityRatios = {};
  let risk = 'low';

  if (weeksToRace < timelineMin - 2) {
    risk = 'unsafe';
    reasons.push(`Tijdlijn te kort: ${weeksToRace} weken voor ${raceLabel} (${tierLabel} minimum ${timelineMin}).`);
  } else if (weeksToRace < timelineMin) {
    risk = elevateRisk(risk, 'high');
    reasons.push(`Korte aanlooptijd: ${weeksToRace} weken ligt dicht bij het ${tierLabel}-minimum van ${timelineMin}.`);
  }

  let below80Count = 0;
  let below60Count = 0;
  ['run', 'bike', 'swim'].forEach(discipline => {
    const cap = capacities[discipline];
    if (cap == null) {
      reasons.push(`Ontbrekende capaciteitsinput voor ${DISCIPLINE_LABELS_NL[discipline] || discipline}.`);
      risk = elevateRisk(risk, 'moderate');
      return;
    }
    const ratio = cap / minCapacity[discipline];
    capacityRatios[discipline] = ratio;
    if (ratio < 0.8) below80Count++;
    if (ratio < 0.6) below60Count++;
  });

  if (below80Count >= 2) {
    risk = elevateRisk(risk, 'high');
    reasons.push('Meerdere disciplines zitten onder 80% van de aanbevolen startduurzaamheid voor deze race.');
  }
  if (below60Count >= 1 && weeksToRace < timelineMin) {
    risk = 'unsafe';
    reasons.push('De capaciteit zit in minstens één discipline onder 60% van het minimum terwijl de aanlooptijd kort is.');
  }

  return {
    level: risk,
    reasons,
    readinessTier: tier,
    raceType: race,
    weeksToRace,
    minimumWeeks: timelineMin,
    capacityRatios,
  };
}

function getLongMultiplierCap(readinessTier, discipline, trainingWeekIdx) {
  const profile = LONG_MULTIPLIER_CAPS[readinessTier];
  if (!profile) return Infinity;
  const capSet = trainingWeekIdx < profile.earlyWeeks ? profile.early : profile.late;
  return capSet[discipline] || Infinity;
}

function computeProgressCaps(readinessTier, riskLevel = 'low') {
  const tierCaps = PROGRESSION_CAPS[readinessTier] || PROGRESSION_CAPS.developing;
  const adjustedPct = riskLevel === 'high'
    ? Math.max(0.03, tierCaps.pctCap - 0.02)
    : tierCaps.pctCap;

  return {
    pctCap: adjustedPct,
    absMinuteCap: tierCaps.absMinuteCap,
    longIncreaseCap: tierCaps.longIncreaseCap,
  };
}

function getProgressionStage(trainingWeekNumber, riskLevel) {
  if (riskLevel === 'high') return 'early';
  if (trainingWeekNumber >= PROGRESSION_STAGE_RULES.established.minWeek) return 'established';
  if (trainingWeekNumber >= PROGRESSION_STAGE_RULES.adapted.minWeek) return 'adapted';
  return 'early';
}

function getDisciplineProgressCaps(readinessTier, progressionStage, discipline, riskLevel = 'low') {
  const baseCaps = computeProgressCaps(readinessTier, riskLevel);
  if (riskLevel === 'high') return baseCaps;

  const stageCaps = DISCIPLINE_STAGE_CAPS[discipline]?.[progressionStage];
  if (!stageCaps) return baseCaps;

  return {
    pctCap: Math.max(baseCaps.pctCap, stageCaps.pctCap),
    absMinuteCap: Math.max(baseCaps.absMinuteCap, stageCaps.absMinuteCap),
    longIncreaseCap: Math.max(baseCaps.longIncreaseCap, stageCaps.longIncreaseCap),
  };
}

function getEffectiveEnduranceBudget(weeklyHours, strengthSessions, phase = 'build') {
  const baseBudget = WEEKLY_HOURS_TARGET[weeklyHours] || WEEKLY_HOURS_TARGET['6-10'] || 480;
  const safeStrengthSessions = Math.max(0, Number(strengthSessions) || 0);
  const reservePerSession = Math.max(0, Number(STRENGTH_BUDGET_RULES?.reservePerSession) || 0);
  const phaseMultiplier = Number(PHASE_BUDGET_MULTIPLIER?.[phase]) || 1;
  const minBudget = Math.max(
    SESSION_MIN_MINUTES.run + SESSION_MIN_MINUTES.bike + SESSION_MIN_MINUTES.swim,
    Number(STRENGTH_BUDGET_RULES?.minEnduranceBudget) || 120
  );
  const reserved = safeStrengthSessions * reservePerSession;
  const adjustedBudget = Math.round(baseBudget * phaseMultiplier);
  const peakMultiplier = Math.max(1, Number(PHASE_BUDGET_MULTIPLIER?.peak) || 1);
  const maxBudget = Math.max(baseBudget, Math.round(baseBudget * peakMultiplier));
  return clampMinutes(adjustedBudget - reserved, minBudget, maxBudget);
}

function getPhaseScaleFactorCap(phase, weeklyHours) {
  const phaseCaps = SCALE_FACTOR_CAPS_BY_PHASE_AND_HOURS?.[phase];
  if (!phaseCaps) return Infinity;
  const cap = phaseCaps[weeklyHours];
  return Number.isFinite(cap) && cap > 0 ? cap : Infinity;
}

function getSingleBikeLongRideSupport(discipline, sessionCount, phase, riskLevel = 'low') {
  if (discipline !== 'bike') return null;
  if ((Number(sessionCount) || 0) !== 1) return null;
  if (riskLevel === 'high' || phase === 'taper') return null;
  return SINGLE_BIKE_LONG_RIDE_SUPPORT[phase] || null;
}

function hasKeyEnduranceSessionForWeek(
  discipline,
  sessionCount,
  phase,
  isRecoveryWeek,
  isTaperWeek,
  isLastTrainingWeek
) {
  const count = Math.max(0, Number(sessionCount) || 0);
  if (count <= 0 || isRecoveryWeek || isTaperWeek || isLastTrainingWeek) return false;
  if (discipline === 'bike') return true;
  if (discipline === 'swim') return phase === 'build' || phase === 'peak';
  if (discipline === 'run') return count > 1 || phase === 'peak';
  return false;
}

function isKeySessionIndex(sessionIndex, effectiveSessionCount, hasKeySession) {
  if (!hasKeySession || effectiveSessionCount <= 0) return false;
  return sessionIndex === effectiveSessionCount - 1;
}

function getSingleSessionRecoveryReduction(discipline, scheduledSessions, effectiveSessions, isRecoveryWeek) {
  if (!isRecoveryWeek) return 1;
  if ((Number(scheduledSessions) || 0) !== 1) return 1;
  if ((Number(effectiveSessions) || 0) !== 1) return 1;
  return Number(SINGLE_SESSION_RECOVERY_REDUCTION[discipline]) || 1;
}

function getLowFrequencyLongSettings(
  discipline,
  sessionCount,
  multiplier,
  longIncreaseCap,
  isRecoveryWeek,
  isTaperWeek,
  phase = 'build',
  riskLevel = 'low'
) {
  if (isRecoveryWeek || isTaperWeek) {
    return { multiplier, longIncreaseCap };
  }

  const threshold = Math.max(0, Number(LOW_FREQUENCY_LONG_GUARD?.sessionThreshold) || 0);
  if ((Number(sessionCount) || 0) > threshold) {
    return { multiplier, longIncreaseCap };
  }

  const multiplierFactor = LOW_FREQUENCY_LONG_GUARD?.multiplierFactor?.[discipline] || 1;
  const longCapFactor = LOW_FREQUENCY_LONG_GUARD?.longIncreaseFactor?.[discipline] || 1;
  const minLongCap = Math.max(1, Number(LOW_FREQUENCY_LONG_GUARD?.minLongIncreaseCap?.[discipline]) || 1);
  let adjustedMultiplier = Math.max(1.0, multiplier * multiplierFactor);
  let adjustedLongCap = Math.max(minLongCap, Math.round(longIncreaseCap * longCapFactor));
  const singleBikeSupport = getSingleBikeLongRideSupport(discipline, sessionCount, phase, riskLevel);
  if (singleBikeSupport) {
    adjustedMultiplier = Math.max(adjustedMultiplier, singleBikeSupport.multiplierFloor || adjustedMultiplier);
    adjustedLongCap = Math.max(adjustedLongCap, singleBikeSupport.longIncreaseCapFloor || adjustedLongCap);
  }

  return {
    multiplier: adjustedMultiplier,
    longIncreaseCap: adjustedLongCap,
  };
}

function getRiskLevelForTrainingWeek(baseRiskLevel, riskAssessment, trainingWeekNumber, totalTrainingWeeks) {
  if (baseRiskLevel !== 'high') return baseRiskLevel;

  const reasons = Array.isArray(riskAssessment?.reasons) ? riskAssessment.reasons : [];
  const hasTimelinePressureReason = reasons.some(reason =>
    /timeline too short|short timeline/i.test(String(reason))
  );
  if (hasTimelinePressureReason) return 'high';

  const minimumWeeks = Number(riskAssessment?.minimumWeeks) || 12;
  const hasTimelinePressure = totalTrainingWeeks < minimumWeeks;
  if (hasTimelinePressure) return 'high';

  if (trainingWeekNumber <= 6) return 'high';
  if (trainingWeekNumber <= 12) return 'moderate';
  return 'low';
}

function estimateRaceDemandMinutes(raceType) {
  const demand = RACE_DEMAND_MINUTES[raceType] || RACE_DEMAND_MINUTES.olympic;
  return {
    ...demand,
    total: demand.run + demand.bike + demand.swim,
  };
}

function estimateVolumeWarningDemandMinutes(raceType) {
  const demand = VOLUME_WARNING_TARGET_MINUTES[raceType] || VOLUME_WARNING_TARGET_MINUTES.olympic;
  return {
    ...demand,
    total: demand.run + demand.bike + demand.swim,
  };
}

function estimateFeasiblePeakMinutes(config, readinessTier, options = {}) {
  const {
    conservative = true,
    phase = 'peak',
  } = options;
  const enduranceBudget = getEffectiveEnduranceBudget(config.weeklyHours, config.strengthSessions, phase);
  const budgetShare = conservative ? VOLUME_WARNING_THRESHOLDS.nonStrengthBudgetShare : 1;
  const nonStrengthBudget = enduranceBudget * budgetShare;
  const runSessions = Math.max(0, Number(config.runSessions) || 0);
  const bikeSessions = Math.max(0, Number(config.bikeSessions) || 0);
  const swimSessions = Math.max(0, Number(config.swimSessions) || 0);

  const weightedSessions = {
    run: runSessions > 0 ? runSessions * 1.0 : 0,
    bike: bikeSessions > 0 ? bikeSessions * 1.3 : 0,
    swim: swimSessions > 0 ? swimSessions * 0.8 : 0,
  };
  const totalWeight = weightedSessions.run + weightedSessions.bike + weightedSessions.swim;
  if (totalWeight <= 0) return null;

  const weeklyMinutes = {
    run: weightedSessions.run > 0 ? (nonStrengthBudget * weightedSessions.run / totalWeight) : 0,
    bike: weightedSessions.bike > 0 ? (nonStrengthBudget * weightedSessions.bike / totalWeight) : 0,
    swim: weightedSessions.swim > 0 ? (nonStrengthBudget * weightedSessions.swim / totalWeight) : 0,
  };

  const regularMinutes = {
    run: runSessions > 0 ? weeklyMinutes.run / runSessions : 0,
    bike: bikeSessions > 0 ? weeklyMinutes.bike / bikeSessions : 0,
    swim: swimSessions > 0 ? weeklyMinutes.swim / swimSessions : 0,
  };

  const raceLongMult = LONG_SESSION_MULTIPLIER[config.raceType] || { run: 1.5, bike: 1.5, swim: 1.3 };
  const runLongMult = Math.min(raceLongMult.run, getLongMultiplierCap(readinessTier, 'run', 999));
  const bikeLongMult = Math.min(raceLongMult.bike, getLongMultiplierCap(readinessTier, 'bike', 999));
  const swimLongMult = Math.min(raceLongMult.swim || 1.3, getLongMultiplierCap(readinessTier, 'swim', 999));

  const runLowFrequency = getLowFrequencyLongSettings('run', runSessions, runLongMult, 999, false, false, phase, 'low');
  const bikeLowFrequency = getLowFrequencyLongSettings('bike', bikeSessions, bikeLongMult, 999, false, false, phase, 'low');
  const swimLowFrequency = getLowFrequencyLongSettings('swim', swimSessions, swimLongMult, 999, false, false, phase, 'low');
  const keySessionByDiscipline = {
    run: hasKeyEnduranceSessionForWeek('run', runSessions, phase, false, false, false),
    bike: hasKeyEnduranceSessionForWeek('bike', bikeSessions, phase, false, false, false),
    swim: hasKeyEnduranceSessionForWeek('swim', swimSessions, phase, false, false, false),
  };

  const runLong = keySessionByDiscipline.run ? regularMinutes.run * runLowFrequency.multiplier : regularMinutes.run;
  const bikeLong = keySessionByDiscipline.bike ? regularMinutes.bike * bikeLowFrequency.multiplier : 0;
  const swimLong = keySessionByDiscipline.swim ? regularMinutes.swim * swimLowFrequency.multiplier : regularMinutes.swim;

  return {
    runLong: Math.round(runLong / 5) * 5,
    bikeLong: Math.round(bikeLong / 5) * 5,
    swimLong: Math.round(swimLong / 5) * 5,
    swimRegular: Math.round(regularMinutes.swim / 5) * 5,
    totalNonStrength: Math.round(weeklyMinutes.run + weeklyMinutes.bike + weeklyMinutes.swim),
    sessionCounts: { run: runSessions, bike: bikeSessions, swim: swimSessions },
  };
}

function analyzeWeeklyVolumeGap(config, readinessTier) {
  const feasible = estimateFeasiblePeakMinutes(config, readinessTier, { conservative: true, phase: 'peak' });
  if (!feasible) {
    return { isGap: false, reasons: [], reasonKeys: [], feasible: null, demand: null };
  }

  const demand = estimateVolumeWarningDemandMinutes(config.raceType);
  const reasons = [];
  const reasonKeys = [];

  if (
    feasible.sessionCounts.run > 0 &&
    feasible.runLong < demand.run * VOLUME_WARNING_THRESHOLDS.runGap
  ) {
    reasonKeys.push('volume-gap-run');
    reasons.push(`Geschatte piek-lange duurloop is ~${feasible.runLong} min tegenover een richtdoel van ~${demand.run} min.`);
  }

  if (
    feasible.sessionCounts.bike > 0 &&
    feasible.bikeLong < demand.bike * VOLUME_WARNING_THRESHOLDS.bikeGap
  ) {
    reasonKeys.push('volume-gap-bike');
    reasons.push(`Geschatte piek-lange fietssessie is ~${feasible.bikeLong} min tegenover een richtdoel van ~${demand.bike} min.`);
  }

  if (feasible.totalNonStrength < demand.total * VOLUME_WARNING_THRESHOLDS.totalGap) {
    reasonKeys.push('volume-gap-total');
    reasons.push(`Geschat wekelijks duurbudget (~${feasible.totalNonStrength} min) is laag voor de eisen van ${RACE_LABELS[config.raceType] || config.raceType}.`);
  }

  return {
    isGap: reasons.length > 0,
    reasons,
    reasonKeys,
    feasible,
    demand,
  };
}

function getRecommendedWeeklyHoursRange(config, readinessTier) {
  const currentIndex = WEEKLY_HOURS_ORDER.indexOf(config.weeklyHours);
  if (currentIndex < 0) return null;

  for (let i = currentIndex + 1; i < WEEKLY_HOURS_ORDER.length; i++) {
    const candidateHours = WEEKLY_HOURS_ORDER[i];
    const candidateAnalysis = analyzeWeeklyVolumeGap(
      { ...config, weeklyHours: candidateHours },
      readinessTier
    );
    if (!candidateAnalysis.isGap) {
      return candidateHours;
    }
  }

  return null;
}

function assessWeeklyVolumeGap(config, readinessTier, capacities, weeksToRace) {
  if (weeksToRace < VOLUME_WARNING_THRESHOLDS.minWeeksToAssess) {
    return { isGap: false, reasons: [], suggestions: [], reasonKeys: [] };
  }

  const analysis = analyzeWeeklyVolumeGap(config, readinessTier);
  if (!analysis.feasible) {
    return { isGap: false, reasons: [], suggestions: [], reasonKeys: [] };
  }

  const recommendedWeeklyHours = getRecommendedWeeklyHoursRange(config, readinessTier);
  const suggestions = [];
  if (recommendedWeeklyHours) {
    suggestions.push(`Overweeg je wekelijkse trainingsuren te verhogen naar ${WEEKLY_HOURS_LABELS[recommendedWeeklyHours] || recommendedWeeklyHours}.`);
  } else {
    suggestions.push('Overweeg je wekelijkse trainingsuren te verhogen als dat mogelijk is.');
  }
  if ((Number(config.strengthSessions) || 0) > 1) {
    suggestions.push('Overweeg één krachtsessie te schrappen om ongeveer 60 minuten vrij te maken voor duurtraining.');
  }
  suggestions.push('Overweeg je aanlooptijd te verlengen als dat mogelijk is.');
  suggestions.push('Overweeg een kortere wedstrijdafstand.');

  return {
    isGap: analysis.isGap,
    reasons: analysis.reasons,
    suggestions,
    reasonKeys: analysis.reasonKeys,
    feasible: analysis.feasible,
    demand: analysis.demand,
    recommendedWeeklyHours,
  };
}

function demoteIntensity(intensity) {
  if (intensity === 'interval') return 'threshold';
  if (intensity === 'threshold') return 'threshold-lite';
  if (intensity === 'threshold-lite') return 'tempo';
  if (intensity === 'tempo') return 'easy';
  return 'easy';
}

function isQualityIntensity(intensity) {
  return intensity === 'tempo' ||
    intensity === 'threshold-lite' ||
    intensity === 'threshold' ||
    intensity === 'interval';
}

function isIntensityAllowed(intensity, discipline, gatingContext) {
  const {
    readinessTier,
    phase,
    riskLevel,
    easyDuration,
    stableWeeks,
    preRecoveryStableWeeks = 0,
    thresholdWeeks,
    lastWeekWasRecovery,
    trainingWeekNumber = 1,
    totalSessions = 0,
    isLong = false,
    isRecoveryWeek = false,
  } = gatingContext;

  if (intensity === 'easy') return true;

  const isBaseQualityPhase = phase === 'base' && trainingWeekNumber >= BASE_QUALITY_START_WEEK;
  const isQualityPhase = isBaseQualityPhase || phase === 'build' || phase === 'peak';
  const noviceMin = INTENSITY_UNLOCKS.novice[discipline] || 999;
  const developingMin = INTENSITY_UNLOCKS.developing[discipline] || noviceMin;
  const baseIntervalMin = BASE_INTERVAL_UNLOCKS[discipline] || Math.max(20, Math.round(noviceMin * 0.65));
  const fallbackStableWeeks = lastWeekWasRecovery ? preRecoveryStableWeeks : stableWeeks;
  const noviceReady = stableWeeks >= INTENSITY_UNLOCKS.novice.stableWeeks &&
    easyDuration >= noviceMin &&
    !lastWeekWasRecovery;

  if (intensity === 'tempo') {
    if (!isQualityPhase || isRecoveryWeek || isLong || totalSessions < 2) return false;
    if (readinessTier === 'durable') return true;
    if (readinessTier === 'developing') {
      return easyDuration >= Math.max(20, Math.round(developingMin * 0.65));
    }
    if (readinessTier === 'novice') {
      if (phase === 'base') {
        return riskLevel !== 'high' &&
          easyDuration >= Math.max(20, baseIntervalMin - 5) &&
          !lastWeekWasRecovery;
      }
      return riskLevel !== 'high' &&
        fallbackStableWeeks >= 1 &&
        easyDuration >= Math.max(20, Math.round(noviceMin * 0.75)) &&
        !isRecoveryWeek;
    }
    return false;
  }

  if (intensity === 'threshold-lite') {
    if (!isQualityPhase || isRecoveryWeek || isLong || totalSessions < 2) return false;
    if (readinessTier === 'durable') return true;
    if (readinessTier === 'developing') {
      if (phase === 'base') {
        return riskLevel !== 'high' &&
          easyDuration >= Math.max(25, baseIntervalMin);
      }
      return riskLevel !== 'high' &&
        easyDuration >= Math.max(25, Math.round(developingMin * 0.85));
    }
    if (readinessTier === 'novice') {
      if (phase === 'base') {
        return riskLevel !== 'high' &&
          easyDuration >= Math.max(25, baseIntervalMin) &&
          !lastWeekWasRecovery;
      }
      return riskLevel !== 'high' &&
        fallbackStableWeeks >= 1 &&
        easyDuration >= Math.max(25, Math.round(noviceMin * 0.9)) &&
        !isRecoveryWeek;
    }
    return false;
  }

  if (intensity === 'threshold') {
    if (phase === 'base') return false;
    if (readinessTier === 'durable') {
      return riskLevel !== 'high';
    }
    if (readinessTier === 'developing') {
      return easyDuration >= developingMin;
    }
    if (readinessTier === 'novice') {
      return noviceReady;
    }
    return false;
  }

  if (intensity === 'interval') {
    if (phase === 'base') return false;
    if (phase !== 'peak' || riskLevel === 'high') return false;
    if (readinessTier === 'durable') return true;
    if (readinessTier === 'developing') {
      return easyDuration >= developingMin;
    }
    if (readinessTier === 'novice') {
      return noviceReady &&
        thresholdWeeks >= INTENSITY_UNLOCKS.novice.thresholdWeeksBeforeInterval;
    }
    return false;
  }

  return false;
}

function resolveQualityFallback(intensity, discipline, gatingContext) {
  const fallbackChain = [intensity];
  let current = intensity;
  while (current !== 'easy') {
    current = demoteIntensity(current);
    fallbackChain.push(current);
    if (current === 'easy') break;
  }

  for (const candidate of fallbackChain) {
    if (isIntensityAllowed(candidate, discipline, gatingContext)) {
      return candidate;
    }
  }

  return 'easy';
}

function gateIntensity(intensity, discipline, gatingContext) {
  const {
    readinessTier,
    phase,
    riskLevel,
    easyDuration,
    stableWeeks,
    thresholdWeeks,
    lastWeekWasRecovery,
  } = gatingContext;

  if (gatingContext.isRecoveryWeek && isQualityIntensity(intensity)) {
    return 'easy';
  }

  if (!isQualityIntensity(intensity) || intensity === 'easy' || intensity === 'tempo') {
    return intensity;
  }

  if ((phase === 'base' || phase === 'build' || phase === 'peak') && !gatingContext.isLong && !gatingContext.isRecoveryWeek) {
    return resolveQualityFallback(intensity, discipline, gatingContext);
  }

  if (riskLevel === 'high' && intensity === 'interval') return 'threshold';
  if (readinessTier === 'durable') return riskLevel === 'high' ? demoteIntensity(intensity) : intensity;

  if (readinessTier === 'developing') {
    const minEasy = INTENSITY_UNLOCKS.developing[discipline] || 999;
    if ((intensity === 'threshold' || intensity === 'interval') && easyDuration < minEasy) {
      return demoteIntensity(intensity);
    }
    if (intensity === 'interval' && phase !== 'peak') return 'threshold';
    return intensity;
  }

  if (readinessTier === 'novice') {
    const minEasy = INTENSITY_UNLOCKS.novice[discipline] || 999;
    const noviceReady = stableWeeks >= INTENSITY_UNLOCKS.novice.stableWeeks &&
      easyDuration >= minEasy &&
      !lastWeekWasRecovery;
    if ((intensity === 'threshold' || intensity === 'interval') && !noviceReady) {
      return 'easy';
    }
    if (intensity === 'interval' && thresholdWeeks < INTENSITY_UNLOCKS.novice.thresholdWeeksBeforeInterval) {
      return 'threshold';
    }
    return intensity;
  }

  return intensity;
}

// === Zone Labels ===

function getZoneLabel(intensity, discipline, ftp) {
  if (discipline === 'strength') return 'full body';
  const zone =
    intensity === 'easy' ? 'zone 1-2' :
    intensity === 'tempo' ? 'zone 3' :
    intensity === 'threshold-lite' ? 'zone 4' :
    intensity === 'threshold' ? 'zone 4' :
    intensity === 'interval' ? 'zone 4-5' : '';
  if (!zone) return '';
  if (discipline === 'bike' && ftp) return zoneToWattage(zone, ftp);
  return zone;
}

function getDisciplineLabel(discipline) {
  switch (discipline) {
    case 'run': return 'RUN';
    case 'bike': return 'BIKE';
    case 'swim': return 'SWIM';
    case 'strength': return 'STRENGTH';
    case 'rest': return 'REST';
    default: return discipline.toUpperCase();
  }
}

function getTemplateIntensityLabel(intensity, isLong) {
  if (isLong) return 'long';
  if (intensity === 'easy') return 'easy';
  if (intensity === 'threshold-lite') return 'threshold';
  return intensity;
}

function getDisciplineClass(discipline) {
  return `workout-${discipline}`;
}

// === Power Zones (% of FTP) ===

const POWER_ZONES = {
  'zone 1-2': { min: 0.40, max: 0.75 },
  'zone 2':   { min: 0.56, max: 0.75 },
  'zone 3':   { min: 0.76, max: 0.90 },
  'zone 4':   { min: 0.91, max: 1.05 },
  'zone 5':   { min: 1.06, max: 1.20 },
  'zone 4-5': { min: 0.91, max: 1.20 },
};

function zoneToWattage(zoneLabel, ftp) {
  if (!ftp || !POWER_ZONES[zoneLabel]) return zoneLabel;
  const r = POWER_ZONES[zoneLabel];
  return `${Math.round(ftp * r.min)}-${Math.round(ftp * r.max)}W`;
}

// === Workout Suggestions ===

const WORKOUT_ENVELOPE = {
  run:  { 'threshold-lite': { warmup: 10, cooldown: 10, zone: 'zone 4' },
          threshold: { warmup: 10, cooldown: 10, zone: 'zone 4' },
          interval:  { warmup: 10, cooldown: 10, zone: 'zone 5' } },
  bike: { 'threshold-lite': { warmup: 15, cooldown: 10, zone: 'zone 4' },
          threshold: { warmup: 15, cooldown: 10, zone: 'zone 4' },
          interval:  { warmup: 15, cooldown: 10, zone: 'zone 5' } },
  swim: { easy:      { warmup: 8, cooldown: 4, zone: 'zone 2' },
          tempo:     { warmup: 8, cooldown: 4, zone: 'zone 3' },
          'threshold-lite': { warmup: 8, cooldown: 4, zone: 'zone 4' },
          threshold: { warmup: 8, cooldown: 4, zone: 'zone 4' },
          interval:  { warmup: 8, cooldown: 4, zone: 'zone 5' } },
};

const WORKOUT_STRUCTURE = {
  run: {
    'threshold-lite': [
      { repLabel: '400m', repWork: 1.75, recoveryLabel: '400m recovery', recoveryTime: 2.5, maxReps: 6 },
      { repLabel: '800m', repWork: 3.5, recoveryLabel: '400m recovery', recoveryTime: 2.5, maxReps: 4 },
    ],
    threshold: [
      { repLabel: '800m',  repWork: 3.5, recoveryLabel: '400m recovery', recoveryTime: 1.5, maxReps: 6 },
      { repLabel: '1200m', repWork: 5.5, recoveryLabel: '600m recovery', recoveryTime: 2.5, maxReps: 4 },
    ],
    interval: [
      { repLabel: '400m', repWork: 1.5, recoveryLabel: '400m recovery', recoveryTime: 2.5, maxReps: 8 },
      { repLabel: '600m', repWork: 2.5, recoveryLabel: '400m recovery', recoveryTime: 2.5, maxReps: 6 },
    ],
  },
  bike: {
    'threshold-lite': [
      { repLabel: '6 min', repWork: 6, recoveryLabel: '4 min recovery', recoveryTime: 4, maxReps: 4 },
      { repLabel: '8 min', repWork: 8, recoveryLabel: '4 min recovery', recoveryTime: 4, maxReps: 3 },
    ],
    threshold: [
      { repLabel: '10 min', repWork: 10, recoveryLabel: '5 min recovery', recoveryTime: 5, maxReps: 4 },
      { repLabel: '15 min', repWork: 15, recoveryLabel: '5 min recovery', recoveryTime: 5, maxReps: 3 },
    ],
    interval: [
      { repLabel: '3 min', repWork: 3, recoveryLabel: '3 min recovery', recoveryTime: 3, maxReps: 8 },
      { repLabel: '5 min', repWork: 5, recoveryLabel: '3 min recovery', recoveryTime: 3, maxReps: 6 },
    ],
  },
  swim: {
    easy: [
      { repLabel: '200m', repWork: 3.5, recoveryLabel: '15s recovery', recoveryTime: 0.25, maxReps: 4 },
      { repLabel: '400m', repWork: 7.0, recoveryLabel: '15s recovery', recoveryTime: 0.25, maxReps: 5 },
    ],
    tempo: [
      { repLabel: '200m', repWork: 3.5, recoveryLabel: '15s recovery', recoveryTime: 0.25, maxReps: 5 },
      { repLabel: '300m', repWork: 5.25, recoveryLabel: '15s recovery', recoveryTime: 0.25, maxReps: 6 },
    ],
    'threshold-lite': [
      { repLabel: '50m', repWork: 0.75, recoveryLabel: '20s recovery', recoveryTime: 0.33, maxReps: 12 },
      { repLabel: '100m', repWork: 1.75, recoveryLabel: '20s recovery', recoveryTime: 0.33, maxReps: 8 },
    ],
    threshold: [
      { repLabel: '100m', repWork: 1.75, recoveryLabel: '15s recovery', recoveryTime: 0.25, maxReps: 10 },
      { repLabel: '200m', repWork: 3.5,  recoveryLabel: '20s recovery', recoveryTime: 0.33, maxReps: 6 },
    ],
    interval: [
      { repLabel: '50m',  repWork: 0.75, recoveryLabel: '20s recovery', recoveryTime: 0.33, maxReps: 12 },
      { repLabel: '100m', repWork: 1.75, recoveryLabel: '15s recovery', recoveryTime: 0.25, maxReps: 8 },
    ],
  },
};

function swimDistanceLabel(minutes) {
  const meters = Math.round(minutes / 2 * 100 / 50) * 50;
  return `${meters}m`;
}

function buildStructuredSuggestion(discipline, intensity, duration, ftp) {
  const env = WORKOUT_ENVELOPE[discipline]?.[intensity];
  const tiers = WORKOUT_STRUCTURE[discipline]?.[intensity];
  if (!env || !tiers) return '';

  let warmup = env.warmup;
  let cooldown = env.cooldown;
  const firstTier = tiers[0];

  // Scale down warm-up/cool-down for very short sessions
  if (duration <= warmup + cooldown + firstTier.repWork) {
    warmup = Math.max(5, Math.round(Math.min(warmup, Math.floor(duration * 0.3)) / 5) * 5);
    cooldown = Math.max(5, Math.round(Math.min(cooldown, Math.floor(duration * 0.2)) / 5) * 5);
  }

  let availableTime = duration - warmup - cooldown;
  if (availableTime < firstTier.repWork) {
    const wuLabel = discipline === 'swim' ? `${swimDistanceLabel(warmup)} warm-up${intensity === 'easy' ? ' (drills)' : ''}` : `${warmup} min warm-up`;
    const cdLabel = discipline === 'swim' ? `${swimDistanceLabel(cooldown)} cool-down` : `${cooldown} min cool-down`;
    const shortZone = (discipline === 'bike' && ftp) ? zoneToWattage(env.zone, ftp) : env.zone;
    const shortQualityLabel =
      intensity === 'interval' ? 'Short interval set' :
      intensity === 'threshold' ? 'Short threshold set' :
      intensity === 'threshold-lite' ? 'Short controlled threshold set' :
      intensity === 'tempo' ? 'Steady tempo set' :
      'Short effort';
    return `${wuLabel}\n${shortQualityLabel} @ ${shortZone}\n${cdLabel}`;
  }

  // Find the right tier: use the first where reps fit within maxReps
  let chosenTier = tiers[tiers.length - 1];
  let reps = chosenTier.maxReps;
  for (const tier of tiers) {
    const timePerSet = tier.repWork + tier.recoveryTime;
    const calcReps = Math.max(1, Math.floor(availableTime / timePerSet));
    if (calcReps <= tier.maxReps) {
      chosenTier = tier;
      reps = calcReps;
      break;
    }
  }

  // Redistribute leftover time to warm-up and cool-down
  const usedTime = reps * (chosenTier.repWork + chosenTier.recoveryTime);
  const leftover = availableTime - usedTime;
  if (leftover > 1) {
    const extraWarmup = Math.floor(leftover * 0.6);
    const extraCooldown = Math.floor(leftover * 0.4);
    warmup += extraWarmup;
    cooldown += extraCooldown;
  }
  warmup = Math.round(warmup / 5) * 5;
  cooldown = Math.round(cooldown / 5) * 5;

  // Build labels
  const warmupLabel = discipline === 'swim' ? `${swimDistanceLabel(warmup)} warm-up${intensity === 'easy' ? ' (drills)' : ''}` : `${warmup} min warm-up`;
  const cooldownLabel = discipline === 'swim' ? `${swimDistanceLabel(cooldown)} cool-down` : `${cooldown} min cool-down`;
  const zoneLabel = (discipline === 'bike' && ftp) ? zoneToWattage(env.zone, ftp) : env.zone;

  // Bike threshold: show sustained blocks with dynamically scaled duration
  if (discipline === 'bike' && (intensity === 'threshold' || intensity === 'threshold-lite')) {
    const workAvailable = duration - warmup - cooldown;
    const totalRecovery = (reps - 1) * chosenTier.recoveryTime;
    const workMins = Math.round((workAvailable - totalRecovery) / reps);
    if (reps === 1) {
      return `${warmupLabel}\n${Math.round(workAvailable)} min @ ${zoneLabel}\n${cooldownLabel}`;
    }
    return `${warmupLabel}\n${reps}x ${workMins} min @ ${zoneLabel}\n${chosenTier.recoveryLabel}\n${cooldownLabel}`;
  }

  // Bike interval: time-based reps
  if (discipline === 'bike') {
    return `${warmupLabel}\n${reps}x ${chosenTier.repWork} min @ ${zoneLabel}\n${chosenTier.recoveryLabel}\n${cooldownLabel}`;
  }

  // Run and swim: distance-based reps
  return `${warmupLabel}\n${reps}x ${chosenTier.repLabel} @ ${zoneLabel}\n${chosenTier.recoveryLabel}\n${cooldownLabel}`;
}

function getWorkoutSuggestion(discipline, intensity, isLong, phase, duration, ftp, context = {}) {
  if (discipline === 'strength' || discipline === 'rest') return '';

  if (discipline === 'run') {
    if (isLong) return 'Long run @ zone 1-2';
    if (intensity === 'easy') {
      if (context.readinessTier === 'novice' && duration < INTENSITY_UNLOCKS.novice.run) {
        const ratio = duration < 25 ? '1 min run / 1 min walk' : (duration < 35 ? '2 min run / 1 min walk' : '3 min run / 1 min walk');
        return `Run-walk ${ratio} @ zone 1-2`;
      }
      return 'Steady run @ zone 1-2';
    }
    if (intensity === 'tempo') return 'Steady run @ zone 3 (sweet spot)';
  }

  if (discipline === 'bike') {
    if (isLong) return ftp ? `Long ride @ ${zoneToWattage('zone 2', ftp)}` : 'Long ride @ zone 2';
    if (intensity === 'easy') return ftp ? `Steady ride @ ${zoneToWattage('zone 1-2', ftp)}` : 'Steady ride @ zone 1-2';
    if (intensity === 'tempo') return ftp ? `Steady ride @ ${zoneToWattage('zone 3', ftp)}` : 'Steady ride @ zone 3 (sweet spot)';
  }

  if (discipline === 'swim') {
    if (isLong) return 'Long swim @ zone 1-2';
    return buildStructuredSuggestion(discipline, intensity, duration || 40, ftp);
  }

  if (intensity === 'threshold-lite' || intensity === 'threshold' || intensity === 'interval') {
    return buildStructuredSuggestion(discipline, intensity, duration || 40, ftp);
  }

  return '';
}

// === Vacation Helpers ===

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function alignDateToMonday(date) {
  const aligned = new Date(date);
  aligned.setHours(0, 0, 0, 0);
  const dayOfWeek = aligned.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  aligned.setDate(aligned.getDate() + mondayOffset);
  return aligned;
}

function getRaceWeekContext(planStart, raceDate) {
  const start = alignDateToMonday(new Date(planStart));
  const race = new Date(raceDate);
  race.setHours(0, 0, 0, 0);
  const totalDays = Math.max(0, Math.floor((race - start) / MS_PER_DAY));
  const raceWeekIdx = Math.floor(totalDays / 7);
  const totalWeeks = Math.max(1, raceWeekIdx + 1);
  const raceDow = race.getDay();
  const raceDayIdx = raceDow === 0 ? 6 : raceDow - 1;
  return {
    start,
    raceDate: race,
    totalDays,
    totalWeeks,
    raceWeekIdx,
    raceDayIdx,
  };
}

function buildRestWorkout() {
  return { discipline: 'rest', duration: 0, intensity: 'rest' };
}

function countPlannedSessions(days) {
  return days.flat().filter(workout => workout.discipline !== 'rest' && !workout.isRace).length;
}

function buildRaceWorkout(raceType) {
  const distances = RACE_DISTANCES[raceType] || RACE_DISTANCES.olympic;
  return {
    discipline: 'race',
    intensity: 'race',
    duration: RACE_EVENT_DURATION_MINUTES[raceType] || 180,
    isRace: true,
    raceType,
    raceLabel: RACE_LABELS[raceType] || raceType,
    raceDistances: distances,
  };
}

function finalizeRaceWeekLayout(week) {
  if (!week?.isRaceWeek) return;
  for (let d = 0; d < 7; d++) {
    const existing = Array.isArray(week.days[d]) ? week.days[d].filter(workout => !workout.isRace) : [];
    if (d === week.raceDayIdx) {
      week.days[d] = [buildRaceWorkout(week.raceType)];
      continue;
    }
    if (d > week.raceDayIdx) {
      week.days[d] = [buildRestWorkout()];
      continue;
    }
    week.days[d] = existing;
  }
  week.totalSessions = countPlannedSessions(week.days);
}

function getRaceWeekSessionTargets(raceType, requestedSessions, raceDayIdx) {
  if (raceDayIdx <= 0) {
    return { run: 0, bike: 0, swim: 0, strength: 0 };
  }
  const caps = RACE_WEEK_SESSION_CAPS[raceType] || RACE_WEEK_SESSION_CAPS.olympic;
  return {
    run: Math.max(0, Math.min(Number(requestedSessions.run) || 0, caps.run)),
    bike: Math.max(0, Math.min(Number(requestedSessions.bike) || 0, caps.bike)),
    swim: Math.max(0, Math.min(Number(requestedSessions.swim) || 0, caps.swim)),
    strength: Math.max(0, Math.min(Number(requestedSessions.strength) || 0, caps.strength)),
  };
}

function getVacationWeekIndices(vacations, planStart, raceDate) {
  if (!vacations || vacations.length === 0) return new Set();

  const { start, totalWeeks } = getRaceWeekContext(planStart, raceDate);

  const indices = new Set();
  for (const vacation of vacations) {
    if (!vacation.start || !vacation.end) continue;
    const vStart = new Date(vacation.start);
    const vEnd = new Date(vacation.end);
    vEnd.setHours(23, 59, 59);

    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = new Date(start);
      weekStart.setDate(weekStart.getDate() + w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59);

      if (vStart <= weekEnd && vEnd >= weekStart) {
        indices.add(w);
      }
    }
  }
  return indices;
}

function getTrainableWeekIndices(totalWeeks, effectiveVacationWeekIndices, raceWeekIdx, raceDayIdx) {
  const indices = [];
  for (let weekIdx = 0; weekIdx < totalWeeks; weekIdx++) {
    const isRaceWeek = weekIdx === raceWeekIdx;
    const isTrainableRaceWeek = !isRaceWeek || raceDayIdx > 0;
    if (effectiveVacationWeekIndices.has(weekIdx) || !isTrainableRaceWeek) continue;
    indices.push(weekIdx);
  }
  return indices;
}

function getEffectiveTaperLength(preRaceTrainingWeekCount, configuredTaperLength) {
  if (preRaceTrainingWeekCount <= 0) return 0;
  return Math.max(1, Math.min(configuredTaperLength, preRaceTrainingWeekCount));
}

function pickSpacedWeekIndices(indices, desiredCount) {
  const picked = new Set();
  if (!Array.isArray(indices) || indices.length === 0 || desiredCount <= 0) return picked;

  const actualCount = Math.min(indices.length, desiredCount);
  if (actualCount === 1) {
    picked.add(indices[indices.length - 1]);
    return picked;
  }

  const spacing = (indices.length - 1) / Math.max(1, actualCount - 1);
  for (let i = 0; i < actualCount; i++) {
    const candidate = indices[Math.round(i * spacing)];
    if (Number.isInteger(candidate)) {
      picked.add(candidate);
    }
  }
  return picked;
}

function buildTrainingWeekSchedule({
  totalWeeks,
  effectiveVacationWeekIndices,
  raceWeekIdx,
  raceDayIdx,
  raceType,
  recoveryWeeks,
  riskLevel,
  riskAssessment,
}) {
  const trainableWeekIndices = getTrainableWeekIndices(
    totalWeeks,
    effectiveVacationWeekIndices,
    raceWeekIdx,
    raceDayIdx
  );
  const trainingWeekIndexByCalendarWeek = new Map();
  trainableWeekIndices.forEach((weekIdx, idx) => {
    trainingWeekIndexByCalendarWeek.set(weekIdx, idx);
  });

  const totalTrainingWeeks = trainableWeekIndices.length;
  const weeklyRiskLevels = Array.from({ length: totalTrainingWeeks }, (_, idx) =>
    getRiskLevelForTrainingWeek(riskLevel, riskAssessment, idx + 1, totalTrainingWeeks)
  );

  const raceTrainingWeekIdxRaw = trainingWeekIndexByCalendarWeek.get(raceWeekIdx);
  const raceTrainingWeekIdx = Number.isInteger(raceTrainingWeekIdxRaw) ? raceTrainingWeekIdxRaw : null;
  const preRaceTrainingWeekCount = raceTrainingWeekIdx == null ? totalTrainingWeeks : raceTrainingWeekIdx;
  const configuredTaperLength = TAPER_WEEKS[raceType] || 2;
  const taperLength = getEffectiveTaperLength(preRaceTrainingWeekCount, configuredTaperLength);
  const firstTaperTrainingWeek = Math.max(0, preRaceTrainingWeekCount - taperLength);
  const taperTrainingWeekSet = new Set();
  for (let idx = firstTaperTrainingWeek; idx < preRaceTrainingWeekCount; idx++) {
    taperTrainingWeekSet.add(idx);
  }

  const recoveryTrainingWeekSet = new Set();
  const latestRecoveryWeekIdx = Math.max(-1, firstTaperTrainingWeek - 2);
  let lastRecoveryWeekIdx = null;

  for (let idx = 0; idx < preRaceTrainingWeekCount; idx++) {
    const recoveryEnabled = recoveryWeeks || weeklyRiskLevels[idx] === 'high';
    if (!recoveryEnabled || ((idx + 1) % 4 !== 0)) continue;

    for (let candidateIdx = Math.min(idx, latestRecoveryWeekIdx); candidateIdx >= 0; candidateIdx--) {
      const candidateEnabled = recoveryWeeks || weeklyRiskLevels[candidateIdx] === 'high';
      if (!candidateEnabled) continue;
      if (candidateIdx >= firstTaperTrainingWeek - 1) continue;
      if (lastRecoveryWeekIdx != null && candidateIdx - lastRecoveryWeekIdx < 3) continue;
      if (recoveryTrainingWeekSet.has(candidateIdx) || taperTrainingWeekSet.has(candidateIdx)) continue;

      recoveryTrainingWeekSet.add(candidateIdx);
      lastRecoveryWeekIdx = candidateIdx;
      break;
    }
  }

  const loadWeekCount = Math.max(0, firstTaperTrainingWeek - recoveryTrainingWeekSet.size);
  const baseLoadWeeks = Math.floor(loadWeekCount * PHASE_SPLITS.base);
  const buildLoadWeeks = Math.floor(loadWeekCount * PHASE_SPLITS.build);
  const phaseByTrainingWeek = new Map();
  let completedLoadWeeks = 0;

  for (let idx = 0; idx < totalTrainingWeeks; idx++) {
    const isRaceTrainingWeek = raceTrainingWeekIdx != null && idx === raceTrainingWeekIdx;
    if (taperTrainingWeekSet.has(idx) || isRaceTrainingWeek) {
      phaseByTrainingWeek.set(idx, 'taper');
      continue;
    }

    let phase = 'base';
    if (completedLoadWeeks >= baseLoadWeeks + buildLoadWeeks) phase = 'peak';
    else if (completedLoadWeeks >= baseLoadWeeks) phase = 'build';
    phaseByTrainingWeek.set(idx, phase);

    if (!recoveryTrainingWeekSet.has(idx)) {
      completedLoadWeeks++;
    }
  }

  const brickEligibleWeekIndices = [];
  for (let idx = 0; idx < totalTrainingWeeks; idx++) {
    if (recoveryTrainingWeekSet.has(idx) || taperTrainingWeekSet.has(idx)) continue;
    if (raceTrainingWeekIdx != null && idx === raceTrainingWeekIdx) continue;
    const phase = phaseByTrainingWeek.get(idx);
    if (phase === 'build' || phase === 'peak') {
      brickEligibleWeekIndices.push(idx);
    }
  }

  const targetBricks = brickEligibleWeekIndices.length > 0
    ? Math.min(
        brickEligibleWeekIndices.length,
        Math.min(6, Math.max(3, Math.round(brickEligibleWeekIndices.length * 0.4)))
      )
    : 0;
  const brickWeekSet = pickSpacedWeekIndices(brickEligibleWeekIndices, targetBricks);

  const targetBigBlocks = brickEligibleWeekIndices.length > 0
    ? Math.min(
        brickEligibleWeekIndices.length,
        Math.min(3, Math.max(2, Math.floor(brickEligibleWeekIndices.length * 0.2)))
      )
    : 0;
  const bigBlockWeekSet = pickSpacedWeekIndices(brickEligibleWeekIndices, targetBigBlocks);
  bigBlockWeekSet.forEach(idx => brickWeekSet.add(idx));

  return {
    totalTrainingWeeks,
    weeklyRiskLevels,
    taperLength,
    firstTaperTrainingWeek,
    taperTrainingWeekSet,
    recoveryTrainingWeekSet,
    phaseByTrainingWeek,
    brickWeekSet,
    bigBlockWeekSet,
  };
}

// === Plan Generation ===

function generatePlan(config) {
  const {
    raceType, raceDate, planStart,
    runLevel, bikeLevel, swimLevel,
    runSessions, bikeSessions, swimSessions, strengthSessions,
    restDays, polarized, recoveryWeeks, longDay,
    weeklyHours,
    vacationWeekIndices = new Set()
  } = config;

  const bikeFtp = (config.showWattage && config.bikeBenchmarkType === 'ftp')
    ? parseFloat(config.bikeBenchmarkValue) || null
    : null;

  const raceWeekContext = getRaceWeekContext(planStart, raceDate);
  const start = raceWeekContext.start;
  const totalWeeks = raceWeekContext.totalWeeks;
  const raceWeekIdx = raceWeekContext.raceWeekIdx;
  const raceDayIdx = raceWeekContext.raceDayIdx;
  const effectiveVacationWeekIndices = new Set(
    [...vacationWeekIndices].filter(idx => idx < totalWeeks && idx !== raceWeekIdx)
  );
  const raceWeekHasTrainingDays = raceDayIdx > 0;

  const capacities = getCapacitiesFromConfig(config);
  const fitnessLevels = {
    run: { level: runLevel },
    bike: { level: bikeLevel },
    swim: { level: swimLevel },
  };
  const readinessTier = computeReadinessTier(config, fitnessLevels, capacities);
  const riskAssessment = assessPlanRisk(config, capacities, raceType, totalWeeks, readinessTier);
  const riskLevel = riskAssessment.level;
  const {
    totalTrainingWeeks,
    weeklyRiskLevels,
    taperLength,
    firstTaperTrainingWeek,
    taperTrainingWeekSet,
    recoveryTrainingWeekSet,
    phaseByTrainingWeek,
    brickWeekSet,
    bigBlockWeekSet,
  } = buildTrainingWeekSchedule({
    totalWeeks,
    effectiveVacationWeekIndices,
    raceWeekIdx,
    raceDayIdx,
    raceType,
    recoveryWeeks,
    riskLevel,
    riskAssessment,
  });
  const feasiblePeakBudget = estimateFeasiblePeakMinutes(config, readinessTier, {
    conservative: false,
    phase: 'peak',
  });
  const startPlan = computeStartingDurations(fitnessLevels, capacities);
  const baseStartDurations = startPlan.startDurations;
  const missingCapacities = startPlan.missingCapacities;

  // Calculate base and peak minutes per session
  function getMinutesRange(discipline, level) {
    const defaultBase = BASE_MINUTES[discipline]?.[level] || 25;
    const anchoredBase = baseStartDurations[discipline] || defaultBase;
    const base = Math.max(CAPACITY_FLOORS[discipline] || 10, anchoredBase);
    const defaultPeak = PEAK_MINUTES[raceType]?.[discipline]?.[level] || defaultBase * 2;
    const peak = Math.max(defaultPeak, Math.round((base * 1.1) / 5) * 5);
    return { base, peak };
  }

  const runRange = getMinutesRange('run', runLevel);
  const bikeRange = getMinutesRange('bike', bikeLevel);
  const swimRange = getMinutesRange('swim', swimLevel);

  const weeks = [];
  let trainingWeekIdx = 0;
  let prevWeekDurations = null;
  let lastNonRecoveryDurations = null;
  let thresholdWeeksByDiscipline = { run: 0, bike: 0, swim: 0 };
  let stableWeeksByDiscipline = { run: 0, bike: 0, swim: 0 };
  let lastNonRecoveryStableWeeksByDiscipline = { run: 0, bike: 0, swim: 0 };
  let prevWeekWasRecovery = false;

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + w * 7);
    const isRaceWeek = w === raceWeekIdx;
    const isTrainableRaceWeek = !isRaceWeek || raceDayIdx > 0;

    if (effectiveVacationWeekIndices.has(w)) {
      weeks.push({
        weekNumber: w + 1,
        weekStart,
        isVacation: true,
        isRaceWeek: false,
        isRecovery: false,
        isTaper: false,
        phase: 'vacation',
        days: Array.from({ length: 7 }, () => [buildRestWorkout()]),
        totalSessions: 0,
      });
      continue;
    }

    const raceWeekSessions = isRaceWeek
      ? getRaceWeekSessionTargets(raceType, {
        run: runSessions,
        bike: bikeSessions,
        swim: swimSessions,
        strength: strengthSessions,
      }, raceDayIdx)
      : null;
    const weekRunSessions = raceWeekSessions ? raceWeekSessions.run : runSessions;
    const weekBikeSessions = raceWeekSessions ? raceWeekSessions.bike : bikeSessions;
    const weekSwimSessions = raceWeekSessions ? raceWeekSessions.swim : swimSessions;
    const weekStrengthSessions = raceWeekSessions ? raceWeekSessions.strength : strengthSessions;
    const trainingWeekNumber = Math.max(1, Math.min(totalTrainingWeeks || 1, trainingWeekIdx + 1));
    const weeklyRiskLevel = isTrainableRaceWeek
      ? (weeklyRiskLevels[trainingWeekIdx] || riskLevel)
      : riskLevel;
    const isLastTrainingWeek = isTrainableRaceWeek && trainingWeekIdx === totalTrainingWeeks - 1;
    const isTaperWeek = isTrainableRaceWeek && taperTrainingWeekSet.has(trainingWeekIdx);
    const isRecoveryWeek =
      isTrainableRaceWeek &&
      recoveryTrainingWeekSet.has(trainingWeekIdx) &&
      !isRaceWeek &&
      !isTaperWeek &&
      !isLastTrainingWeek;

    // Progress factor based on training weeks only
    const peakWeek = Math.max(0, firstTaperTrainingWeek - 1);
    const progress = peakWeek > 0 ? Math.min(1, trainingWeekIdx / peakWeek) : 0;

    // Volume multiplier
    let volumeMultiplier = 1;
    if (isLastTrainingWeek) {
      volumeMultiplier = 0.4;
    } else if (isTaperWeek) {
      const trainingWeeksUntilRace = totalTrainingWeeks - 1 - trainingWeekIdx;
      volumeMultiplier = 0.6 + (trainingWeeksUntilRace / Math.max(1, taperLength)) * 0.2;
    } else if (isRecoveryWeek) {
      volumeMultiplier = 0.75;
    }

    // Determine training phase based on training weeks
    let phase = isRaceWeek ? 'taper' : 'base';
    if (isTrainableRaceWeek) {
      phase = phaseByTrainingWeek.get(trainingWeekIdx) || phase;
    }
    if (isTaperWeek || isLastTrainingWeek) {
      phase = 'taper';
    }

    // Calculate session durations for this week
    function sessionDuration(range) {
      const mins = range.base + (range.peak - range.base) * progress;
      return Math.round(mins * volumeMultiplier / 5) * 5; // Round to 5 min
    }

    let runDuration = sessionDuration(runRange);
    let bikeDuration = sessionDuration(bikeRange);
    let swimDuration = sessionDuration(swimRange);
    const effRunSessions = isRecoveryWeek ? Math.max(1, weekRunSessions - 1) : weekRunSessions;
    const effBikeSessions = isRecoveryWeek ? Math.max(1, weekBikeSessions - 1) : weekBikeSessions;
    const effSwimSessions = isRecoveryWeek ? Math.max(1, weekSwimSessions - 1) : weekSwimSessions;
    const sessionCounts = { run: effRunSessions, bike: effBikeSessions, swim: effSwimSessions };
    const progressionStage = getProgressionStage(trainingWeekNumber, weeklyRiskLevel);

    // Scale durations so total non-strength volume matches weekly hours target.
    const raceLongMult = LONG_SESSION_MULTIPLIER[raceType] || { run: 1.5, bike: 1.5, swim: 1.3 };
    const longMult = {
      run: Math.min(raceLongMult.run, getLongMultiplierCap(readinessTier, 'run', trainingWeekIdx)),
      bike: Math.min(raceLongMult.bike, getLongMultiplierCap(readinessTier, 'bike', trainingWeekIdx)),
      swim: Math.min(raceLongMult.swim || 1.3, getLongMultiplierCap(readinessTier, 'swim', trainingWeekIdx)),
    };

    function capRegularDuration(discipline, duration, options = {}) {
      const { applyRecoveryReduction = true } = options;
      let capped = duration;
      let floor = SESSION_MIN_MINUTES[discipline] || CAPACITY_FLOORS[discipline] || 10;
      const disciplineCaps = getDisciplineProgressCaps(
        readinessTier, progressionStage, discipline, weeklyRiskLevel
      );
      const progressReferenceDurations =
        prevWeekWasRecovery && !isRecoveryWeek && lastNonRecoveryDurations
          ? lastNonRecoveryDurations
          : prevWeekDurations;
      if (trainingWeekIdx === 0) {
        capped = Math.min(capped, baseStartDurations[discipline] || capped);
      }
      if (capacities[discipline] != null && trainingWeekIdx === 0) {
        capped = Math.min(capped, capacities[discipline]);
      }
      if (progressReferenceDurations && progressReferenceDurations[discipline] != null) {
        const prev = progressReferenceDurations[discipline];
        let allowedIncrease = Math.min(prev * disciplineCaps.pctCap, disciplineCaps.absMinuteCap);
        if (
          capped > prev &&
          !isRecoveryWeek &&
          !isTaperWeek &&
          trainingWeekNumber > EARLY_WEEKS_RAMP_GUARD
        ) {
          allowedIncrease = Math.max(allowedIncrease, MIN_PROGRESS_STEP[discipline] || 5);
        }
        if (trainingWeekNumber <= EARLY_WEEKS_RAMP_GUARD && capped > prev) {
          const earlyCap = EARLY_WEEK_ABS_INCREASE_CAP[trainingWeekNumber];
          if (earlyCap) allowedIncrease = Math.min(allowedIncrease, earlyCap);
        }
        capped = Math.min(capped, prev + allowedIncrease);
      }
      if (applyRecoveryReduction) {
        const recoveryReduction = getSingleSessionRecoveryReduction(
          discipline,
          discipline === 'run' ? weekRunSessions : discipline === 'bike' ? weekBikeSessions : weekSwimSessions,
          sessionCounts[discipline],
          isRecoveryWeek
        );
        capped *= recoveryReduction;
        if (recoveryReduction < 1) {
          floor = CAPACITY_FLOORS[discipline] || floor;
        }
      }
      return Math.max(floor, Math.round(capped / 5) * 5);
    }

    function estimateKeySessionDuration(discipline, regularDuration, isKeySession) {
      if (!isKeySession) return regularDuration;
      const disciplineCaps = getDisciplineProgressCaps(
        readinessTier, progressionStage, discipline, weeklyRiskLevel
      );
      const lowFrequencyLongSettings = getLowFrequencyLongSettings(
        discipline,
        sessionCounts[discipline],
        longMult[discipline] || 1,
        disciplineCaps.longIncreaseCap,
        isRecoveryWeek,
        isTaperWeek,
        phase,
        weeklyRiskLevel
      );
      const maxLong = MAX_LONG_DURATION[discipline] || regularDuration;
      return Math.min(maxLong, Math.round(regularDuration * lowFrequencyLongSettings.multiplier / 5) * 5);
    }

    runDuration = capRegularDuration('run', runDuration, { applyRecoveryReduction: false });
    bikeDuration = capRegularDuration('bike', bikeDuration, { applyRecoveryReduction: false });
    swimDuration = capRegularDuration('swim', swimDuration, { applyRecoveryReduction: false });

    const keySessionByDiscipline = {
      run: !isRaceWeek && hasKeyEnduranceSessionForWeek('run', weekRunSessions, phase, isRecoveryWeek, isTaperWeek, isLastTrainingWeek),
      bike: !isRaceWeek && hasKeyEnduranceSessionForWeek('bike', weekBikeSessions, phase, isRecoveryWeek, isTaperWeek, isLastTrainingWeek),
      swim: !isRaceWeek && hasKeyEnduranceSessionForWeek('swim', weekSwimSessions, phase, isRecoveryWeek, isTaperWeek, isLastTrainingWeek),
    };

    let estimatedTotal = 0;
    if (effSwimSessions > 0) {
      const regularSwims = keySessionByDiscipline.swim ? Math.max(0, effSwimSessions - 1) : effSwimSessions;
      const keySwimEst = keySessionByDiscipline.swim
        ? estimateKeySessionDuration('swim', swimDuration, true)
        : 0;
      estimatedTotal += swimDuration * regularSwims + keySwimEst;
    }
    if (effRunSessions > 0) {
      const regularRuns = keySessionByDiscipline.run ? Math.max(0, effRunSessions - 1) : effRunSessions;
      const keyRunEst = keySessionByDiscipline.run
        ? estimateKeySessionDuration('run', runDuration, true)
        : 0;
      estimatedTotal += runDuration * regularRuns + keyRunEst;
    }
    if (effBikeSessions > 0) {
      const regularBikes = keySessionByDiscipline.bike ? Math.max(0, effBikeSessions - 1) : effBikeSessions;
      const keyBikeEst = keySessionByDiscipline.bike
        ? estimateKeySessionDuration('bike', bikeDuration, true)
        : 0;
      estimatedTotal += bikeDuration * regularBikes + keyBikeEst;
    }

    const targetMinutes = getEffectiveEnduranceBudget(weeklyHours, weekStrengthSessions, phase);
    const effectiveStableWeeksByDiscipline =
      prevWeekWasRecovery && !isRecoveryWeek
        ? lastNonRecoveryStableWeeksByDiscipline
        : stableWeeksByDiscipline;
    if (estimatedTotal > 0) {
      const rawScaleFactor = Math.min(2.0, Math.max(0.5, targetMinutes / estimatedTotal));
      let scaleFactor = rawScaleFactor;
      if (!isRecoveryWeek && !isTaperWeek && rawScaleFactor > 1.0) {
        const phaseCap = getPhaseScaleFactorCap(phase, weeklyHours);
        if (Number.isFinite(phaseCap)) {
          scaleFactor = Math.min(scaleFactor, phaseCap);
        }
      }
      if (trainingWeekNumber <= EARLY_WEEKS_RAMP_GUARD && rawScaleFactor > 1.0) {
        const earlyCap = EARLY_SCALE_FACTOR_CAP[trainingWeekNumber];
        if (earlyCap) scaleFactor = Math.min(scaleFactor, earlyCap);
      }
      runDuration = Math.max(SESSION_MIN_MINUTES.run, Math.round(runDuration * scaleFactor / 5) * 5);
      bikeDuration = Math.max(SESSION_MIN_MINUTES.bike, Math.round(bikeDuration * scaleFactor / 5) * 5);
      swimDuration = Math.max(SESSION_MIN_MINUTES.swim, Math.round(swimDuration * scaleFactor / 5) * 5);
    }

    runDuration = capRegularDuration('run', runDuration);
    bikeDuration = capRegularDuration('bike', bikeDuration);
    swimDuration = capRegularDuration('swim', swimDuration);

    function computeLongDuration(discipline, regularDuration, isKeySession) {
      if (!isKeySession) return regularDuration;
      const disciplineCaps = getDisciplineProgressCaps(
        readinessTier, progressionStage, discipline, weeklyRiskLevel
      );
      const progressReferenceDurations =
        prevWeekWasRecovery && !isRecoveryWeek && lastNonRecoveryDurations
          ? lastNonRecoveryDurations
          : prevWeekDurations;
      const lowFrequencyLongSettings = getLowFrequencyLongSettings(
        discipline,
        sessionCounts[discipline],
        longMult[discipline] || 1,
        disciplineCaps.longIncreaseCap,
        isRecoveryWeek,
        isTaperWeek,
        phase,
        weeklyRiskLevel
      );
      const multiplier = lowFrequencyLongSettings.multiplier;
      const effectiveLongIncreaseCap = lowFrequencyLongSettings.longIncreaseCap;
      const maxLong = MAX_LONG_DURATION[discipline] || regularDuration;
      let longDuration = Math.min(maxLong, Math.round(regularDuration * multiplier / 5) * 5);
      const longKey = discipline === 'run' ? 'longRun' : (discipline === 'bike' ? 'longBike' : 'longSwim');
      if (progressReferenceDurations && progressReferenceDurations[longKey] != null) {
        longDuration = Math.min(longDuration, progressReferenceDurations[longKey] + effectiveLongIncreaseCap);

        if (progressReferenceDurations[discipline] != null) {
          const regularIncrease = Math.max(0, regularDuration - progressReferenceDurations[discipline]);
          const maxLongByRegular = progressReferenceDurations[longKey] + regularIncrease + effectiveLongIncreaseCap;
          longDuration = Math.min(longDuration, maxLongByRegular);
        }
      }
      if (trainingWeekIdx === 0 && capacities[discipline] != null) {
        longDuration = Math.min(longDuration, capacities[discipline]);
      }

      // Ensure race-readiness floor in peak weeks when timeline/capacity are adequate.
      if (
        phase === 'peak' &&
        !isRecoveryWeek &&
        !isTaperWeek &&
        !isLastTrainingWeek &&
        weeklyRiskLevel !== 'high'
      ) {
        const timelineMin = TIMELINE_MIN_WEEKS[readinessTier]?.[raceType] || 12;
        const timelineAdequate = totalTrainingWeeks >= timelineMin;
        const raceDemand = estimateRaceDemandMinutes(raceType);
        const floorRatio = DISCIPLINE_PEAK_FLOOR_RATIO[discipline] || 0;
        const demandForDiscipline = raceDemand[discipline] || 0;
        if (
          sessionCounts[discipline] > 0 &&
          timelineAdequate &&
          floorRatio > 0 &&
          demandForDiscipline > 0
        ) {
          const singleBikeSupport = getSingleBikeLongRideSupport(
            discipline,
            sessionCounts[discipline],
            phase,
            weeklyRiskLevel
          );
          const configuredFloor = PEAK_SESSION_FLOORS[raceType]?.[discipline] || 0;
          let peakFloor = Math.max(
            Math.round((demandForDiscipline * floorRatio) / 5) * 5,
            configuredFloor
          );
          if (prevWeekDurations && prevWeekDurations[longKey] != null) {
            peakFloor = Math.min(peakFloor, prevWeekDurations[longKey] + effectiveLongIncreaseCap);
          }
          const feasibleBudgetLong =
            discipline === 'run'
              ? feasiblePeakBudget?.runLong
              : discipline === 'bike'
                ? feasiblePeakBudget?.bikeLong
                : (feasiblePeakBudget?.swimLong ?? feasiblePeakBudget?.swimRegular);
          let budgetSafeFloor = null;
          if (Number.isFinite(feasibleBudgetLong) && feasibleBudgetLong > 0) {
            budgetSafeFloor = Math.round((feasibleBudgetLong * BUDGET_SAFE_FLOOR_RATIO) / 5) * 5;
            peakFloor = Math.min(peakFloor, budgetSafeFloor);
          }
          let capacityConstrainedFloor = null;
          if (capacities[discipline] != null) {
            capacityConstrainedFloor = capacities[discipline] + (trainingWeekNumber * effectiveLongIncreaseCap);
            peakFloor = Math.min(peakFloor, capacityConstrainedFloor);
          }
          if (singleBikeSupport?.peakFloorRatio > 0) {
            let supportedPeakFloor = Math.round((demandForDiscipline * singleBikeSupport.peakFloorRatio) / 5) * 5;
            if (prevWeekDurations && prevWeekDurations[longKey] != null) {
              supportedPeakFloor = Math.min(supportedPeakFloor, prevWeekDurations[longKey] + effectiveLongIncreaseCap);
            }
            if (Number.isFinite(budgetSafeFloor) && budgetSafeFloor > 0) {
              supportedPeakFloor = Math.min(supportedPeakFloor, budgetSafeFloor);
            }
            if (Number.isFinite(capacityConstrainedFloor) && capacityConstrainedFloor > 0) {
              supportedPeakFloor = Math.min(supportedPeakFloor, capacityConstrainedFloor);
            }
            peakFloor = Math.max(peakFloor, supportedPeakFloor);
          }
          longDuration = Math.max(longDuration, peakFloor);
        }
      }

      return Math.max(regularDuration, Math.round(longDuration / 5) * 5);
    }

    // Determine workout distribution across the week
    const daySlots = new Array(7).fill(null).map(() => []);

    // Assign rest days first
    const raceWeekTrainingWindowEnd = isRaceWeek ? raceDayIdx : 7;
    const restDayIndices = getRestDayIndices(restDays, longDay)
      .filter(dayIdx => dayIdx < raceWeekTrainingWindowEnd);

    // Build workout pool
    const workouts = [];
    const weekThresholdHits = { run: false, bike: false, swim: false };
    for (let i = 0; i < (isRecoveryWeek ? Math.max(1, weekRunSessions - 1) : weekRunSessions); i++) {
      const totalRunSessions = isRecoveryWeek ? Math.max(1, weekRunSessions - 1) : weekRunSessions;
      const isLong = isKeySessionIndex(i, totalRunSessions, keySessionByDiscipline.run);
      const proposedIntensity = getSessionIntensity(i, weekRunSessions, polarized, isLong, phase, weeklyHours, trainingWeekNumber);
      const intensity = gateIntensity(proposedIntensity, 'run', {
        readinessTier,
        phase,
        riskLevel: weeklyRiskLevel,
        easyDuration: runDuration,
        stableWeeks: effectiveStableWeeksByDiscipline.run,
        preRecoveryStableWeeks: lastNonRecoveryStableWeeksByDiscipline.run,
        thresholdWeeks: thresholdWeeksByDiscipline.run,
        lastWeekWasRecovery: prevWeekWasRecovery,
        trainingWeekNumber,
        totalSessions: totalRunSessions,
        isLong,
        isRecoveryWeek,
      });
      if (intensity === 'threshold-lite' || intensity === 'threshold' || intensity === 'interval') weekThresholdHits.run = true;
      const runDur = computeLongDuration('run', runDuration, isLong);
      workouts.push({
        discipline: 'run',
        duration: runDur,
        intensity,
        isLong,
        suggestion: getWorkoutSuggestion('run', intensity, isLong, phase, runDur, null, { readinessTier }),
      });
    }
    for (let i = 0; i < (isRecoveryWeek ? Math.max(1, weekBikeSessions - 1) : weekBikeSessions); i++) {
      const totalBikeSessions = isRecoveryWeek ? Math.max(1, weekBikeSessions - 1) : weekBikeSessions;
      const isLong = isKeySessionIndex(i, totalBikeSessions, keySessionByDiscipline.bike);
      const proposedIntensity = getSessionIntensity(i, weekBikeSessions, polarized, isLong, phase, weeklyHours, trainingWeekNumber);
      const intensity = gateIntensity(proposedIntensity, 'bike', {
        readinessTier,
        phase,
        riskLevel: weeklyRiskLevel,
        easyDuration: bikeDuration,
        stableWeeks: effectiveStableWeeksByDiscipline.bike,
        preRecoveryStableWeeks: lastNonRecoveryStableWeeksByDiscipline.bike,
        thresholdWeeks: thresholdWeeksByDiscipline.bike,
        lastWeekWasRecovery: prevWeekWasRecovery,
        trainingWeekNumber,
        totalSessions: totalBikeSessions,
        isLong,
        isRecoveryWeek,
      });
      if (intensity === 'threshold-lite' || intensity === 'threshold' || intensity === 'interval') weekThresholdHits.bike = true;
      const bikeDur = computeLongDuration('bike', bikeDuration, isLong);
      workouts.push({
        discipline: 'bike',
        duration: bikeDur,
        intensity,
        isLong,
        suggestion: getWorkoutSuggestion('bike', intensity, isLong, phase, bikeDur, bikeFtp, { readinessTier }),
      });
    }
    for (let i = 0; i < (isRecoveryWeek ? Math.max(1, weekSwimSessions - 1) : weekSwimSessions); i++) {
      const totalSwimSessions = isRecoveryWeek ? Math.max(1, weekSwimSessions - 1) : weekSwimSessions;
      const isLongSwim = isKeySessionIndex(i, totalSwimSessions, keySessionByDiscipline.swim);
      const proposedIntensity = getSessionIntensity(i, weekSwimSessions, polarized, isLongSwim, phase, weeklyHours, trainingWeekNumber);
      const intensity = gateIntensity(proposedIntensity, 'swim', {
        readinessTier,
        phase,
        riskLevel: weeklyRiskLevel,
        easyDuration: swimDuration,
        stableWeeks: effectiveStableWeeksByDiscipline.swim,
        preRecoveryStableWeeks: lastNonRecoveryStableWeeksByDiscipline.swim,
        thresholdWeeks: thresholdWeeksByDiscipline.swim,
        lastWeekWasRecovery: prevWeekWasRecovery,
        trainingWeekNumber,
        totalSessions: totalSwimSessions,
        isLong: isLongSwim,
        isRecoveryWeek,
      });
      if (intensity === 'threshold-lite' || intensity === 'threshold' || intensity === 'interval') weekThresholdHits.swim = true;
      const swimDur = computeLongDuration('swim', swimDuration, isLongSwim);
      workouts.push({
        discipline: 'swim',
        duration: swimDur,
        intensity,
        isLong: isLongSwim,
        suggestion: getWorkoutSuggestion('swim', intensity, isLongSwim, phase, swimDur, null, { readinessTier }),
      });
    }
    for (let i = 0; i < (isRecoveryWeek ? Math.max(1, weekStrengthSessions - 1) : weekStrengthSessions); i++) {
      workouts.push({
        discipline: 'strength',
        duration: 60,
        intensity: 'easy',
      });
    }

    // Add brick run on selected build/peak weeks
    if (brickWeekSet.has(trainingWeekIdx) && !isRecoveryWeek && !isRaceWeek && weekBikeSessions > 0) {
      const brickDuration = BRICK_RUN_MINUTES[raceType] || 15;
      workouts.push({
        discipline: 'run',
        duration: brickDuration,
        intensity: 'easy',
        isLong: false,
        isBrick: true,
        suggestion: 'Brick run off the bike @ zone 2',
      });
    }

    // Sort: long sessions to long day, spread others out
    const longWorkouts = workouts.filter(w => w.isLong);
    const brickWorkout = workouts.find(w => w.isBrick);
    const regularWorkouts = workouts.filter(w => !w.isBrick && (!w.isLong || w.discipline === 'swim'));

    // Place rest on rest days
    restDayIndices.forEach(ri => {
      daySlots[ri].push({ discipline: 'rest', duration: 0, intensity: 'rest' });
    });

    // Determine second long day for long run (day before longDay, skipping rest)
    let secondLongDay = (longDay + 6) % 7;
    while (restDayIndices.includes(secondLongDay) && secondLongDay !== longDay) {
      secondLongDay = (secondLongDay + 6) % 7;
    }

    // Place long workouts: bike always on longDay, run on separate day (unless big block week)
    const isBigBlockWeek = bigBlockWeekSet.has(trainingWeekIdx);
    const longBike = longWorkouts.find(w => w.discipline === 'bike');
    const longRun = longWorkouts.find(w => w.discipline === 'run');

    if (longBike) daySlots[longDay].push(longBike);
    if (longRun) {
      if (isBigBlockWeek) {
        daySlots[longDay].push(longRun);
      } else {
        daySlots[secondLongDay].push(longRun);
      }
    }

    // Place brick run on long day after long bike
    if (brickWorkout) {
      daySlots[longDay].push(brickWorkout);
    }

    // Available training days (excluding rest)
    const availableDays = [];
    for (let d = 0; d < 7; d++) {
      if (d < raceWeekTrainingWindowEnd && !restDayIndices.includes(d)) {
        availableDays.push(d);
      }
    }

    // Helper: check which disciplines are on a given day
    function disciplinesOnDay(d) {
      return daySlots[d].filter(w => w.discipline !== 'rest').map(w => w.discipline);
    }

    // Helper: minimum distance (in days) to nearest same-discipline session
    function minDistanceToDiscipline(d, discipline) {
      let minDist = 7;
      for (let offset = 1; offset <= 6; offset++) {
        const before = (d - offset + 7) % 7;
        const after = (d + offset) % 7;
        if (disciplinesOnDay(before).includes(discipline)) {
          minDist = Math.min(minDist, offset);
        }
        if (disciplinesOnDay(after).includes(discipline)) {
          minDist = Math.min(minDist, offset);
        }
      }
      return minDist;
    }

    // Score a day for placing a workout: lower = better
    function scoreDayForWorkout(d, discipline) {
      if (restDayIndices.includes(d)) return Infinity;

      const sameDisciplineOnDay = disciplinesOnDay(d).includes(discipline);
      if (sameDisciplineOnDay) return Infinity;

      const totalOnDay = disciplinesOnDay(d).length;
      const dist = minDistanceToDiscipline(d, discipline);

      // Primary: maximize distance between same-discipline sessions
      // Adjacent (dist=1) is very heavily penalized
      // Secondary: prefer days with fewer workouts
      let score = 0;
      if (dist === 1) score += 200;       // adjacent: near-impossible
      else if (dist === 2) score += 40;   // 1-day gap: avoid if possible
      score += totalOnDay * 30;           // prefer emptier days

      return score;
    }

    // Group regular workouts by discipline, then interleave placement
    // to distribute evenly. Place disciplines with most sessions first.
    const byDiscipline = {};
    regularWorkouts.forEach(w => {
      if (!byDiscipline[w.discipline]) byDiscipline[w.discipline] = [];
      byDiscipline[w.discipline].push(w);
    });

    // Sort disciplines by session count descending (most constrained first)
    const disciplineOrder = Object.keys(byDiscipline).sort(
      (a, b) => byDiscipline[b].length - byDiscipline[a].length
    );

    // For each discipline, calculate ideal spacing and place sessions
    disciplineOrder.forEach(discipline => {
      const sessions = byDiscipline[discipline];
      const count = sessions.length;

      // Calculate ideal day positions (evenly spaced across available days)
      // Skip longDay if this discipline already has a long session there
      const daysForThis = availableDays.filter(d => {
        // Don't place if already has this discipline (from long workouts)
        return !disciplinesOnDay(d).includes(discipline);
      });

      // Place each session on the best scoring day
      sessions.forEach(workout => {
        let bestDay = availableDays[0];
        let bestScore = Infinity;

        for (const d of availableDays) {
          const score = scoreDayForWorkout(d, workout.discipline);
          if (score < bestScore) {
            bestScore = score;
            bestDay = d;
          }
        }

        daySlots[bestDay].push(workout);
      });
    });

    // Fill empty non-rest days for recovery week with rest
    if (isRecoveryWeek) {
      for (let d = 0; d < 7; d++) {
        if (daySlots[d].length === 0) {
          daySlots[d].push(buildRestWorkout());
        }
      }
    }

    if (isRaceWeek) {
      daySlots[raceDayIdx].push(buildRaceWorkout(raceType));
    }

    for (let d = 0; d < 7; d++) {
      if (daySlots[d].length === 0 && isRaceWeek && d > raceDayIdx) {
        daySlots[d].push(buildRestWorkout());
      }
    }

    const totalSessions = countPlannedSessions(daySlots);

    const week = {
      weekNumber: w + 1,
      weekStart,
      isVacation: false,
      isRaceWeek,
      raceDayIdx: isRaceWeek ? raceDayIdx : null,
      raceType: isRaceWeek ? raceType : null,
      isRecovery: isRecoveryWeek,
      isTaper: isRaceWeek || isTaperWeek || isLastTrainingWeek,
      phase,
      days: daySlots,
      totalSessions,
      readinessTier,
      riskLevel: weeklyRiskLevel,
      progressionStage,
    };
    finalizeRaceWeekLayout(week);
    weeks.push(week);

    const longRunWorkout = workouts.find(work => work.discipline === 'run' && work.isLong);
    const longBikeWorkout = workouts.find(work => work.discipline === 'bike' && work.isLong);
    const longSwimWorkout = workouts.find(work => work.discipline === 'swim' && work.isLong);
    prevWeekDurations = {
      run: runDuration,
      bike: bikeDuration,
      swim: swimDuration,
      longRun: longRunWorkout ? longRunWorkout.duration : runDuration,
      longBike: longBikeWorkout ? longBikeWorkout.duration : bikeDuration,
      longSwim: longSwimWorkout ? longSwimWorkout.duration : swimDuration,
    };
    if (!isRecoveryWeek && !isRaceWeek) {
      lastNonRecoveryDurations = prevWeekDurations;
    }

    ['run', 'bike', 'swim'].forEach(discipline => {
      if (weekThresholdHits[discipline]) {
        thresholdWeeksByDiscipline[discipline] += 1;
      }
    });

    const noviceDurabilityThresholds = INTENSITY_UNLOCKS.novice;
    const durableByDiscipline = {
      run: runDuration >= noviceDurabilityThresholds.run,
      bike: bikeDuration >= noviceDurabilityThresholds.bike,
      swim: swimDuration >= noviceDurabilityThresholds.swim,
    };
    ['run', 'bike', 'swim'].forEach(discipline => {
      if (!isRecoveryWeek && !isRaceWeek && durableByDiscipline[discipline]) {
        stableWeeksByDiscipline[discipline] += 1;
      } else {
        stableWeeksByDiscipline[discipline] = 0;
      }
    });
    if (!isRecoveryWeek && !isRaceWeek) {
      lastNonRecoveryStableWeeksByDiscipline = { ...stableWeeksByDiscipline };
    }
    prevWeekWasRecovery = isRecoveryWeek;

    if (isTrainableRaceWeek) {
      trainingWeekIdx++;
    }
  }

  const grouped = groupWeeks(weeks);
  grouped.forEach(group => {
    group.meta = {
      readinessTier,
      riskAssessment,
      missingCapacities,
    };
  });
  return grouped;
}

function getSessionIntensity(sessionIndex, totalSessions, polarized, isLong, phase, weeklyHours, trainingWeekNumber = 1) {
  const isLowVolume = weeklyHours === 'lt3' || weeklyHours === '3-6';
  const easyOrTempo = isLowVolume ? 'tempo' : 'easy';

  if (!polarized) return easyOrTempo;
  if (isLong) return 'easy';
  if (totalSessions <= 1) return easyOrTempo;

  if (phase === 'base') {
    if (sessionIndex !== 0) return easyOrTempo;
    if (trainingWeekNumber < BASE_QUALITY_START_WEEK) return easyOrTempo;
    return 'threshold-lite';
  }

  if (phase === 'build') {
    if (sessionIndex === 0 && totalSessions >= 2) return isLowVolume ? 'threshold-lite' : 'threshold';
    return easyOrTempo;
  }

  if (phase === 'peak') {
    if (sessionIndex === 0 && totalSessions >= 2) return 'threshold';
    if (sessionIndex === 2 && totalSessions >= 4) return 'interval';
    return easyOrTempo;
  }

  if (phase === 'taper') {
    if (sessionIndex === 0 && totalSessions >= 2) return 'threshold-lite';
    return easyOrTempo;
  }

  return easyOrTempo;
}

function getRestDayIndices(restDays, longDay) {
  if (restDays === 0) return [];

  // Common rest days: Thursday (3), then Sunday (6)
  const preferredRest = [3, 6, 0, 2, 1, 4, 5];
  const indices = [];

  for (const d of preferredRest) {
    if (indices.length >= restDays) break;
    if (d !== longDay) {
      indices.push(d);
    }
  }
  return indices;
}

function groupWeeks(weeks) {
  // Each week gets its own row for individual progress tracking
  return weeks.map(week => ({
    startWeek: week.weekNumber,
    endWeek: week.weekNumber,
    weeks: [week],
    template: week,
  }));
}

function weeksAreSimilar(a, b) {
  if (a.isRecovery !== b.isRecovery) return false;
  if (a.isTaper !== b.isTaper) return false;

  // Check same disciplines on same days
  for (let d = 0; d < 7; d++) {
    const aDisciplines = a.days[d].map(w => w.discipline).sort().join(',');
    const bDisciplines = b.days[d].map(w => w.discipline).sort().join(',');
    if (aDisciplines !== bDisciplines) return false;
  }
  return true;
}

// === Date Formatting ===

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWeekDateRange(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const sDay = start.getDate();
  const eDay = end.getDate();
  const sMonth = MONTH_SHORT[start.getMonth()];
  const eMonth = MONTH_SHORT[end.getMonth()];

  if (sMonth === eMonth) {
    return `${sDay}–${eDay} ${sMonth}`;
  }
  return `${sDay} ${sMonth} – ${eDay} ${eMonth}`;
}

// === Rendering ===

// Store current plan data so we can mutate it on drag
let currentGroups = [];

function renderPlan(groups) {
  currentGroups = groups;
  const grid = document.getElementById('plan-grid');
  grid.innerHTML = '';

  // Day header row
  const headerRow = document.createElement('div');
  headerRow.className = 'week-row day-header-row';

  const headerLabel = document.createElement('div');
  headerLabel.className = 'week-label';
  headerRow.appendChild(headerLabel);

  DAYS.forEach(day => {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.textContent = day;
    headerRow.appendChild(cell);
  });
  grid.appendChild(headerRow);

  // Render each group
  groups.forEach((group, groupIdx) => {
    const isVacation = group.template.isVacation;

    const row = document.createElement('div');
    row.className = 'week-row' + (isVacation ? ' vacation-week' : '');
    row.dataset.groupIdx = groupIdx;

    // Week label
    const label = document.createElement('div');
    label.className = 'week-label';

    const name = document.createElement('div');
    name.className = 'week-name';
    name.textContent = group.startWeek === group.endWeek
      ? `Week ${group.startWeek}`
      : `Week ${group.startWeek}-${group.endWeek}`;
    label.appendChild(name);

    const dateEl = document.createElement('div');
    dateEl.className = 'week-date';
    dateEl.textContent = formatWeekDateRange(group.template.weekStart);
    label.appendChild(dateEl);

    if (isVacation) {
      const badge = document.createElement('div');
      badge.className = 'vacation-badge';
      badge.textContent = 'VACATION';
      label.appendChild(badge);
    } else {
      const progressWrap = document.createElement('div');
      progressWrap.className = 'week-progress-wrap';

      const meta = document.createElement('span');
      meta.className = 'week-meta week-progress';
      meta.textContent = `0/${group.template.totalSessions}`;
      progressWrap.appendChild(meta);

      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      const fill = document.createElement('div');
      fill.className = 'progress-fill';
      fill.style.width = '0%';
      bar.appendChild(fill);
      progressWrap.appendChild(bar);

      label.appendChild(progressWrap);

      if (group.template.isRecovery) {
        const badge = document.createElement('div');
        badge.className = 'phase-badge phase-recovery';
        badge.textContent = 'RECOVERY';
        label.appendChild(badge);
      }
      if (group.template.isTaper && !group.template.isRecovery) {
        const badge = document.createElement('div');
        badge.className = 'phase-badge phase-taper';
        badge.textContent = 'TAPER';
        label.appendChild(badge);
      }
      if (!group.template.isRecovery && !group.template.isTaper && group.template.phase) {
        const phaseBadge = document.createElement('div');
        phaseBadge.className = `phase-badge phase-${group.template.phase}`;
        phaseBadge.textContent = group.template.phase.toUpperCase();
        label.appendChild(phaseBadge);
      }
    }

    row.appendChild(label);

    // Day cells
    for (let d = 0; d < 7; d++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      cell.dataset.groupIdx = groupIdx;
      cell.dataset.dayIdx = d;

      if (!isVacation) {
        const dayWorkouts = group.template.days[d];
        dayWorkouts.forEach((workout, workoutIdx) => {
          const block = createWorkoutBlock(workout, groupIdx, d, workoutIdx, false);
          cell.appendChild(block);
        });
      }

      row.appendChild(cell);
    }

    grid.appendChild(row);
  });

  grid.querySelectorAll('.week-row[data-group-idx]').forEach(row => {
    const idx = parseInt(row.dataset.groupIdx);
    if (currentGroups[idx]) updateProgress(row, currentGroups[idx]);
  });
}

// === Drag and Drop (mouse-based for full cursor control) ===

let dragData = null;
let dragGhost = null;
let dragSource = null;
let isDragging = false;
let lastDropTarget = null;
const DRAG_THRESHOLD = 5;

function getDraggedWorkout() {
  if (!dragData) return null;
  const group = currentGroups[dragData.groupIdx];
  if (!group) return null;
  const dayWorkouts = group.template.days[dragData.dayIdx];
  if (!dayWorkouts) return null;
  return dayWorkouts[dragData.workoutIdx] || null;
}

function findCellUnderPoint(x, y) {
  if (dragGhost) dragGhost.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  if (dragGhost) dragGhost.style.display = '';
  return el?.closest('.day-cell[data-day-idx][data-group-idx]') || null;
}

function cleanupDrag() {
  if (dragGhost) {
    dragGhost.remove();
    dragGhost = null;
  }
  if (dragSource) {
    dragSource.classList.remove('dragging');
  }
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.day-cell.drag-over, .day-cell.drag-over-warn').forEach(c => {
    c.classList.remove('drag-over', 'drag-over-warn');
  });
  dragData = null;
  dragSource = null;
  lastDropTarget = null;
  isDragging = false;
}

function initDrag(e, block) {
  if (isDragging) return;

  const startX = e.clientX;
  const startY = e.clientY;

  const onMove = (me) => {
    me.preventDefault();
    const dx = me.clientX - startX;
    const dy = me.clientY - startY;

    if (!isDragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      isDragging = true;
      dragSource = block;
      dragData = {
        groupIdx: parseInt(block.dataset.groupIdx),
        dayIdx: parseInt(block.dataset.dayIdx),
        workoutIdx: parseInt(block.dataset.workoutIdx),
      };

      block.classList.add('dragging');
      document.body.classList.add('is-dragging');

      dragGhost = block.cloneNode(true);
      dragGhost.classList.add('drag-ghost');
      dragGhost.style.width = block.offsetWidth + 'px';
      document.body.appendChild(dragGhost);
    }

    if (isDragging && dragGhost) {
      dragGhost.style.left = (me.clientX - dragGhost.offsetWidth / 2) + 'px';
      dragGhost.style.top = (me.clientY - 10) + 'px';

      document.querySelectorAll('.day-cell.drag-over, .day-cell.drag-over-warn').forEach(c => {
        c.classList.remove('drag-over', 'drag-over-warn');
      });

      const cell = findCellUnderPoint(me.clientX, me.clientY);
      lastDropTarget = cell;

      if (cell && dragData) {
        const targetGroup = parseInt(cell.dataset.groupIdx);
        const targetDay = parseInt(cell.dataset.dayIdx);
        if (targetGroup === dragData.groupIdx) {
          const targetWeek = currentGroups[targetGroup]?.template;
          if (targetWeek?.isRaceWeek && targetDay >= targetWeek.raceDayIdx) {
            lastDropTarget = null;
            return;
          }
          const workout = getDraggedWorkout();
          if (workout) {
            const hasConflict = wouldCauseAdjacentConflict(
              currentGroups[targetGroup], targetDay, workout.discipline, dragData.dayIdx
            );
            cell.classList.add(hasConflict ? 'drag-over-warn' : 'drag-over');
          }
        }
      }
    }
  };

  const onUp = (me) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);

    if (!isDragging) return;

    // Use the last cell we hovered over during movement
    const cell = lastDropTarget;
    if (cell && dragData) {
      const isTemplate = !!cell.closest('#template-grid');
      if (isTemplate) {
        performTemplateDrop(cell);
      } else {
        performPlanDrop(cell);
      }
    }

    cleanupDrag();
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function performPlanDrop(cell) {
  if (!dragData) return;

  const targetGroupIdx = parseInt(cell.dataset.groupIdx);
  const targetDayIdx = parseInt(cell.dataset.dayIdx);
  const sourceGroupIdx = dragData.groupIdx;
  const sourceDayIdx = dragData.dayIdx;
  const workoutIdx = dragData.workoutIdx;

  if (isNaN(targetGroupIdx) || isNaN(targetDayIdx)) return;
  if (targetGroupIdx !== sourceGroupIdx) return;
  if (targetDayIdx === sourceDayIdx) return;

  const groupIdx = sourceGroupIdx;
  if (!currentGroups[groupIdx]) return;
  const days = currentGroups[groupIdx].template.days;

  const workout = days[sourceDayIdx]?.[workoutIdx];
  if (!workout) return;
  if (workout.isRace) return;
  if (
    currentGroups[groupIdx]?.template?.isRaceWeek &&
    (
      sourceDayIdx >= currentGroups[groupIdx].template.raceDayIdx ||
      targetDayIdx >= currentGroups[groupIdx].template.raceDayIdx ||
      days[targetDayIdx]?.some(w => w.isRace)
    )
  ) {
    return;
  }

  // Map workout objects to their old keys before the move
  const oldKeyMap = new Map();
  for (let d = 0; d < 7; d++) {
    days[d].forEach((w, wi) => {
      oldKeyMap.set(w, `${groupIdx}-${d}-${wi}`);
    });
  }

  const targetHasRest = days[targetDayIdx].some(w => w.discipline === 'rest');
  const sourceIsRest = workout.discipline === 'rest';

  if (sourceIsRest) {
    const targetWorkouts = days[targetDayIdx].splice(0);
    const sourceRest = days[sourceDayIdx].splice(workoutIdx, 1);
    days[targetDayIdx].push(...sourceRest);
    days[sourceDayIdx].push(...targetWorkouts);
  } else if (targetHasRest) {
    const restIdx = days[targetDayIdx].findIndex(w => w.discipline === 'rest');
    days[targetDayIdx].splice(restIdx, 1);
    const [movedWorkout] = days[sourceDayIdx].splice(workoutIdx, 1);
    days[targetDayIdx].push(movedWorkout);
  } else {
    const [movedWorkout] = days[sourceDayIdx].splice(workoutIdx, 1);
    days[targetDayIdx].push(movedWorkout);
  }

  for (let d = 0; d < 7; d++) {
    if (days[d].length === 0) {
      days[d].push({ discipline: 'rest', duration: 0, intensity: 'rest' });
    }
  }

  // Migrate completion/skipped keys using object identity
  const migratedCompleted = new Set();
  const migratedSkipped = new Set();
  for (let d = 0; d < 7; d++) {
    days[d].forEach((w, wi) => {
      const newKey = `${groupIdx}-${d}-${wi}`;
      const oldKey = oldKeyMap.get(w);
      if (oldKey) {
        if (completedWorkouts.has(oldKey)) migratedCompleted.add(newKey);
        if (skippedWorkouts.has(oldKey)) migratedSkipped.add(newKey);
        completedWorkouts.delete(oldKey);
        skippedWorkouts.delete(oldKey);
      }
    });
  }
  migratedCompleted.forEach(k => completedWorkouts.add(k));
  migratedSkipped.forEach(k => skippedWorkouts.add(k));

  currentGroups[groupIdx].template.totalSessions = countPlannedSessions(days);

  weekOverrides[groupIdx] = JSON.parse(JSON.stringify(days));

  rerenderWeekRow(groupIdx);
  savePlanToStorage();
}

function rerenderWeekRow(groupIdx) {
  const planGrid = document.getElementById('plan-grid');
  if (!planGrid) return;
  const row = planGrid.querySelector(`.week-row[data-group-idx="${groupIdx}"]`);
  if (!row) return;

  const group = currentGroups[groupIdx];
  const dayCells = row.querySelectorAll('.day-cell');

  dayCells.forEach((cell, d) => {
    cell.innerHTML = '';
    const dayWorkouts = group.template.days[d];
    dayWorkouts.forEach((workout, workoutIdx) => {
      const block = createWorkoutBlock(workout, groupIdx, d, workoutIdx, false);
      cell.appendChild(block);
    });
  });

  updateProgress(row, group);
}

// === Adjacency conflict checking ===

function wouldCauseAdjacentConflict(group, targetDay, discipline, excludeDay) {
  const days = group.template.days;
  const prev = (targetDay + 6) % 7;
  const next = (targetDay + 1) % 7;

  for (const adjDay of [prev, next]) {
    if (adjDay === excludeDay) continue; // workout is being moved FROM here
    if (days[adjDay].some(w => w.discipline === discipline)) {
      return true;
    }
  }
  return false;
}

function checkAdjacentConflicts() {
  // Remove old warnings
  document.querySelectorAll('.workout-block.adjacent-warning').forEach(el => {
    el.classList.remove('adjacent-warning');
  });

  currentGroups.forEach((group, groupIdx) => {
    const days = group.template.days;
    for (let d = 0; d < 7; d++) {
      const nextDay = (d + 1) % 7;
      days[d].forEach(workout => {
        if (workout.discipline === 'rest') return;
        if (days[nextDay].some(w => w.discipline === workout.discipline)) {
          // Find the DOM blocks and mark them
          const selector = `.week-row[data-group-idx="${groupIdx}"] .day-cell[data-day-idx="${d}"] .workout-block.workout-${workout.discipline}`;
          const nextSelector = `.week-row[data-group-idx="${groupIdx}"] .day-cell[data-day-idx="${nextDay}"] .workout-block.workout-${workout.discipline}`;
          document.querySelectorAll(selector).forEach(el => el.classList.add('adjacent-warning'));
          document.querySelectorAll(nextSelector).forEach(el => el.classList.add('adjacent-warning'));
        }
      });
    }
  });
}

function updateProgress(row, group) {
  const completed = row.querySelectorAll('.workout-block.completed:not(.workout-rest):not(.workout-race)');
  const skipped = row.querySelectorAll('.workout-block.skipped:not(.workout-rest):not(.workout-race)');
  const total = group.template.totalSessions;
  const meta = row.querySelector('.week-progress');
  if (meta) {
    let text = `${completed.length}/${total}`;
    if (skipped.length > 0) {
      text += ` · ${skipped.length} skipped`;
    }
    meta.textContent = text;
  }
  const fill = row.querySelector('.progress-fill');
  if (fill) {
    const pct = total > 0 ? (completed.length / total) * 100 : 0;
    fill.style.width = `${pct}%`;
    fill.classList.toggle('progress-complete', completed.length + skipped.length === total && total > 0);
  }
  updateOverallProgress();
}

function updateOverallProgress() {
  const planGrid = document.getElementById('plan-grid');
  if (!planGrid) return;
  let totalAll = 0;
  let completedAll = 0;
  let skippedAll = 0;
  currentGroups.forEach((group, idx) => {
    const row = planGrid.querySelector(`.week-row[data-group-idx="${idx}"]`);
    if (!row) return;
    totalAll += group.template.totalSessions;
    completedAll += row.querySelectorAll('.workout-block.completed:not(.workout-rest):not(.workout-race)').length;
    skippedAll += row.querySelectorAll('.workout-block.skipped:not(.workout-rest):not(.workout-race)').length;
  });

  const resolved = completedAll + skippedAll;
  const progressPct = totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0;

  const progressText = document.getElementById('overall-progress-text');
  if (progressText) {
    progressText.textContent = resolved > 0
      ? `${completedAll}/${totalAll} (${progressPct}%)`
      : '0%';
  }
  const progressFill = document.getElementById('overall-progress-fill');
  if (progressFill) {
    progressFill.style.width = `${progressPct}%`;
    progressFill.classList.toggle('progress-complete', completedAll === totalAll && totalAll > 0);
  }

  const consistencyPct = resolved > 0 ? Math.round((completedAll / resolved) * 100) : 0;
  const consistencyText = document.getElementById('overall-consistency-text');
  if (consistencyText) {
    consistencyText.textContent = resolved > 0 ? `${consistencyPct}%` : '—';
  }
  const consistencyFill = document.getElementById('overall-consistency-fill');
  if (consistencyFill) {
    consistencyFill.style.width = resolved > 0 ? `${consistencyPct}%` : '0%';
    consistencyFill.classList.toggle('progress-complete', consistencyPct === 100 && resolved > 0);
  }
}

// === Config & State ===

function getConfig() {
  return {
    raceType: document.getElementById('race-type').value,
    raceDate: document.getElementById('race-date').value,
    planStart: document.getElementById('plan-start').value,
    experience: document.getElementById('tri-experience').value,
    weeklyHours: document.getElementById('weekly-hours').value,
    strongestDiscipline: document.getElementById('strongest-discipline').value,
    runCapacity: document.getElementById('run-capacity').value,
    bikeCapacity: document.getElementById('bike-capacity').value,
    swimCapacity: document.getElementById('swim-capacity').value,
    runBenchmarkDist: document.getElementById('run-bench-dist').value,
    runBenchmarkTime: document.getElementById('run-bench-time').value,
    bikeBenchmarkType: document.getElementById('bike-bench-type').value,
    bikeBenchmarkValue: document.getElementById('bike-bench-value').value,
    swimBenchmarkDist: document.getElementById('swim-bench-dist').value,
    swimBenchmarkTime: document.getElementById('swim-bench-time').value,
    runSessions: parseInt(document.getElementById('run-sessions').value) || 0,
    bikeSessions: parseInt(document.getElementById('bike-sessions').value) || 0,
    swimSessions: parseInt(document.getElementById('swim-sessions').value) || 0,
    strengthSessions: parseInt(document.getElementById('strength-sessions').value) || 0,
    restDays: parseInt(document.getElementById('rest-days').value) || 0,
    polarized: document.getElementById('polarized').checked,
    recoveryWeeks: document.getElementById('recovery-weeks').checked,
    showWattage: document.getElementById('show-wattage').checked,
    longDay: parseInt(document.getElementById('long-day').value),
  };
}

function configToFitnessLevels(config) {
  return getFitnessLevels(
    {
      experience: config.experience,
      weeklyHours: config.weeklyHours,
      strongest: config.strongestDiscipline,
      runCapacity: config.runCapacity,
      bikeCapacity: config.bikeCapacity,
      swimCapacity: config.swimCapacity,
    },
    {
      runDist: config.runBenchmarkDist, runTime: config.runBenchmarkTime,
      bikeType: config.bikeBenchmarkType, bikeValue: config.bikeBenchmarkValue,
      swimDist: config.swimBenchmarkDist, swimTime: config.swimBenchmarkTime,
    }
  );
}

function validateConfig(config) {
  const result = { error: null, warnings: [], riskAssessment: null };
  const warningMap = new Map();
  const addWarning = (key, text) => {
    if (!key || !text || warningMap.has(key)) return;
    warningMap.set(key, text);
  };

  if (!config.experience || !config.weeklyHours || !config.strongestDiscipline) {
    result.error = 'Vul je fitnessprofiel volledig in.';
    return result;
  }
  if (!config.raceDate) {
    result.error = 'Kies een wedstrijddatum.';
    return result;
  }
  if (!config.planStart) {
    result.error = 'Kies een startdatum voor je schema.';
    return result;
  }
  if (new Date(config.planStart) >= new Date(config.raceDate)) {
    result.error = 'De startdatum van je schema moet voor de wedstrijddatum liggen.';
    return result;
  }

  const capacities = getCapacitiesFromConfig(config);
  const capacityInputs = [
    { key: 'run', value: config.runCapacity, max: 300 },
    { key: 'bike', value: config.bikeCapacity, max: 480 },
    { key: 'swim', value: config.swimCapacity, max: 240 },
  ];
  for (const input of capacityInputs) {
    if (input.value === '' || input.value == null) continue;
    if (parseCapacityMinutes(input.value, input.max) == null) {
      result.error = `Vul een geldige ${DISCIPLINE_LABELS_NL[input.key] || input.key}-capaciteit in minuten in.`;
      return result;
    }
  }

  const fitness = configToFitnessLevels(config);
  const readinessTier = computeReadinessTier(config, fitness, capacities);
  const weeksToRace = getRaceWeekContext(config.planStart, config.raceDate).totalWeeks;
  const riskAssessment = assessPlanRisk(config, capacities, config.raceType, weeksToRace, readinessTier);
  result.riskAssessment = riskAssessment;

  if (riskAssessment.level === 'unsafe') {
    result.error =
      `Onveilige schema-instelling:\n- ${riskAssessment.reasons.join('\n- ')}\n\n` +
      'Probeer de wedstrijddatum later te zetten, een kortere afstand te kiezen, het aantal sessies te verlagen of de verwachte intensiteit te verlagen.';
    return result;
  }
  if (riskAssessment.level === 'high' || riskAssessment.level === 'moderate') {
    addWarning(
      `risk-${riskAssessment.level}`,
      `${(RISK_LEVEL_LABELS_NL[riskAssessment.level] || riskAssessment.level).toUpperCase()} risico:\n- ${riskAssessment.reasons.join('\n- ')}`
    );
  }

  const totalSessions = config.runSessions + config.bikeSessions +
    config.swimSessions + config.strengthSessions;
  if (totalSessions + config.restDays > 10) {
    addWarning('session-density', 'Te veel sessies plus rustdagen voor een week van 7 dagen. Sommige dagen krijgen meerdere sessies.');
  }

  if (capacities.run != null && capacities.run < 20 && config.runSessions >= 3) {
    addWarning('capacity-run', 'Je loopcapaciteit is laag voor 3 of meer loopsessies.');
  }
  if (capacities.bike != null && capacities.bike < 45 && config.bikeSessions >= 3) {
    addWarning('capacity-bike', 'Je fietscapaciteit is laag voor 3 of meer fietssessies.');
  }
  if (capacities.swim != null && capacities.swim < 15 && config.swimSessions >= 3) {
    addWarning('capacity-swim', 'Je zwemcapaciteit is laag voor 3 of meer zwemsessies.');
  }

  // Smart weekly-volume warning: guidance only, never a hard block
  const volumeGap = assessWeeklyVolumeGap(config, readinessTier, capacities, weeksToRace);
  if (volumeGap.isGap) {
    const raceLabel = RACE_LABELS[config.raceType] || config.raceType;
    const currentHoursLabel = WEEKLY_HOURS_LABELS[config.weeklyHours] || config.weeklyHours;
    const recommendedHoursLabel = volumeGap.recommendedWeeklyHours
      ? (WEEKLY_HOURS_LABELS[volumeGap.recommendedWeeklyHours] || volumeGap.recommendedWeeklyHours)
      : null;
    const strengthContext = (Number(config.strengthSessions) || 0) > 1
      ? ` Met ${config.strengthSessions} krachtsessies gaat ook ongeveer ${config.strengthSessions * 60} min/week naar krachttraining.`
      : '';
    const conciseSummary =
      `Mismatch in weekbudget: ${currentHoursLabel} kan te krap zijn om goed voor ${raceLabel} te trainen. ` +
      `Geschatte piek-lange sessies met dit budget zijn ~${volumeGap.feasible.runLong}m lopen / ` +
      `~${volumeGap.feasible.bikeLong}m fietsen / ~${volumeGap.feasible.swimLong}m zwemmen.${strengthContext}`;
    const budgetRecommendation = recommendedHoursLabel
      ? `Een realistischer weekbudget is waarschijnlijk ${recommendedHoursLabel}.`
      : 'Ook met deze aanlooptijd kan het huidige weekbudget beperkend blijven voor race-specifiek piekvolume.';
    const suggestionLine = volumeGap.suggestions.join(' ');

    const uniqueReasonKeys = [...new Set(volumeGap.reasonKeys)];
    const uniqueReasons = uniqueReasonKeys
      .map(key => {
        const idx = volumeGap.reasonKeys.indexOf(key);
        return idx >= 0 ? volumeGap.reasons[idx] : null;
      })
      .filter(Boolean);

    if (riskAssessment.level === 'high') {
      const riskKey = 'risk-high';
      const existing = warningMap.get(riskKey) || 'HOOG risico:';
      warningMap.set(
        riskKey,
        `${existing}\n\n${conciseSummary}\n${budgetRecommendation}\n${suggestionLine}`
      );
    } else {
      addWarning(
        'volume-gap',
        `${conciseSummary}\n${budgetRecommendation}\n- ${uniqueReasons.join('\n- ')}\n${suggestionLine}`
      );
    }
  }

  result.warnings = [...warningMap.values()];
  return result;
}

// === Template Week ===

// The template stores which discipline goes on which day (day layout)
// This is separate from the full plan which has varying durations per week
let currentTemplate = null; // { days: [[{discipline, intensity}], ...] }
let currentPlanConfig = null;
let currentVacations = []; // [{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }, ...]
let completedWorkouts = new Set();
let skippedWorkouts = new Set();
let weekOverrides = {};
let templateReturnTo = 'settings';
let settingsReturnTo = null;
let savedPlanGroups = null;

function getLastTrackedWeekIdx() {
  let lastIdx = -1;
  for (const key of completedWorkouts) {
    const idx = parseInt(key.split('-')[0]);
    if (idx > lastIdx) lastIdx = idx;
  }
  for (const key of skippedWorkouts) {
    const idx = parseInt(key.split('-')[0]);
    if (idx > lastIdx) lastIdx = idx;
  }
  return lastIdx;
}

function generateTemplate(config) {
  const fitness = configToFitnessLevels(config);
  const planConfig = {
    ...config,
    runLevel: fitness.run.level,
    bikeLevel: fitness.bike.level,
    swimLevel: fitness.swim.level,
  };

  // Generate full plan to get the first normal week's layout
  const groups = generatePlan(planConfig);
  const firstGroup = groups[0];
  if (!firstGroup) return null;

  // Extract day layout from first week (discipline + intensity, no durations)
  const templateDays = firstGroup.template.days.map(day =>
    day.map(w => ({
      discipline: w.discipline,
      intensity: w.intensity,
      isLong: w.isLong || false,
      isBrick: w.isBrick || false,
    }))
  );

  // Auto-fill empty days with rest
  for (let d = 0; d < 7; d++) {
    if (templateDays[d].length === 0) {
      templateDays[d].push({ discipline: 'rest', intensity: 'rest', isLong: false });
    }
  }

  return { days: templateDays };
}

function renderTemplate(template) {
  currentTemplate = template;
  const grid = document.getElementById('template-grid');
  grid.innerHTML = '';

  // Wrap template as a fake "group" so we can reuse drag-and-drop
  const templateGroup = {
    startWeek: 0,
    endWeek: 0,
    template: {
      days: template.days.map(day =>
        day.map(w => ({ ...w, duration: w.discipline === 'rest' ? 0 : 30 }))
      ),
      totalSessions: template.days.flat().filter(w => w.discipline !== 'rest').length,
      isRecovery: false,
      isTaper: false,
    },
  };

  // Use currentGroups for drag-and-drop compatibility
  currentGroups = [templateGroup];

  // Day header row
  const headerRow = document.createElement('div');
  headerRow.className = 'week-row day-header-row';
  const headerLabel = document.createElement('div');
  headerLabel.className = 'week-label';
  headerRow.appendChild(headerLabel);

  DAYS.forEach(day => {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.textContent = day;
    headerRow.appendChild(cell);
  });
  grid.appendChild(headerRow);

  // Single template row
  const row = document.createElement('div');
  row.className = 'week-row';
  row.dataset.groupIdx = 0;

  const label = document.createElement('div');
  label.className = 'week-label';
  const name = document.createElement('div');
  name.className = 'week-name';
  name.textContent = 'Template';
  label.appendChild(name);
  const meta = document.createElement('div');
  meta.className = 'week-meta';
  meta.textContent = 'Drag to rearrange';
  label.appendChild(meta);
  row.appendChild(label);

  for (let d = 0; d < 7; d++) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.dataset.groupIdx = 0;
    cell.dataset.dayIdx = d;

    const dayWorkouts = templateGroup.template.days[d];
    dayWorkouts.forEach((workout, workoutIdx) => {
      const block = createWorkoutBlock(workout, 0, d, workoutIdx, true);
      cell.appendChild(block);
    });

    row.appendChild(cell);
  }

  grid.appendChild(row);
  checkAdjacentConflicts();
  renderVacations();
}

// === Vacation Editor ===

function renderVacations() {
  const list = document.getElementById('vacation-list');
  if (!list) return;
  list.innerHTML = '';

  const config = currentPlanConfig || getConfig();
  const minDate = config.planStart;
  const maxDate = config.raceDate;

  currentVacations.forEach((vacation, idx) => {
    const row = document.createElement('div');
    row.className = 'vacation-row';

    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.className = 'vacation-date';
    startInput.value = vacation.start || '';
    if (minDate) startInput.min = minDate;
    if (maxDate) startInput.max = maxDate;
    startInput.addEventListener('change', () => {
      currentVacations[idx].start = startInput.value;
      updateVacationDuration(row, currentVacations[idx]);
    });

    const toLabel = document.createElement('span');
    toLabel.className = 'vacation-to';
    toLabel.textContent = 'to';

    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.className = 'vacation-date';
    endInput.value = vacation.end || '';
    if (minDate) endInput.min = minDate;
    if (maxDate) endInput.max = maxDate;
    endInput.addEventListener('change', () => {
      currentVacations[idx].end = endInput.value;
      updateVacationDuration(row, currentVacations[idx]);
    });

    const duration = document.createElement('span');
    duration.className = 'vacation-duration';
    row.appendChild(startInput);
    row.appendChild(toLabel);
    row.appendChild(endInput);
    row.appendChild(duration);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'vacation-remove';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove vacation';
    removeBtn.addEventListener('click', () => {
      currentVacations.splice(idx, 1);
      renderVacations();
    });
    row.appendChild(removeBtn);

    list.appendChild(row);
    updateVacationDuration(row, vacation);
  });
}

function updateVacationDuration(row, vacation) {
  const el = row.querySelector('.vacation-duration');
  if (!el) return;
  if (!vacation.start || !vacation.end) {
    el.textContent = '';
    return;
  }
  const start = new Date(vacation.start);
  const end = new Date(vacation.end);
  if (end < start) {
    el.textContent = 'invalid';
    el.classList.add('vacation-duration-warn');
    return;
  }
  el.classList.remove('vacation-duration-warn');
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  if (days <= 6) {
    el.textContent = `${days} day${days > 1 ? 's' : ''}`;
  } else {
    const weeks = Math.ceil(days / 7);
    el.textContent = `~${weeks} week${weeks > 1 ? 's' : ''}`;
  }
}

function createWorkoutBlock(workout, groupIdx, dayIdx, workoutIdx, isTemplate) {
  const block = document.createElement('div');
  block.className = `workout-block ${getDisciplineClass(workout.discipline)}`;
  if (workout.isBrick) block.classList.add('workout-brick');
  if (workout.isRace) block.classList.add('race-block');
  block.dataset.groupIdx = groupIdx;
  block.dataset.dayIdx = dayIdx;
  block.dataset.workoutIdx = workoutIdx;

  if (!workout.isRace) {
    block.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      initDrag(e, block);
    });
  }

  const typeEl = document.createElement('div');
  typeEl.className = 'workout-type';
  if (workout.isRace) {
    const flag = document.createElement('div');
    flag.className = 'race-flag';
    flag.textContent = '\uD83C\uDFC1';
    block.appendChild(flag);
    typeEl.textContent = (workout.raceLabel || workout.raceType || 'Race').toUpperCase();
  } else {
    typeEl.textContent = workout.isBrick ? 'BRICK RUN' : getDisciplineLabel(workout.discipline);
  }
  block.appendChild(typeEl);

  const detailEl = document.createElement('div');
  detailEl.className = 'workout-detail';
  if (workout.isRace) {
    const dist = workout.raceDistances || RACE_DISTANCES[workout.raceType] || RACE_DISTANCES.olympic;
    detailEl.textContent = `${dist.swim}km / ${dist.bike}km / ${dist.run}km`;
  } else if (workout.discipline === 'rest') {
    detailEl.textContent = '—';
  } else if (workout.discipline === 'strength') {
    detailEl.textContent = 'full body';
  } else if (isTemplate) {
    // In template, show intensity instead of duration
    detailEl.textContent = getTemplateIntensityLabel(workout.intensity, workout.isLong);
  } else {
    detailEl.textContent = `${workout.duration} min`;
  }
  block.appendChild(detailEl);

  if (!isTemplate && workout.suggestion) {
    const suggEl = document.createElement('div');
    suggEl.className = 'workout-suggestion';
    suggEl.textContent = workout.suggestion;
    block.appendChild(suggEl);
  }

  if (!isTemplate && workout.discipline !== 'rest' && !workout.isRace) {
    const key = `${groupIdx}-${dayIdx}-${workoutIdx}`;
    if (completedWorkouts.has(key)) {
      block.classList.add('completed');
    }
    if (skippedWorkouts.has(key)) {
      block.classList.add('skipped');
    }

    const toggle = document.createElement('button');
    toggle.className = 'workout-status-toggle';
    toggle.setAttribute('aria-label', 'Toggle workout status');
    block.appendChild(toggle);

    toggle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = `${groupIdx}-${dayIdx}-${workoutIdx}`;
      const isCompleted = completedWorkouts.has(k);
      const isSkipped = skippedWorkouts.has(k);

      if (!isCompleted && !isSkipped) {
        completedWorkouts.add(k);
        block.classList.add('completed');
      } else if (isCompleted) {
        completedWorkouts.delete(k);
        block.classList.remove('completed');
        skippedWorkouts.add(k);
        block.classList.add('skipped');
      } else {
        skippedWorkouts.delete(k);
        block.classList.remove('skipped');
      }

      updateProgress(block.closest('.week-row'), currentGroups[groupIdx]);
      savePlanToStorage();
    });
  }

  return block;
}

function performTemplateDrop(cell) {
  if (!dragData) return;

  const targetDayIdx = parseInt(cell.dataset.dayIdx);
  if (isNaN(targetDayIdx)) return;
  const sourceDayIdx = dragData.dayIdx;
  const workoutIdx = dragData.workoutIdx;

  if (targetDayIdx === sourceDayIdx) return;

  if (!currentTemplate) return;
  const days = currentTemplate.days;
  const workout = days[sourceDayIdx]?.[workoutIdx];
  if (!workout) return;

  const targetHasRest = days[targetDayIdx].some(w => w.discipline === 'rest');
  const sourceIsRest = workout.discipline === 'rest';

  if (sourceIsRest) {
    // Dragging rest onto a day: swap all workouts on target day to source day
    const targetWorkouts = days[targetDayIdx].splice(0);
    const sourceRest = days[sourceDayIdx].splice(workoutIdx, 1);
    days[targetDayIdx].push(...sourceRest);
    days[sourceDayIdx].push(...targetWorkouts);
  } else if (targetHasRest) {
    // Dragging workout onto rest day: swap — move rest to source, workout to target
    const restIdx = days[targetDayIdx].findIndex(w => w.discipline === 'rest');
    const [rest] = days[targetDayIdx].splice(restIdx, 1);
    const [movedWorkout] = days[sourceDayIdx].splice(workoutIdx, 1);
    days[targetDayIdx].push(movedWorkout);
  } else {
    // Normal move: just move the workout
    const [movedWorkout] = days[sourceDayIdx].splice(workoutIdx, 1);
    days[targetDayIdx].push(movedWorkout);
  }

  // Auto-fill empty days with rest
  for (let d = 0; d < 7; d++) {
    if (days[d].length === 0) {
      days[d].push({ discipline: 'rest', intensity: 'rest', isLong: false });
    }
  }

  // Re-render template
  renderTemplate(currentTemplate);
}

// Apply template to generate full plan
function applyTemplateToFullPlan(template, config, vacations) {
  const fitness = configToFitnessLevels(config);
  const vacationWeekIndices = getVacationWeekIndices(vacations || [], config.planStart, config.raceDate);

  const planConfig = {
    ...config,
    runLevel: fitness.run.level,
    bikeLevel: fitness.bike.level,
    swimLevel: fitness.swim.level,
    vacationWeekIndices,
  };

  // Generate the base plan (for durations/volumes, with vacation weeks as rest)
  const groups = generatePlan(planConfig);

  // Override each non-vacation week's day layout with the template
  groups.forEach(group => {
    group.weeks.forEach(week => {
      if (week.isVacation) return;
      const raceDayIdx = week.isRaceWeek ? week.raceDayIdx : null;

      // Collect all workouts from this week, grouped by discipline
      const allWorkouts = {};
      for (let d = 0; d < 7; d++) {
        week.days[d].forEach(w => {
          if (w.isRace) return;
          if (!allWorkouts[w.discipline]) allWorkouts[w.discipline] = [];
          allWorkouts[w.discipline].push(w);
        });
      }

      // Clear all days
      for (let d = 0; d < 7; d++) {
        week.days[d] = [];
      }

      // Place workouts according to template layout
      for (let d = 0; d < 7; d++) {
        if (week.isRaceWeek && d >= raceDayIdx) continue;
        const templateDay = template.days[d];
        templateDay.forEach(templateWorkout => {
          const discipline = templateWorkout.discipline;
          const pool = allWorkouts[discipline];

          if (pool && pool.length > 0) {
            const wantBrick = templateWorkout.isBrick || false;
            // Find best matching workout (never swap brick/non-brick)
            let bestIdx = -1;
            for (let i = 0; i < pool.length; i++) {
              if ((pool[i].isBrick || false) !== wantBrick) continue;
              if (pool[i].isLong === templateWorkout.isLong) {
                bestIdx = i;
                break;
              }
              if (bestIdx === -1 || pool[i].intensity === templateWorkout.intensity) {
                bestIdx = i;
              }
            }
            if (bestIdx === -1) bestIdx = 0;
            const workout = pool.splice(bestIdx, 1)[0];
            week.days[d].push(workout);
          } else if (discipline === 'rest') {
            week.days[d].push({ discipline: 'rest', duration: 0, intensity: 'rest' });
          }
        });
      }

      // Place any remaining brick workouts on the day with the long bike
      const leftoverBricks = Object.values(allWorkouts).flat().filter(w => w.isBrick);
      if (leftoverBricks.length > 0) {
        let bikeDay = parseInt(config.longDay || 5);
        for (let dd = 0; dd < 7; dd++) {
          if (week.isRaceWeek && dd >= raceDayIdx) continue;
          if (week.days[dd].some(w => w.discipline === 'bike' && w.isLong)) {
            bikeDay = dd;
            break;
          }
        }
        leftoverBricks.forEach(w => week.days[bikeDay].push(w));
      }

      // Fill empty days with rest (recovery/taper weeks may have fewer sessions than template)
      for (let d = 0; d < 7; d++) {
        if (week.days[d].length === 0) {
          week.days[d].push(buildRestWorkout());
        }
      }
      finalizeRaceWeekLayout(week);
      if (!week.isRaceWeek) {
        week.totalSessions = countPlannedSessions(week.days);
      }
    });

    // Update the group template to first week
    group.template = group.weeks[0];
  });

  return groups;
}

// === Event Handlers ===

function showSection(id) {
  ['settings', 'template-editor', 'plan-display'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
  const backBtn = document.getElementById('settings-back-btn');
  if (id === 'settings' && settingsReturnTo) {
    backBtn.classList.remove('hidden');
  } else {
    backBtn.classList.add('hidden');
    settingsReturnTo = null;
  }
  if (id === 'plan-display' && currentPlanConfig) {
    const label = RACE_LABELS[currentPlanConfig.raceType] || currentPlanConfig.raceType;
    const raceDate = new Date(currentPlanConfig.raceDate);
    const totalWeeks = getRaceWeekContext(currentPlanConfig.planStart, currentPlanConfig.raceDate).totalWeeks;
    const raceDateStr = raceDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

    document.getElementById('plan-title').textContent = `Your ${label} plan`;
    document.getElementById('plan-subtitle').textContent = `${raceDateStr} · ${totalWeeks} weeks of training`;
  }
}

// Step 1 → Step 2: Generate template
document.getElementById('generate-btn').addEventListener('click', () => {
  const config = getConfig();
  const validation = validateConfig(config);

  if (validation.error) {
    alert(validation.error);
    return;
  }
  if (validation.warnings && validation.warnings.length > 0) {
    const warningText = `Controleer dit voordat je doorgaat:\n\n${validation.warnings.join('\n\n')}`;
    if (!confirm(warningText)) return;
  }

  currentPlanConfig = config;
  const template = generateTemplate(config);
  if (!template) {
    alert('Het schema kon niet worden gegenereerd. Controleer je datums.');
    return;
  }

  renderTemplate(template);
  templateReturnTo = 'settings';
  showSection('template-editor');

  localStorage.setItem('simpletri-config', JSON.stringify(config));
});

// Add vacation
document.getElementById('add-vacation-btn').addEventListener('click', () => {
  currentVacations.push({ start: '', end: '' });
  renderVacations();
});

// Step 2 → Back (settings or plan, depending on where we came from)
document.getElementById('template-back-btn').addEventListener('click', () => {
  showSection(templateReturnTo || 'settings');
});

// Step 2 → Step 3: Apply template to full calendar
document.getElementById('apply-template-btn').addEventListener('click', () => {
  if (!currentTemplate || !currentPlanConfig) return;

  const isEditing = savedPlanGroups && savedPlanGroups.length > 0;
  const lastTracked = getLastTrackedWeekIdx();
  const hasProgress = lastTracked >= 0;

  if (isEditing && hasProgress) {
    const lockedCount = lastTracked + 1;
    const newGroups = applyTemplateToFullPlan(currentTemplate, currentPlanConfig, currentVacations);
    const totalNew = newGroups.length;

    let msg = `Weken 1–${lockedCount} hebben al voortgang en blijven ongewijzigd.`;
    if (totalNew > lockedCount) {
      msg += ` Weken ${lockedCount + 1}–${totalNew} worden bijgewerkt.`;
    }
    if (totalNew < lockedCount) {
      msg += ` Het nieuwe schema heeft maar ${totalNew} weken — voortgang in weken ${totalNew + 1}–${lockedCount} gaat verloren.`;
    }
    if (!confirm(msg)) return;

    // Preserve locked weeks from the saved plan groups
    const preserveUpTo = Math.min(lastTracked, newGroups.length - 1);
    const newOverrides = {};
    for (let i = 0; i <= preserveUpTo; i++) {
      if (savedPlanGroups[i]) {
        newGroups[i] = savedPlanGroups[i];
        // Persist each locked week's layout so it survives save/reload
        newOverrides[i] = JSON.parse(JSON.stringify(savedPlanGroups[i].template.days));
      }
    }
    weekOverrides = newOverrides;

    // Clean up completion/skip keys for regenerated weeks
    for (const key of [...completedWorkouts]) {
      const idx = parseInt(key.split('-')[0]);
      if (idx > preserveUpTo) completedWorkouts.delete(key);
    }
    for (const key of [...skippedWorkouts]) {
      const idx = parseInt(key.split('-')[0]);
      if (idx > preserveUpTo) skippedWorkouts.delete(key);
    }

    renderPlan(newGroups);
  } else {
    completedWorkouts = new Set();
    skippedWorkouts = new Set();
    weekOverrides = {};
    const groups = applyTemplateToFullPlan(currentTemplate, currentPlanConfig, currentVacations);
    renderPlan(groups);
  }

  savedPlanGroups = null;

  showSection('plan-display');
  savePlanToStorage();
});

// Step 3 → Step 2: Edit schedule
document.getElementById('edit-template-btn').addEventListener('click', () => {
  savedPlanGroups = currentGroups.slice();
  if (currentTemplate) {
    renderTemplate(currentTemplate);
  }
  templateReturnTo = 'plan-display';
  showSection('template-editor');
});

// Step 3 → Step 1: Edit settings
document.getElementById('edit-btn').addEventListener('click', () => {
  savedPlanGroups = currentGroups.slice();
  settingsReturnTo = 'plan-display';
  showSection('settings');
});

// Settings → Back to plan
document.getElementById('settings-back-btn').addEventListener('click', () => {
  showSection(settingsReturnTo || 'plan-display');
});

function savePlanToStorage() {
  const config = currentPlanConfig || getConfig();
  const data = {
    config,
    template: currentTemplate,
    vacations: currentVacations,
    completions: [...completedWorkouts],
    skipped: [...skippedWorkouts],
    weekOverrides,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem('simpletri-plan', JSON.stringify(data));
  localStorage.setItem('simpletri-config', JSON.stringify(config));
}

// === Calendar Export ===

function openExportModal() {
  if (!currentTemplate || !currentGroups.length) return;

  const grid = document.getElementById('export-time-grid');
  grid.innerHTML = '';

  const saved = JSON.parse(localStorage.getItem('simpletri-export-times') || '{}');

  DAYS.forEach((dayName, d) => {
    const col = document.createElement('div');
    col.className = 'export-day';

    const header = document.createElement('div');
    header.className = 'export-day-header';
    header.textContent = dayName;
    col.appendChild(header);

    const dayWorkouts = currentTemplate.days[d];
    const nonRest = dayWorkouts.filter(w => w.discipline !== 'rest');

    if (nonRest.length === 0) {
      const rest = document.createElement('div');
      rest.className = 'export-day-rest';
      rest.textContent = 'Rest';
      col.appendChild(rest);
    } else {
      nonRest.forEach((workout, wIdx) => {
        const entry = document.createElement('div');
        entry.className = `export-workout-entry ${getDisciplineClass(workout.discipline)}`;

        const label = document.createElement('div');
        label.className = 'export-discipline';
        label.textContent = getDisciplineLabel(workout.discipline);
        entry.appendChild(label);

        const timeInput = document.createElement('input');
        timeInput.type = 'time';
        timeInput.dataset.dayIdx = d;
        timeInput.dataset.workoutIdx = wIdx;
        const key = `${d}-${wIdx}`;
        timeInput.value = saved[key] || '07:00';
        entry.appendChild(timeInput);

        col.appendChild(entry);
      });
    }

    grid.appendChild(col);
  });

  document.getElementById('export-modal').classList.remove('hidden');
}

function closeExportModal() {
  document.getElementById('export-modal').classList.add('hidden');
}

function toICSDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}00`;
}

function generateICS(timeMap) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SimpleTri//Training Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SimpleTri Training Plan',
  ];

  currentGroups.forEach((group) => {
    if (group.template.isVacation) return;

    const weekStart = new Date(group.template.weekStart);

    for (let d = 0; d < 7; d++) {
      const dayWorkouts = group.template.days[d];
      let nonRestIdx = 0;

      dayWorkouts.forEach((workout) => {
        if (workout.discipline === 'rest') return;

        const key = `${d}-${nonRestIdx}`;
        const timeStr = timeMap[key] || '07:00';
        const [hours, minutes] = timeStr.split(':').map(Number);

        const eventDate = new Date(weekStart);
        eventDate.setDate(eventDate.getDate() + d);
        eventDate.setHours(hours, minutes, 0, 0);

        const endDate = new Date(eventDate);
        endDate.setMinutes(endDate.getMinutes() + (workout.duration || 30));

        const summary = workout.isRace
          ? (workout.raceLabel || 'Race Day')
          : `${getDisciplineLabel(workout.discipline)} - ${workout.duration} min`;

        let description = '';
        if (workout.isRace && workout.raceDistances) {
          description = `${workout.raceDistances.swim}km swim\n${workout.raceDistances.bike}km bike\n${workout.raceDistances.run}km run`;
        }
        if (workout.suggestion) {
          description = workout.suggestion;
        }
        const exportFtp = (currentPlanConfig?.showWattage && currentPlanConfig?.bikeBenchmarkType === 'ftp')
          ? parseFloat(currentPlanConfig.bikeBenchmarkValue) || null : null;
        const zone = workout.intensity ? getZoneLabel(workout.intensity, workout.discipline, workout.discipline === 'bike' ? exportFtp : null) : '';
        if (zone && zone !== 'full body') {
          description = description ? `${zone}\\n${description}` : zone;
        }
        description = description.replace(/\n/g, '\\n');

        const uid = `simpletri-w${group.startWeek}-d${d}-i${nonRestIdx}-${eventDate.getTime()}@simpletri`;

        lines.push('BEGIN:VEVENT');
        lines.push(`DTSTART:${toICSDate(eventDate)}`);
        lines.push(`DTEND:${toICSDate(endDate)}`);
        lines.push(`SUMMARY:${summary}`);
        if (description) {
          lines.push(`DESCRIPTION:${description}`);
        }
        lines.push(`UID:${uid}`);
        lines.push(`DTSTAMP:${toICSDate(new Date())}`);
        lines.push('END:VEVENT');

        nonRestIdx++;
      });
    }
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadICS(icsString) {
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'simpletri-plan.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('export-btn').addEventListener('click', openExportModal);
document.getElementById('export-cancel-btn').addEventListener('click', closeExportModal);
document.getElementById('export-backdrop').addEventListener('click', closeExportModal);

document.getElementById('export-download-btn').addEventListener('click', () => {
  const inputs = document.querySelectorAll('#export-time-grid input[type="time"]');
  const timeMap = {};
  inputs.forEach(input => {
    const key = `${input.dataset.dayIdx}-${input.dataset.workoutIdx}`;
    timeMap[key] = input.value || '07:00';
  });

  localStorage.setItem('simpletri-export-times', JSON.stringify(timeMap));

  const ics = generateICS(timeMap);
  downloadICS(ics);
  closeExportModal();
});

document.getElementById('delete-btn').addEventListener('click', () => {
  if (!confirm('Je schema en alle opgeslagen gegevens verwijderen?')) return;
  localStorage.removeItem('simpletri-plan');
  localStorage.removeItem('simpletri-config');
  localStorage.removeItem('simpletri-template');
  localStorage.removeItem('simpletri-export-times');
  currentTemplate = null;
  currentPlanConfig = null;
  currentVacations = [];
  currentGroups = [];
  completedWorkouts = new Set();
  skippedWorkouts = new Set();
  weekOverrides = {};
  document.getElementById('plan-grid').innerHTML = '';

  const today = new Date();
  const raceDate = new Date(today);
  raceDate.setDate(raceDate.getDate() + 8 * 7);
  document.getElementById('plan-start').value = today.toISOString().split('T')[0];
  document.getElementById('race-date').value = raceDate.toISOString().split('T')[0];

  document.getElementById('tri-experience').selectedIndex = 0;
  document.getElementById('weekly-hours').selectedIndex = 0;
  document.getElementById('strongest-discipline').selectedIndex = 0;
  document.getElementById('run-capacity').value = '';
  document.getElementById('bike-capacity').value = '';
  document.getElementById('swim-capacity').value = '';
  document.getElementById('run-bench-time').value = '';
  document.getElementById('bike-bench-value').value = '';
  document.getElementById('swim-bench-time').value = '';
  document.getElementById('benchmark-section').classList.remove('expanded');
  document.getElementById('benchmark-toggle').classList.remove('expanded');

  updateFitnessBadges();
  showSection('settings');
});

function migrateOldConfig(config) {
  if (config.runCapacity == null) config.runCapacity = '';
  if (config.bikeCapacity == null) config.bikeCapacity = '';
  if (config.swimCapacity == null) config.swimCapacity = '';

  if (config.runBenchmark && !config.experience) {
    config.runBenchmarkDist = '5k';
    config.runBenchmarkTime = config.runBenchmark;
    config.experience = '1-3';
    config.weeklyHours = '6-10';
    config.strongestDiscipline = 'balanced';
    delete config.runBenchmark;
  }
  if (config.bikeBenchmark && !config.bikeBenchmarkType) {
    const raw = config.bikeBenchmark.trim().toLowerCase();
    if (raw.includes('w')) {
      config.bikeBenchmarkType = 'ftp';
      config.bikeBenchmarkValue = parseFloat(raw).toString();
    } else {
      config.bikeBenchmarkType = 'speed';
      config.bikeBenchmarkValue = raw;
    }
    delete config.bikeBenchmark;
  }
  if (config.swimBenchmark && !config.swimBenchmarkDist) {
    config.swimBenchmarkDist = '100m';
    config.swimBenchmarkTime = config.swimBenchmark;
    delete config.swimBenchmark;
  }
  return config;
}

function restoreConfig(config) {
  if (config.raceType) document.getElementById('race-type').value = config.raceType;
  if (config.raceDate) document.getElementById('race-date').value = config.raceDate;
  if (config.planStart) document.getElementById('plan-start').value = config.planStart;

  if (config.experience) document.getElementById('tri-experience').value = config.experience;
  if (config.weeklyHours) document.getElementById('weekly-hours').value = config.weeklyHours;
  if (config.strongestDiscipline) document.getElementById('strongest-discipline').value = config.strongestDiscipline;
  if (config.runCapacity != null) document.getElementById('run-capacity').value = config.runCapacity;
  if (config.bikeCapacity != null) document.getElementById('bike-capacity').value = config.bikeCapacity;
  if (config.swimCapacity != null) document.getElementById('swim-capacity').value = config.swimCapacity;

  if (config.runBenchmarkDist) document.getElementById('run-bench-dist').value = config.runBenchmarkDist;
  if (config.runBenchmarkTime) document.getElementById('run-bench-time').value = config.runBenchmarkTime;
  if (config.bikeBenchmarkType) document.getElementById('bike-bench-type').value = config.bikeBenchmarkType;
  if (config.bikeBenchmarkValue) document.getElementById('bike-bench-value').value = config.bikeBenchmarkValue;
  if (config.swimBenchmarkDist) document.getElementById('swim-bench-dist').value = config.swimBenchmarkDist;
  if (config.swimBenchmarkTime) document.getElementById('swim-bench-time').value = config.swimBenchmarkTime;

  if (config.runSessions != null) document.getElementById('run-sessions').value = config.runSessions;
  if (config.bikeSessions != null) document.getElementById('bike-sessions').value = config.bikeSessions;
  if (config.swimSessions != null) document.getElementById('swim-sessions').value = config.swimSessions;
  if (config.strengthSessions != null) document.getElementById('strength-sessions').value = config.strengthSessions;
  if (config.restDays != null) document.getElementById('rest-days').value = config.restDays;
  if (config.polarized != null) document.getElementById('polarized').checked = config.polarized;
  if (config.recoveryWeeks != null) document.getElementById('recovery-weeks').checked = config.recoveryWeeks;
  if (config.showWattage != null) document.getElementById('show-wattage').checked = config.showWattage;
  if (config.longDay != null) document.getElementById('long-day').value = config.longDay;

  const hasBenchmarks = config.runBenchmarkTime || config.bikeBenchmarkValue || config.swimBenchmarkTime;
  if (hasBenchmarks) {
    document.getElementById('benchmark-section').classList.add('expanded');
    document.getElementById('benchmark-toggle').classList.add('expanded');
  }
}

// === Fitness UI: Badges, Toggle, Generate Button ===

function updateFitnessBadges() {
  const complete = isProfileComplete();
  const badges = { run: 'badge-run', bike: 'badge-bike', swim: 'badge-swim' };

  if (!complete) {
    Object.keys(badges).forEach(sport => {
      const el = document.getElementById(badges[sport]);
      el.classList.remove('badge-active', 'badge-measured');
      el.querySelector('.badge-level').textContent = '---';
      el.querySelector('.badge-source').textContent = '';
    });
    updateGenerateButton();
    return;
  }

  const config = getConfig();
  const fitness = configToFitnessLevels(config);

  Object.keys(badges).forEach(sport => {
    const el = document.getElementById(badges[sport]);
    const data = fitness[sport];
    el.classList.add('badge-active');
    el.classList.toggle('badge-measured', data.source === 'measured');
    el.querySelector('.badge-level').textContent =
      data.level.charAt(0).toUpperCase() + data.level.slice(1);
    el.querySelector('.badge-source').textContent = data.source;
  });

  updateGenerateButton();
}

function updateGenerateButton() {
  const btn = document.getElementById('generate-btn');
  const complete = isProfileComplete();
  btn.disabled = !complete;

  let hint = document.getElementById('generate-hint');
  if (!complete) {
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'generate-hint';
      hint.className = 'generate-hint';
      btn.parentNode.appendChild(hint);
    }
    hint.textContent = 'Complete your fitness profile to continue';
  } else if (hint) {
    hint.remove();
  }
}

function setupBenchmarkToggle() {
  const toggle = document.getElementById('benchmark-toggle');
  const section = document.getElementById('benchmark-section');

  toggle.addEventListener('click', () => {
    const expanding = !section.classList.contains('expanded');
    section.classList.toggle('expanded');
    toggle.classList.toggle('expanded');
    toggle.querySelector('.toggle-arrow').textContent = expanding ? '\u25BC' : '\u25B6';
  });
}

function setupFitnessListeners() {
  const profileIds = ['tri-experience', 'weekly-hours', 'strongest-discipline', 'run-capacity', 'bike-capacity', 'swim-capacity'];
  const benchIds = [
    'run-bench-dist', 'run-bench-time',
    'bike-bench-type', 'bike-bench-value',
    'swim-bench-dist', 'swim-bench-time',
  ];

  profileIds.forEach(id => {
    document.getElementById(id).addEventListener('change', updateFitnessBadges);
  });
  benchIds.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', updateFitnessBadges);
    el.addEventListener('change', updateFitnessBadges);
  });
}

// === Init ===
(function init() {
  const today = new Date();
  const raceDate = new Date(today);
  raceDate.setDate(raceDate.getDate() + 8 * 7);

  document.getElementById('plan-start').value = today.toISOString().split('T')[0];
  document.getElementById('race-date').value = raceDate.toISOString().split('T')[0];

  setupBenchmarkToggle();
  setupFitnessListeners();

  // Show intro splash once for new users
  const introSeen = localStorage.getItem('simpletri-intro-seen');
  const splash = document.getElementById('intro-splash');
  const savedPlan = localStorage.getItem('simpletri-plan');
  if (!introSeen && !savedPlan && splash) {
    splash.classList.remove('hidden');
    document.getElementById('intro-start-btn').addEventListener('click', () => {
      splash.style.animation = 'introFadeOut 0.3s ease forwards';
      setTimeout(() => {
        splash.classList.add('hidden');
        splash.style.animation = '';
      }, 300);
      localStorage.setItem('simpletri-intro-seen', '1');
    });
  }

  // Auto-restore saved plan if it exists
  if (savedPlan) {
    try {
      const parsed = JSON.parse(savedPlan);
      if (parsed.config && parsed.template) {
        const migratedConfig = migrateOldConfig(parsed.config);
        restoreConfig(migratedConfig);
        currentPlanConfig = migratedConfig;
        currentTemplate = parsed.template;
        currentVacations = parsed.vacations || [];
        completedWorkouts = new Set(parsed.completions || []);
        skippedWorkouts = new Set(parsed.skipped || []);
        weekOverrides = parsed.weekOverrides || {};
        const groups = applyTemplateToFullPlan(parsed.template, parsed.config, currentVacations);
        Object.entries(weekOverrides).forEach(([idx, days]) => {
          const i = parseInt(idx);
          if (groups[i]) {
            groups[i].template.days = days;
            finalizeRaceWeekLayout(groups[i].template);
            if (!groups[i].template.isRaceWeek) {
              groups[i].template.totalSessions = countPlannedSessions(days);
            }
          }
        });
        renderPlan(groups);
        updateFitnessBadges();
        showSection('plan-display');
        return;
      }
    } catch (e) {
      // fall through to default settings view
    }
  }

  // Otherwise just restore config inputs
  const savedConfig = localStorage.getItem('simpletri-config');
  if (savedConfig) {
    try {
      restoreConfig(migrateOldConfig(JSON.parse(savedConfig)));
    } catch (e) {
      // ignore
    }
  }

  updateFitnessBadges();
})();
