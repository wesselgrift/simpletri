// === SimpleTri — Training Plan Generator ===

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Race distances in km: [swim, bike, run]
const RACE_LABELS = {
  sprint: 'Sprint',
  olympic: 'Olympic',
  half: 'Half Ironman',
  full: 'Ironman',
};

const RACE_DISTANCES = {
  sprint:  { swim: 0.75,  bike: 20,  run: 5 },
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

  return {
    run:  { level: runBench  || estimated.run,  source: runBench  ? 'measured' : 'estimated' },
    bike: { level: bikeBench || estimated.bike, source: bikeBench ? 'measured' : 'estimated' },
    swim: { level: swimBench || estimated.swim, source: swimBench ? 'measured' : 'estimated' },
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

// Long session multiplier by race distance (applied to regular session duration)
const LONG_SESSION_MULTIPLIER = {
  sprint:  { run: 1.5, bike: 1.5 },
  olympic: { run: 1.7, bike: 1.8 },
  half:    { run: 2.0, bike: 2.5 },
  full:    { run: 2.5, bike: 3.0 },
};

// Taper length in weeks by race distance
const TAPER_WEEKS = {
  sprint:  1,
  olympic: 1,
  half:    2,
  full:    3,
};

// Training phase splits (fraction of pre-taper weeks)
const PHASE_SPLITS = {
  base:  0.40,
  build: 0.35,
  peak:  0.25,
};

// === Zone Labels ===

function getZoneLabel(intensity, discipline) {
  if (discipline === 'strength') return 'full body';
  if (intensity === 'easy') return 'zone 1-2';
  if (intensity === 'tempo') return 'zone 3';
  if (intensity === 'threshold') return 'zone 4';
  if (intensity === 'interval') return 'zone 4-5';
  return '';
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

function getDisciplineClass(discipline) {
  return `workout-${discipline}`;
}

// === Workout Suggestions ===

function getWorkoutSuggestion(discipline, intensity, isLong, phase) {
  if (discipline === 'strength' || discipline === 'rest') return '';

  if (discipline === 'run') {
    if (isLong) return 'Long run @ zone 1-2';
    if (intensity === 'easy') return 'Steady run @ zone 1-2';
    if (intensity === 'tempo') return 'Steady run @ zone 3 (sweet spot)';
    if (intensity === 'threshold') {
      if (phase === 'taper') return '10 min warm-up\n3x 800m @ zone 4\n400m recovery\n10 min cool-down';
      return '10 min warm-up\n4x 800m @ zone 4\n400m recovery\n10 min cool-down';
    }
    if (intensity === 'interval') return '10 min warm-up\n6x 400m @ zone 5\n400m recovery\n10 min cool-down';
  }

  if (discipline === 'bike') {
    if (isLong) return 'Long ride @ zone 1-2';
    if (intensity === 'easy') return 'Steady ride @ zone 1-2';
    if (intensity === 'tempo') return 'Steady ride @ zone 3 (sweet spot)';
    if (intensity === 'threshold') {
      if (phase === 'taper') return '15 min warm-up\n2x 10 min @ zone 4\n5 min recovery\nCool-down';
      return '15 min warm-up\n2x 15 min @ zone 4\n5 min recovery\nCool-down';
    }
    if (intensity === 'interval') return '15 min warm-up\n5x 3 min @ zone 5\n3 min recovery\nCool-down';
  }

  if (discipline === 'swim') {
    if (intensity === 'easy') return 'Steady swim, focus on technique';
    if (intensity === 'tempo') return 'Steady swim @ zone 3, focus on pace';
    if (intensity === 'threshold') {
      if (phase === 'taper') return '400m warm-up\n6x 100m @ zone 4\n15s recovery\n200m cool-down';
      return '400m warm-up\n8x 100m @ zone 4\n15s recovery\n200m cool-down';
    }
    if (intensity === 'interval') return '400m warm-up\n6x 50m @ zone 5\n20s recovery\n200m cool-down';
  }

  return '';
}

// === Vacation Helpers ===

function getVacationWeekIndices(vacations, planStart, raceDate) {
  if (!vacations || vacations.length === 0) return new Set();

  const start = new Date(planStart);
  const end = new Date(raceDate);

  const dayOfWeek = start.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  start.setDate(start.getDate() + mondayOffset);

  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.max(1, Math.floor(totalDays / 7));

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

  const start = new Date(planStart);
  const end = new Date(raceDate);

  // Align start to Monday
  const dayOfWeek = start.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  start.setDate(start.getDate() + mondayOffset);

  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.max(1, Math.floor(totalDays / 7));

  const vacationCount = [...vacationWeekIndices].filter(i => i < totalWeeks).length;
  const totalTrainingWeeks = totalWeeks - vacationCount;

  const raceDistances = RACE_DISTANCES[raceType] || RACE_DISTANCES.olympic;

  // Calculate base and peak minutes per session
  function getMinutesRange(discipline, level) {
    const base = BASE_MINUTES[discipline]?.[level] || 25;
    const peak = PEAK_MINUTES[raceType]?.[discipline]?.[level] || base * 2;
    return { base, peak };
  }

  const runRange = getMinutesRange('run', runLevel);
  const bikeRange = getMinutesRange('bike', bikeLevel);
  const swimRange = getMinutesRange('swim', swimLevel);

  const weeks = [];
  let trainingWeekIdx = 0;

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + w * 7);

    if (vacationWeekIndices.has(w)) {
      weeks.push({
        weekNumber: w + 1,
        weekStart,
        isVacation: true,
        isRecovery: false,
        isTaper: false,
        phase: 'vacation',
        days: Array.from({ length: 7 }, () => [{ discipline: 'rest', duration: 0, intensity: 'rest' }]),
        totalSessions: 0,
      });
      continue;
    }

    const taperLength = TAPER_WEEKS[raceType] || 2;
    const isLastTrainingWeek = trainingWeekIdx === totalTrainingWeeks - 1;
    const isTaperWeek = trainingWeekIdx >= totalTrainingWeeks - taperLength && totalTrainingWeeks > taperLength + 2;
    const isRecoveryWeek = recoveryWeeks && ((trainingWeekIdx + 1) % 4 === 0) && !isTaperWeek && !isLastTrainingWeek;

    // Progress factor based on training weeks only
    const peakWeek = Math.max(0, totalTrainingWeeks - taperLength - 1);
    const progress = peakWeek > 0 ? Math.min(1, trainingWeekIdx / peakWeek) : 0;

    // Volume multiplier
    let volumeMultiplier = 1;
    if (isTaperWeek || isLastTrainingWeek) {
      const trainingWeeksUntilRace = totalTrainingWeeks - 1 - trainingWeekIdx;
      volumeMultiplier = 0.55 + (trainingWeeksUntilRace / Math.max(1, taperLength)) * 0.25;
    } else if (isRecoveryWeek) {
      volumeMultiplier = 0.75;
    }

    // Determine training phase based on training weeks
    const preTaperWeeks = totalTrainingWeeks - taperLength;
    let phase = 'base';
    if (isTaperWeek || isLastTrainingWeek) {
      phase = 'taper';
    } else {
      const baseEnd = Math.floor(preTaperWeeks * PHASE_SPLITS.base);
      const buildEnd = baseEnd + Math.floor(preTaperWeeks * PHASE_SPLITS.build);
      if (trainingWeekIdx >= buildEnd) phase = 'peak';
      else if (trainingWeekIdx >= baseEnd) phase = 'build';
    }

    // Calculate session durations for this week
    function sessionDuration(range) {
      const mins = range.base + (range.peak - range.base) * progress;
      return Math.round(mins * volumeMultiplier / 5) * 5; // Round to 5 min
    }

    const runDuration = sessionDuration(runRange);
    const bikeDuration = sessionDuration(bikeRange);
    const swimDuration = sessionDuration(swimRange);

    // Determine workout distribution across the week
    const daySlots = new Array(7).fill(null).map(() => []);

    // Assign rest days first
    const restDayIndices = getRestDayIndices(restDays, longDay);

    // Build workout pool
    const longMult = LONG_SESSION_MULTIPLIER[raceType] || { run: 1.5, bike: 1.5 };
    const workouts = [];
    for (let i = 0; i < (isRecoveryWeek ? Math.max(1, runSessions - 1) : runSessions); i++) {
      const isLong = i === runSessions - 1 && runSessions > 1;
      const intensity = getSessionIntensity(i, runSessions, polarized, isLong, phase, weeklyHours);
      workouts.push({
        discipline: 'run',
        duration: isLong ? Math.round(runDuration * longMult.run / 5) * 5 : runDuration,
        intensity,
        isLong,
        suggestion: getWorkoutSuggestion('run', intensity, isLong, phase),
      });
    }
    for (let i = 0; i < (isRecoveryWeek ? Math.max(1, bikeSessions - 1) : bikeSessions); i++) {
      const isLong = i === bikeSessions - 1;
      const intensity = getSessionIntensity(i, bikeSessions, polarized, isLong, phase, weeklyHours);
      workouts.push({
        discipline: 'bike',
        duration: isLong ? Math.round(bikeDuration * longMult.bike / 5) * 5 : bikeDuration,
        intensity,
        isLong,
        suggestion: getWorkoutSuggestion('bike', intensity, isLong, phase),
      });
    }
    for (let i = 0; i < (isRecoveryWeek ? Math.max(1, swimSessions - 1) : swimSessions); i++) {
      const intensity = getSessionIntensity(i, swimSessions, polarized, false, phase, weeklyHours);
      workouts.push({
        discipline: 'swim',
        duration: swimDuration,
        intensity,
        suggestion: getWorkoutSuggestion('swim', intensity, false, phase),
      });
    }
    for (let i = 0; i < (isRecoveryWeek ? Math.max(1, strengthSessions - 1) : strengthSessions); i++) {
      workouts.push({
        discipline: 'strength',
        duration: isRecoveryWeek ? 20 : 30 + Math.round(progress * 15 / 5) * 5,
        intensity: 'easy',
      });
    }

    // Sort: long sessions to long day, spread others out
    const longWorkouts = workouts.filter(w => w.isLong);
    const regularWorkouts = workouts.filter(w => !w.isLong);

    // Place rest on rest days
    restDayIndices.forEach(ri => {
      daySlots[ri].push({ discipline: 'rest', duration: 0, intensity: 'rest' });
    });

    // Place long workouts on long day
    longWorkouts.forEach(w => {
      daySlots[longDay].push(w);
    });

    // Available training days (excluding rest)
    const availableDays = [];
    for (let d = 0; d < 7; d++) {
      if (!restDayIndices.includes(d)) {
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
          daySlots[d].push({ discipline: 'rest', duration: 0, intensity: 'rest' });
        }
      }
    }

    // Calculate total sessions (non-rest)
    const totalSessions = daySlots.flat().filter(w => w.discipline !== 'rest').length;

    weeks.push({
      weekNumber: w + 1,
      weekStart,
      isVacation: false,
      isRecovery: isRecoveryWeek,
      isTaper: isTaperWeek || isLastTrainingWeek,
      phase,
      days: daySlots,
      totalSessions,
    });

    trainingWeekIdx++;
  }

  return groupWeeks(weeks);
}

