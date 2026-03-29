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

// === Fitness Level Parsing ===

function parseTime(str) {
  // Parses "mm:ss" to total seconds
  if (!str) return null;
  const parts = str.trim().split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return null;
}

function getRunLevel(benchmarkStr) {
  // Based on 5K time
  const secs = parseTime(benchmarkStr);
  if (!secs) return 'intermediate';
  if (secs < 20 * 60) return 'advanced';
  if (secs < 25 * 60) return 'intermediate';
  return 'beginner';
}

function getSwimLevel(benchmarkStr) {
  // Based on 100m time
  const secs = parseTime(benchmarkStr);
  if (!secs) return 'intermediate';
  if (secs < 90) return 'advanced';
  if (secs < 120) return 'intermediate';
  return 'beginner';
}

function getBikeLevel(benchmarkStr) {
  const str = benchmarkStr?.trim().toLowerCase() || '';
  const num = parseFloat(str);
  if (!num) return 'intermediate';
  if (str.includes('w')) {
    // FTP watts
    if (num > 250) return 'advanced';
    if (num > 180) return 'intermediate';
    return 'beginner';
  }
  // avg speed km/h
  if (num > 32) return 'advanced';
  if (num > 26) return 'intermediate';
  return 'beginner';
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
    if (intensity === 'threshold') {
      if (phase === 'taper') return '10 min warm-up\n3x 800m @ zone 4\n400m recovery\n10 min cool-down';
      return '10 min warm-up\n4x 800m @ zone 4\n400m recovery\n10 min cool-down';
    }
    if (intensity === 'interval') return '10 min warm-up\n6x 400m @ zone 5\n400m recovery\n10 min cool-down';
  }

  if (discipline === 'bike') {
    if (isLong) return 'Long ride @ zone 1-2';
    if (intensity === 'easy') return 'Steady ride @ zone 1-2';
    if (intensity === 'threshold') {
      if (phase === 'taper') return '15 min warm-up\n2x 10 min @ zone 4\n5 min recovery\nCool-down';
      return '15 min warm-up\n2x 15 min @ zone 4\n5 min recovery\nCool-down';
    }
    if (intensity === 'interval') return '15 min warm-up\n5x 3 min @ zone 5\n3 min recovery\nCool-down';
  }

  if (discipline === 'swim') {
    if (intensity === 'easy') return 'Steady swim, focus on technique';
    if (intensity === 'threshold') {
      if (phase === 'taper') return '400m warm-up\n6x 100m @ zone 4\n15s recovery\n200m cool-down';
      return '400m warm-up\n8x 100m @ zone 4\n15s recovery\n200m cool-down';
    }
    if (intensity === 'interval') return '400m warm-up\n6x 50m @ zone 5\n20s recovery\n200m cool-down';
  }

  return '';
}

// === Plan Generation ===