function getSessionIntensity(sessionIndex, totalSessions, polarized, isLong, phase, weeklyHours) {
  const isLowVolume = weeklyHours === 'lt3' || weeklyHours === '3-6';
  const easyOrTempo = isLowVolume ? 'tempo' : 'easy';

  if (!polarized) return easyOrTempo;
  if (isLong) return 'easy';
  if (totalSessions <= 1) return easyOrTempo;

  if (phase === 'base') return easyOrTempo;

  if (phase === 'build') {
    if (sessionIndex === 0 && totalSessions >= 2) return 'threshold';
    return easyOrTempo;
  }

  if (phase === 'peak') {
    if (sessionIndex === 0 && totalSessions >= 2) return 'threshold';
    if (sessionIndex === 2 && totalSessions >= 4) return 'interval';
    return easyOrTempo;
  }

  if (phase === 'taper') {
    if (sessionIndex === 0 && totalSessions >= 2) return 'threshold';
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
        badge.className = 'recovery-badge';
        badge.textContent = 'RECOVERY';
        label.appendChild(badge);
      }
      if (group.template.isTaper && !group.template.isRecovery) {
        const badge = document.createElement('div');
        badge.className = 'recovery-badge';
        badge.textContent = 'TAPER';
        label.appendChild(badge);
      }
      if (!group.template.isRecovery && !group.template.isTaper && group.template.phase) {
        const phaseBadge = document.createElement('div');
        phaseBadge.className = 'phase-badge';
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

  // Race day row
  if (currentPlanConfig) {
    const raceDate = new Date(currentPlanConfig.raceDate);
    const raceDow = raceDate.getDay();
    const raceDayIdx = raceDow === 0 ? 6 : raceDow - 1;
    const raceType = currentPlanConfig.raceType;
    const dist = RACE_DISTANCES[raceType] || RACE_DISTANCES.olympic;
    const raceLabel = RACE_LABELS[raceType] || raceType;

    const raceRow = document.createElement('div');
    raceRow.className = 'week-row race-row';

    const raceWeekLabel = document.createElement('div');
    raceWeekLabel.className = 'week-label race-week-label';

    const raceName = document.createElement('div');
    raceName.className = 'week-name';
    raceName.textContent = 'Race Day';
    raceWeekLabel.appendChild(raceName);

    const raceDateEl = document.createElement('div');
    raceDateEl.className = 'week-date';
    const rd = raceDate;
    raceDateEl.textContent = `${rd.getDate()} ${MONTH_SHORT[rd.getMonth()]}`;
    raceWeekLabel.appendChild(raceDateEl);

    const raceBadge = document.createElement('div');
    raceBadge.className = 'race-badge';
    raceBadge.textContent = raceLabel.toUpperCase();
    raceWeekLabel.appendChild(raceBadge);

    raceRow.appendChild(raceWeekLabel);

    for (let d = 0; d < 7; d++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell';

      if (d === raceDayIdx) {
        const block = document.createElement('div');
        block.className = 'workout-block race-block';

        const flag = document.createElement('div');
        flag.className = 'race-flag';
        flag.textContent = '\uD83C\uDFC1';
        block.appendChild(flag);

        const title = document.createElement('div');
        title.className = 'workout-type';
        title.textContent = raceLabel;
        block.appendChild(title);

        const distances = document.createElement('div');
        distances.className = 'workout-detail';
        distances.textContent = `${dist.swim}km / ${dist.bike}km / ${dist.run}km`;
        block.appendChild(distances);

        cell.appendChild(block);
      }

      raceRow.appendChild(cell);
    }

    grid.appendChild(raceRow);
  }

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

  currentGroups[groupIdx].template.totalSessions =
    days.flat().filter(w => w.discipline !== 'rest').length;

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
  const completed = row.querySelectorAll('.workout-block.completed:not(.workout-rest)');
  const skipped = row.querySelectorAll('.workout-block.skipped:not(.workout-rest)');
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
    completedAll += row.querySelectorAll('.workout-block.completed:not(.workout-rest)').length;
    skippedAll += row.querySelectorAll('.workout-block.skipped:not(.workout-rest)').length;
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
    longDay: parseInt(document.getElementById('long-day').value),
  };
}