function generatePlan(config) {
  const {
    raceType, raceDate, planStart,
    runLevel, bikeLevel, swimLevel,
    runSessions, bikeSessions, swimSessions, strengthSessions,
    restDays, polarized, recoveryWeeks, longDay
  } = config;

  const start = new Date(planStart);
  const end = new Date(raceDate);

  // Align start to Monday
  const dayOfWeek = start.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  start.setDate(start.getDate() + mondayOffset);

  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.max(1, Math.floor(totalDays / 7));

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

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + w * 7);

    const taperLength = TAPER_WEEKS[raceType] || 2;
    const isLastWeek = w === totalWeeks - 1;
    const isTaperWeek = w >= totalWeeks - taperLength && totalWeeks > taperLength + 2;
    const isRecoveryWeek = recoveryWeeks && ((w + 1) % 4 === 0) && !isTaperWeek && !isLastWeek;

    // Progress factor: 0 at start, 1 at peak (before taper begins)
    const peakWeek = Math.max(0, totalWeeks - taperLength - 1);
    const progress = peakWeek > 0 ? Math.min(1, w / peakWeek) : 0;

    // Volume multiplier
    let volumeMultiplier = 1;
    if (isTaperWeek || isLastWeek) {
      const weeksUntilRace = totalWeeks - 1 - w;
      volumeMultiplier = 0.55 + (weeksUntilRace / Math.max(1, taperLength)) * 0.25;
    } else if (isRecoveryWeek) {
      volumeMultiplier = 0.75;
    }

    // Determine training phase
    const trainingWeeks = totalWeeks - taperLength;
    let phase = 'base';
    if (isTaperWeek || isLastWeek) {
      phase = 'taper';
    } else {
      const baseEnd = Math.floor(trainingWeeks * PHASE_SPLITS.base);
      const buildEnd = baseEnd + Math.floor(trainingWeeks * PHASE_SPLITS.build);
      if (w >= buildEnd) phase = 'peak';
      else if (w >= baseEnd) phase = 'build';
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
      const intensity = getSessionIntensity(i, runSessions, polarized, isLong, phase);
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
      const intensity = getSessionIntensity(i, bikeSessions, polarized, isLong, phase);
      workouts.push({
        discipline: 'bike',
        duration: isLong ? Math.round(bikeDuration * longMult.bike / 5) * 5 : bikeDuration,
        intensity,
        isLong,
        suggestion: getWorkoutSuggestion('bike', intensity, isLong, phase),
      });
    }
    for (let i = 0; i < (isRecoveryWeek ? Math.max(1, swimSessions - 1) : swimSessions); i++) {
      const intensity = getSessionIntensity(i, swimSessions, polarized, false, phase);
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

    // Group weeks for display
    weeks.push({
      weekNumber: w + 1,
      weekStart,
      isRecovery: isRecoveryWeek,
      isTaper: isTaperWeek || isLastWeek,
      phase,
      days: daySlots,
      totalSessions,
    });
  }

  return groupWeeks(weeks);
}

function getSessionIntensity(sessionIndex, totalSessions, polarized, isLong, phase) {
  if (!polarized) return 'easy';
  if (isLong) return 'easy';
  if (totalSessions <= 1) return 'easy';

  if (phase === 'base') return 'easy';

  if (phase === 'build') {
    if (sessionIndex === 0 && totalSessions >= 2) return 'threshold';
    return 'easy';
  }

  if (phase === 'peak') {
    if (sessionIndex === 0 && totalSessions >= 2) return 'threshold';
    if (sessionIndex === 2 && totalSessions >= 4) return 'interval';
    return 'easy';
  }

  if (phase === 'taper') {
    if (sessionIndex === 0 && totalSessions >= 2) return 'threshold';
    return 'easy';
  }

  return 'easy';
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
    const row = document.createElement('div');
    row.className = 'week-row';
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

    row.appendChild(label);

    // Day cells
    for (let d = 0; d < 7; d++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      cell.dataset.groupIdx = groupIdx;
      cell.dataset.dayIdx = d;

      const dayWorkouts = group.template.days[d];
      dayWorkouts.forEach((workout, workoutIdx) => {
        const block = createWorkoutBlock(workout, groupIdx, d, workoutIdx, false);
        cell.appendChild(block);
      });

      row.appendChild(cell);
    }

    grid.appendChild(row);
  });
}

// === Drag and Drop ===

let dragData = null;