function configToFitnessLevels(config) {
  return getFitnessLevels(
    { experience: config.experience, weeklyHours: config.weeklyHours, strongest: config.strongestDiscipline },
    {
      runDist: config.runBenchmarkDist, runTime: config.runBenchmarkTime,
      bikeType: config.bikeBenchmarkType, bikeValue: config.bikeBenchmarkValue,
      swimDist: config.swimBenchmarkDist, swimTime: config.swimBenchmarkTime,
    }
  );
}

function validateConfig(config) {
  if (!config.experience || !config.weeklyHours || !config.strongestDiscipline) {
    return 'Please complete your fitness profile.';
  }
  if (!config.raceDate) return 'Please set a race date.';
  if (!config.planStart) return 'Please set a plan start date.';
  if (new Date(config.planStart) >= new Date(config.raceDate)) {
    return 'Plan start must be before race date.';
  }
  const totalSessions = config.runSessions + config.bikeSessions +
    config.swimSessions + config.strengthSessions;
  if (totalSessions + config.restDays > 10) {
    return 'Too many sessions + rest days for a 7-day week. Some days will have multiple sessions.';
  }
  return null;
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
  block.dataset.groupIdx = groupIdx;
  block.dataset.dayIdx = dayIdx;
  block.dataset.workoutIdx = workoutIdx;

  block.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    initDrag(e, block);
  });

  const typeEl = document.createElement('div');
  typeEl.className = 'workout-type';
  typeEl.textContent = getDisciplineLabel(workout.discipline);
  block.appendChild(typeEl);

  const detailEl = document.createElement('div');
  detailEl.className = 'workout-detail';
  if (workout.discipline === 'rest') {
    detailEl.textContent = '—';
  } else if (workout.discipline === 'strength') {
    detailEl.textContent = 'full body';
  } else if (isTemplate) {
    // In template, show intensity instead of duration
    detailEl.textContent = workout.isLong ? 'long' : (workout.intensity === 'easy' ? 'easy' : workout.intensity);
  } else {
    detailEl.textContent = `${workout.duration} min`;
  }
  block.appendChild(detailEl);

  if (!isTemplate && workout.discipline !== 'rest' && workout.discipline !== 'strength') {
    const zoneEl = document.createElement('div');
    zoneEl.className = 'workout-zone';
    zoneEl.textContent = getZoneLabel(workout.intensity, workout.discipline);
    block.appendChild(zoneEl);
  }

  if (!isTemplate && workout.suggestion) {
    const suggEl = document.createElement('div');
    suggEl.className = 'workout-suggestion';
    suggEl.textContent = workout.suggestion;
    block.appendChild(suggEl);
  }

  if (!isTemplate && workout.discipline !== 'rest') {
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

      // Collect all workouts from this week, grouped by discipline
      const allWorkouts = {};
      for (let d = 0; d < 7; d++) {
        week.days[d].forEach(w => {
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
        const templateDay = template.days[d];
        templateDay.forEach(templateWorkout => {
          const discipline = templateWorkout.discipline;
          const pool = allWorkouts[discipline];

          if (pool && pool.length > 0) {
            // Find best matching workout (prefer matching isLong/intensity)
            let bestIdx = 0;
            for (let i = 0; i < pool.length; i++) {
              if (pool[i].isLong === templateWorkout.isLong) {
                bestIdx = i;
                break;
              }
              if (pool[i].intensity === templateWorkout.intensity) {
                bestIdx = i;
              }
            }
            const workout = pool.splice(bestIdx, 1)[0];
            week.days[d].push(workout);
          } else if (discipline === 'rest') {
            week.days[d].push({ discipline: 'rest', duration: 0, intensity: 'rest' });
          }
        });
      }

      // Fill empty days with rest (recovery/taper weeks may have fewer sessions than template)
      for (let d = 0; d < 7; d++) {
        if (week.days[d].length === 0) {
          week.days[d].push({ discipline: 'rest', duration: 0, intensity: 'rest' });
        }
      }
      week.totalSessions = week.days.flat().filter(w => w.discipline !== 'rest').length;
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
    const startDate = new Date(currentPlanConfig.planStart);
    const totalWeeks = Math.max(1, Math.floor((raceDate - startDate) / (1000 * 60 * 60 * 24 * 7)));
    const raceDateStr = raceDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

    document.getElementById('plan-title').textContent = `Your ${label} plan`;
    document.getElementById('plan-subtitle').textContent = `${raceDateStr} · ${totalWeeks} weeks of training`;
  }
}

// Step 1 → Step 2: Generate template
document.getElementById('generate-btn').addEventListener('click', () => {
  const config = getConfig();
  const warning = validateConfig(config);

  if (warning && !warning.includes('multiple sessions')) {
    alert(warning);
    return;
  }

  currentPlanConfig = config;
  const template = generateTemplate(config);
  if (!template) {
    alert('Could not generate a plan. Check your dates.');
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

    let msg = `Weeks 1–${lockedCount} have tracked progress and won't change.`;
    if (totalNew > lockedCount) {
      msg += ` Weeks ${lockedCount + 1}–${totalNew} will be updated.`;
    }
    if (totalNew < lockedCount) {
      msg += ` The new plan only has ${totalNew} weeks — progress in weeks ${totalNew + 1}–${lockedCount} will be lost.`;
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

document.getElementById('delete-btn').addEventListener('click', () => {
  if (!confirm('Delete your plan and all saved data?')) return;
  localStorage.removeItem('simpletri-plan');
  localStorage.removeItem('simpletri-config');
  localStorage.removeItem('simpletri-template');
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
  document.getElementById('run-bench-time').value = '';
  document.getElementById('bike-bench-value').value = '';
  document.getElementById('swim-bench-time').value = '';
  document.getElementById('benchmark-section').classList.remove('expanded');
  document.getElementById('benchmark-toggle').classList.remove('expanded');

  updateFitnessBadges();
  showSection('settings');
});

function migrateOldConfig(config) {
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
  const profileIds = ['tri-experience', 'weekly-hours', 'strongest-discipline'];
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
            groups[i].template.totalSessions = days.flat().filter(w => w.discipline !== 'rest').length;
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