function handleDragStart(e) {
  const block = e.currentTarget;
  dragData = {
    groupIdx: parseInt(block.dataset.groupIdx),
    dayIdx: parseInt(block.dataset.dayIdx),
    workoutIdx: parseInt(block.dataset.workoutIdx),
  };
  block.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  // Need to set data for Firefox
  e.dataTransfer.setData('text/plain', '');
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  e.currentTarget.dataset.justDragged = 'true';
  // Clean up all drag-over states
  document.querySelectorAll('.day-cell.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
  document.querySelectorAll('.day-cell.drag-over-warn').forEach(el => {
    el.classList.remove('drag-over-warn');
  });
  dragData = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  const cell = e.currentTarget;
  if (!dragData) return;

  // Check if this would cause an adjacent conflict
  const targetGroup = parseInt(cell.dataset.groupIdx);
  const targetDay = parseInt(cell.dataset.dayIdx);

  if (targetGroup === dragData.groupIdx) {
    const group = currentGroups[targetGroup];
    const workout = group.template.days[dragData.dayIdx][dragData.workoutIdx];
    const hasConflict = wouldCauseAdjacentConflict(group, targetDay, workout.discipline, dragData.dayIdx);
    cell.classList.add(hasConflict ? 'drag-over-warn' : 'drag-over');
  } else {
    cell.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
  e.currentTarget.classList.remove('drag-over-warn');
}

function handleDrop(e) {
  // No-op for full calendar view (editing is done in the template editor)
  e.preventDefault();
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
  const total = group.template.totalSessions;
  const meta = row.querySelector('.week-progress');
  if (meta) {
    meta.textContent = `${completed.length}/${total}`;
  }
  const fill = row.querySelector('.progress-fill');
  if (fill) {
    const pct = total > 0 ? (completed.length / total) * 100 : 0;
    fill.style.width = `${pct}%`;
    fill.classList.toggle('progress-complete', completed.length === total && total > 0);
  }
}

// === Config & State ===

function getConfig() {
  return {
    raceType: document.getElementById('race-type').value,
    raceDate: document.getElementById('race-date').value,
    planStart: document.getElementById('plan-start').value,
    runBenchmark: document.getElementById('run-benchmark').value,
    bikeBenchmark: document.getElementById('bike-benchmark').value,
    swimBenchmark: document.getElementById('swim-benchmark').value,
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

function validateConfig(config) {
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
let completedWorkouts = new Set();
let templateReturnTo = 'settings';
let settingsReturnTo = null;

function generateTemplate(config) {
  // Generate a single "week 1" to use as the editable template
  const planConfig = {
    ...config,
    runLevel: getRunLevel(config.runBenchmark),
    bikeLevel: getBikeLevel(config.bikeBenchmark),
    swimLevel: getSwimLevel(config.swimBenchmark),
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

    cell.addEventListener('dragover', handleDragOver);
    cell.addEventListener('dragenter', handleDragEnter);
    cell.addEventListener('dragleave', handleDragLeave);
    cell.addEventListener('drop', handleTemplateDrop);

    const dayWorkouts = templateGroup.template.days[d];
    dayWorkouts.forEach((workout, workoutIdx) => {
      const block = createWorkoutBlock(workout, 0, d, workoutIdx, true);
      cell.appendChild(block);
    });

    row.appendChild(cell);
  }

  grid.appendChild(row);
  checkAdjacentConflicts();
}

function createWorkoutBlock(workout, groupIdx, dayIdx, workoutIdx, isTemplate) {
  const block = document.createElement('div');
  block.className = `workout-block ${getDisciplineClass(workout.discipline)}`;
  block.dataset.groupIdx = groupIdx;
  block.dataset.dayIdx = dayIdx;
  block.dataset.workoutIdx = workoutIdx;

  if (isTemplate) {
    block.draggable = true;
    block.addEventListener('dragstart', handleDragStart);
    block.addEventListener('dragend', handleDragEnd);
  }

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

  if (!isTemplate) {
    const key = `${groupIdx}-${dayIdx}-${workoutIdx}`;
    if (completedWorkouts.has(key)) {
      block.classList.add('completed');
    }
    block.addEventListener('click', (e) => {
      if (block.dataset.justDragged) {
        delete block.dataset.justDragged;
        return;
      }
      const k = `${groupIdx}-${dayIdx}-${workoutIdx}`;
      if (completedWorkouts.has(k)) {
        completedWorkouts.delete(k);
      } else {
        completedWorkouts.add(k);
      }
      block.classList.toggle('completed');
      updateProgress(block.closest('.week-row'), currentGroups[groupIdx]);
      savePlanToStorage();
    });
  }

  return block;
}

function handleTemplateDrop(e) {
  e.preventDefault();
  const cell = e.currentTarget;
  cell.classList.remove('drag-over');
  cell.classList.remove('drag-over-warn');

  if (!dragData) return;

  const targetDayIdx = parseInt(cell.dataset.dayIdx);
  const sourceDayIdx = dragData.dayIdx;
  const workoutIdx = dragData.workoutIdx;

  if (targetDayIdx === sourceDayIdx) return;

  const days = currentTemplate.days;
  const workout = days[sourceDayIdx][workoutIdx];

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
function applyTemplateToFullPlan(template, config) {
  const planConfig = {
    ...config,
    runLevel: getRunLevel(config.runBenchmark),
    bikeLevel: getBikeLevel(config.bikeBenchmark),
    swimLevel: getSwimLevel(config.swimBenchmark),
  };

  // Generate the base plan (for durations/volumes)
  const groups = generatePlan(planConfig);

  // Now override each week's day layout with the template
  groups.forEach(group => {
    group.weeks.forEach(week => {
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

      // Any leftover workouts (from recovery weeks with fewer sessions) — skip them
      // Update total sessions
      week.totalSessions = week.days.flat().filter(w => w.discipline !== 'rest').length;
    });

    // Update the group template to first week
    group.template = group.weeks[0];
  });

  // Re-group since layouts may now be more consistent
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

// Step 2 → Back (settings or plan, depending on where we came from)
document.getElementById('template-back-btn').addEventListener('click', () => {
  showSection(templateReturnTo || 'settings');
});

// Step 2 → Step 3: Apply template to full calendar
document.getElementById('apply-template-btn').addEventListener('click', () => {
  if (!currentTemplate || !currentPlanConfig) return;

  const groups = applyTemplateToFullPlan(currentTemplate, currentPlanConfig);
  renderPlan(groups);
  showSection('plan-display');

  savePlanToStorage();
});

// Step 3 → Step 2: Edit schedule
document.getElementById('edit-template-btn').addEventListener('click', () => {
  if (currentTemplate) {
    renderTemplate(currentTemplate);
  }
  templateReturnTo = 'plan-display';
  showSection('template-editor');
});

// Step 3 → Step 1: Edit settings
document.getElementById('edit-btn').addEventListener('click', () => {
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
    completions: [...completedWorkouts],
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
  currentGroups = [];
  completedWorkouts = new Set();
  document.getElementById('plan-grid').innerHTML = '';

  const today = new Date();
  const raceDate = new Date(today);
  raceDate.setDate(raceDate.getDate() + 8 * 7);
  document.getElementById('plan-start').value = today.toISOString().split('T')[0];
  document.getElementById('race-date').value = raceDate.toISOString().split('T')[0];

  showSection('settings');
});

function restoreConfig(config) {
  if (config.raceType) document.getElementById('race-type').value = config.raceType;
  if (config.raceDate) document.getElementById('race-date').value = config.raceDate;
  if (config.planStart) document.getElementById('plan-start').value = config.planStart;
  if (config.runBenchmark) document.getElementById('run-benchmark').value = config.runBenchmark;
  if (config.bikeBenchmark) document.getElementById('bike-benchmark').value = config.bikeBenchmark;
  if (config.swimBenchmark) document.getElementById('swim-benchmark').value = config.swimBenchmark;
  if (config.runSessions != null) document.getElementById('run-sessions').value = config.runSessions;
  if (config.bikeSessions != null) document.getElementById('bike-sessions').value = config.bikeSessions;
  if (config.swimSessions != null) document.getElementById('swim-sessions').value = config.swimSessions;
  if (config.strengthSessions != null) document.getElementById('strength-sessions').value = config.strengthSessions;
  if (config.restDays != null) document.getElementById('rest-days').value = config.restDays;
  if (config.polarized != null) document.getElementById('polarized').checked = config.polarized;
  if (config.recoveryWeeks != null) document.getElementById('recovery-weeks').checked = config.recoveryWeeks;
  if (config.longDay != null) document.getElementById('long-day').value = config.longDay;
}

// === Init ===
(function init() {
  const today = new Date();
  const raceDate = new Date(today);
  raceDate.setDate(raceDate.getDate() + 8 * 7);

  document.getElementById('plan-start').value = today.toISOString().split('T')[0];
  document.getElementById('race-date').value = raceDate.toISOString().split('T')[0];

  // Auto-restore saved plan if it exists
  const savedPlan = localStorage.getItem('simpletri-plan');
  if (savedPlan) {
    try {
      const parsed = JSON.parse(savedPlan);
      if (parsed.config && parsed.template) {
        restoreConfig(parsed.config);
        currentPlanConfig = parsed.config;
        currentTemplate = parsed.template;
        completedWorkouts = new Set(parsed.completions || []);
        const groups = applyTemplateToFullPlan(parsed.template, parsed.config);
        renderPlan(groups);
        showSection('plan-display');
        document.querySelectorAll('.week-row[data-group-idx]').forEach(row => {
          const idx = parseInt(row.dataset.groupIdx);
          if (currentGroups[idx]) updateProgress(row, currentGroups[idx]);
        });
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
      restoreConfig(JSON.parse(savedConfig));
    } catch (e) {
      // ignore
    }
  }
})();
