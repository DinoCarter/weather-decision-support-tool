/**
 * Weather Decision Support Tool — v2
 * Oklahoma State University — Office of Emergency Management
 * script.js
 *
 * ARCHITECTURE NOTES:
 * - Each hazard category produces a sub-score on a 0–100 scale
 * - Sub-scores are weighted into three final scores:
 *     opsScore     = Campus Operations
 *     outdoorScore = Outdoor Exposure (weight-adjusted for events)
 *     travelScore  = Road & Travel (standalone)
 * - Outdoor weights shift when a major outdoor event is scheduled,
 *   scaling by attendance tier (see OUTDOOR_EVENT_WEIGHTS)
 * - Tornado warning and active lightning hard-override relevant scores
 * - Forecast confidence is displayed but does not alter scores
 * - No external dependencies — runs entirely in the browser
 *
 * STOPLIGHT THRESHOLDS (v2):
 *   Green  0–24
 *   Yellow 25–49
 *   Amber  50–74
 *   Red    75–100
 */

// ── CLOCK ───────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  });
}
updateClock();
setInterval(updateClock, 30000);

document.addEventListener('DOMContentLoaded', () => {
  const d = document.getElementById('assessment-date');
  if (d) d.value = new Date().toISOString().split('T')[0];
});

// ── BASE SCORING WEIGHTS ────────────────────────────────────
const WEIGHTS = {
  ops: {
    severe: 0.45,
    winter: 0.20,
    flood:  0.20,
    heat:   0.05,
    wind:   0.10
  },
  // Base outdoor weights — may be overridden by event modifier
  outdoor: {
    severe: 0.40,
    winter: 0.15,
    flood:  0.05,
    heat:   0.25,
    wind:   0.15
  }
};

// ── OUTDOOR EVENT WEIGHT TABLES ─────────────────────────────
/**
 * When a major outdoor event is scheduled, weight shifts from
 * winter and flood toward severe, heat, and wind — reflecting
 * that crowd exposure to real-time hazards dominates over
 * accumulation-style winter and flood risk.
 *
 * All rows sum to 1.0.
 * attendance value: 0=no event, 1=<100, 2=100-1000, 3=1000-5000, 4=5000+
 */
const OUTDOOR_EVENT_WEIGHTS = [
  // No event — base weights
  { severe: 0.40, winter: 0.15, flood: 0.05, heat: 0.25, wind: 0.15 },
  // < 100
  { severe: 0.42, winter: 0.12, flood: 0.03, heat: 0.27, wind: 0.16 },
  // 100–1,000
  { severe: 0.45, winter: 0.07, flood: 0.02, heat: 0.29, wind: 0.17 },
  // 1,000–5,000
  { severe: 0.48, winter: 0.02, flood: 0.01, heat: 0.31, wind: 0.18 },
  // 5,000+
  { severe: 0.50, winter: 0.00, flood: 0.00, heat: 0.33, wind: 0.17 }
];

// ── HELPERS ─────────────────────────────────────────────────
function getVal(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = parseInt(el.value, 10);
  return isNaN(v) ? 0 : v;
}

function getStrVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

/**
 * Maps a 0–3 tier to a 0–100 sub-score contribution.
 * maxPts = maximum points this input contributes at tier 3.
 */
function tierToScore(tier, maxPts) {
  const map = [0, 0.33, 0.67, 1.0];
  return Math.round(map[Math.min(tier, 3)] * maxPts);
}

// ── CATEGORY SCORERS ────────────────────────────────────────

function scoreSevere() {
  const alertPts = [0, 10, 20, 40, 60, 90][getVal('nws-alert')] || 0;
  const watchPts = [0, 20, 35][getVal('tornado-watch')] || 0;
  const hailPts  = [0, 10, 20][getVal('hail')] || 0;
  return Math.min(100, alertPts + watchPts + hailPts);
}

function scoreFlood() {
  // Direct tier-to-score mapping per PRD spec
  const map = [0, 35, 70, 100];
  return map[Math.min(getVal('flood-level'), 3)];
}

function scoreWinter() {
  // Precipitation type: None=0, Rain+Wind=20, FreezingDrizzle=50, FreezingRain=75, Sleet/Ice=100
  const precipScores = [0, 20, 50, 75, 100];
  const precipRaw    = Math.min(getVal('precip-type'), 4);
  const precipPts    = Math.round(precipScores[precipRaw] * 0.15); // 15pt max contribution

  const icePts       = tierToScore(getVal('ice-accum'),   40);
  const snowPts      = tierToScore(getVal('snow-accum'),  20);
  const windChillPts = tierToScore(getVal('wind-chill'),  20);
  const freezePts    = getVal('freeze-thaw') === 1 ? 10 : 0;

  return Math.min(100, icePts + snowPts + windChillPts + precipPts + freezePts);
}

function scoreHeat() {
  const wbgt = getVal('wbgt');
  if (wbgt >= 0) return tierToScore(wbgt, 100);
  return tierToScore(getVal('heat-index'), 100);
}

function scoreWind() {
  const windPts = tierToScore(getVal('wind-speed'), 60);
  const gustPts = tierToScore(getVal('wind-gusts'), 40);
  return Math.min(100, windPts + gustPts);
}

function scoreTravel() {
  // FR-3: Road 40, ODOT 30, Visibility 20, Walkways 10
  const roadPts = tierToScore(getVal('road-conditions'),  40);
  const odotPts = tierToScore(getVal('odot-advisory'),    30);
  const visPts  = tierToScore(getVal('visibility'),       20);
  const walkPts = tierToScore(getVal('campus-walkways'),  10);
  // Flood adds directly to travel score (up to 20 pts)
  const floodTravelPts = Math.round(scoreFlood() * 0.20);
  return Math.min(100, roadPts + odotPts + visPts + walkPts + floodTravelPts);
}

// ── OUTDOOR WEIGHT SELECTOR ──────────────────────────────────
function getOutdoorWeights() {
  const hasEvent    = getVal('outdoor-event') === 1;
  const attendance  = getVal('attendance');
  if (!hasEvent) return OUTDOOR_EVENT_WEIGHTS[0];
  // attendance: 1=<100, 2=100-1000, 3=1000-5000, 4=5000+
  return OUTDOOR_EVENT_WEIGHTS[Math.min(attendance, 4)] || OUTDOOR_EVENT_WEIGHTS[1];
}

// ── MAIN CALCULATION ────────────────────────────────────────
function calculateScores() {
  const severe = scoreSevere();
  const flood  = scoreFlood();
  const winter = scoreWinter();
  const heat   = scoreHeat();
  const wind   = scoreWind();
  const travel = scoreTravel();

  const ow = getOutdoorWeights();

  let opsScore = Math.round(
    severe * WEIGHTS.ops.severe +
    winter * WEIGHTS.ops.winter +
    flood  * WEIGHTS.ops.flood  +
    heat   * WEIGHTS.ops.heat   +
    wind   * WEIGHTS.ops.wind
  );

  let outdoorScore = Math.round(
    severe * ow.severe +
    winter * ow.winter +
    flood  * ow.flood  +
    heat   * ow.heat   +
    wind   * ow.wind
  );

  let travelScore = travel;

  // ── HARD OVERRIDES ──
  const tornadoWarning  = getVal('nws-alert') === 5;
  const lightningActive = getVal('lightning') === 1;

  let opsOverride     = null;
  let outdoorOverride = null;

  if (tornadoWarning) {
    opsScore        = 100;
    outdoorScore    = 100;
    opsOverride     = 'Tornado Warning / PDS in effect — automatic Red.';
    outdoorOverride = 'Tornado Warning / PDS in effect — automatic Red.';
  }

  if (lightningActive && !tornadoWarning) {
    outdoorScore    = 100;
    outdoorOverride = 'Active lightning detected within 8 miles — outdoor exposure automatic Red.';
  }

  opsScore     = Math.min(100, Math.max(0, opsScore));
  outdoorScore = Math.min(100, Math.max(0, outdoorScore));
  travelScore  = Math.min(100, Math.max(0, travelScore));

  const conditions = buildConditionSummary(
    severe, flood, winter, heat, wind, travel,
    tornadoWarning, lightningActive
  );

  renderResults(opsScore, outdoorScore, travelScore, conditions, opsOverride, outdoorOverride);
}

// ── STOPLIGHT LOGIC (v2 thresholds) ─────────────────────────
function scoreToLevel(score) {
  if (score < 25) return { level: 'green',  label: 'Normal Operations' };
  if (score < 50) return { level: 'yellow', label: 'Elevated Caution' };
  if (score < 75) return { level: 'amber',  label: 'High Risk' };
  return               { level: 'red',    label: 'Severe Risk' };
}

const SCORE_DESCRIPTIONS = {
  ops: {
    green:  'No operational changes recommended.',
    yellow: 'Increase monitoring and notify decision makers.',
    amber:  'Evaluate delayed start, early release, staffing adjustments, and contingency plans.',
    red:    'Evaluate closure, cancellation, sheltering actions, and emergency procedures.'
  },
  outdoor: {
    green:  'Activities may proceed. Maintain normal weather awareness.',
    yellow: 'Maintain monitoring and identify shelter options.',
    amber:  'Modify or relocate activities. Reduce exposure duration.',
    red:    'Suspend or cancel outdoor activities.'
  },
  travel: {
    green:  'Normal travel conditions.',
    yellow: 'Allow extra travel time. Reduce speed in reduced-visibility or wet conditions.',
    amber:  'Limit travel to essential purposes. Notify commuters before departure.',
    red:    'Restrict travel to essential personnel when practical.'
  }
};

// ── CONDITION SUMMARY ────────────────────────────────────────
function buildConditionSummary(severe, flood, winter, heat, wind, travel, tornadoWarning, lightningActive) {
  const items   = [];
  const county  = getCountyLabel();
  const window  = getWindowLabel();

  function riskColor(score) {
    if (score < 25) return 'green';
    if (score < 50) return 'yellow';
    if (score < 75) return 'amber';
    return 'red';
  }

  // ── Overrides ──
  if (tornadoWarning) {
    items.push({ color: 'red', icon: 'Tornado Warning',
      text: `A Tornado Warning or PDS event is active in or near ${county}. All outdoor activities must be suspended immediately. Shelter-in-place protocols should be activated for all campus occupants.` });
  }
  if (lightningActive) {
    items.push({ color: 'red', icon: 'Lightning',
      text: `Active lightning has been detected within 8 miles. All outdoor activities must suspend immediately. Do not resume until 30 minutes have passed since the last observed lightning strike.` });
  }

  // ── Severe weather ──
  const nwsAlert    = getVal('nws-alert');
  const alertLabels = ['', 'Special Weather Statement', 'Advisory', 'Watch', 'Warning', 'Tornado Warning / PDS / Emergency'];
  if (nwsAlert > 0 && !tornadoWarning) {
    items.push({ color: riskColor(severe), icon: 'NWS Alert',
      text: `The National Weather Service has issued a ${alertLabels[nwsAlert]} for ${county} during the ${window}. Monitor official NWS products and forecast discussions for updates.` });
  }
  const tornadoWatch = getVal('tornado-watch');
  if (tornadoWatch > 0 && !tornadoWarning) {
    items.push({ color: riskColor(severe), icon: 'Tornado Watch',
      text: tornadoWatch === 2
        ? `A Particularly Dangerous Situation (PDS) Tornado Watch is in effect for ${county}. This represents an elevated and potentially historic tornado threat. Identify shelter locations, notify campus leadership, and prepare to act immediately on any warnings.`
        : `A Tornado Watch is in effect for ${county}. Atmospheric conditions are favorable for tornado development. Identify shelter locations and remain alert for any warning upgrades.` });
  }
  if (getVal('hail') === 2) {
    items.push({ color: 'amber', icon: 'Hail',
      text: `Large hail of one inch or greater is possible during the ${window}. Damage to vehicles, rooftop equipment, and outdoor structures is a concern. Advise the campus community to shelter vehicles when possible.` });
  }

  // ── Flood ──
  const floodLevel = getVal('flood-level');
  if (floodLevel > 0) {
    const floodMessages = [
      '',
      `Localized nuisance flooding is possible in ${county} during the ${window}. Low-lying areas, drainage corridors, and underpasses may experience standing water. Monitor conditions and avoid unnecessary travel through affected areas.`,
      `A Flash Flood Watch is in effect for ${county}. Flash flooding is possible. Avoid flood-prone areas and do not attempt to drive through flooded roadways. Advise campus community to monitor conditions closely and plan alternate routes.`,
      `A Flash Flood Warning is in effect for ${county}. Flash flooding is occurring or is imminent. Avoid all flood-prone areas immediately. Travel should be suspended where flooding is reported. Commuter students and staff should be notified before attempting travel.`
    ];
    items.push({ color: riskColor(flood), icon: 'Flooding', text: floodMessages[floodLevel] });
  }

  // ── Winter ──
  const iceLevel = getVal('ice-accum');
  if (iceLevel > 0) {
    const iceMessages = [
      '',
      `Trace to 0.10 inches of ice accumulation is forecast for ${county} during the ${window}. Walkways and road surfaces may become slippery. Pre-treatment of surfaces and early morning monitoring are recommended.`,
      `Ice accumulation of 0.10 to 0.25 inches is forecast. This range produces hazardous walking and driving conditions. Delays or operational modifications should be evaluated.`,
      `Ice accumulation exceeding 0.25 inches is forecast, meeting or exceeding the Ice Storm Warning threshold. Campus operations closure is strongly indicated. Pre-position resources and notify essential personnel.`
    ];
    items.push({ color: riskColor(winter), icon: 'Ice Accumulation', text: iceMessages[iceLevel] });
  }

  const snowLevel = getVal('snow-accum');
  if (snowLevel >= 2) {
    const snowMessages = [
      '', '',
      `Three to six inches of snow is forecast. Plowing and de-icing operations will be required. Allow additional time for travel and campus access. Monitor Facilities Management updates on clearing progress.`,
      `More than six inches of snow is forecast. Significant travel and campus access disruptions are expected. Coordinate with Facilities Management and University Police on response priorities.`
    ];
    items.push({ color: riskColor(winter), icon: 'Snow Accumulation', text: snowMessages[snowLevel] });
  }

  const windChill = getVal('wind-chill');
  if (windChill >= 2) {
    items.push({ color: riskColor(winter), icon: 'Wind Chill',
      text: windChill === 3
        ? `Wind chill values below -10°F are forecast. Frostbite can occur in less than 30 minutes on exposed skin. Extended outdoor exposure should not be permitted without cold weather protective equipment.`
        : `Wind chill values between -10°F and 0°F are forecast. Outdoor activity should be limited and cold weather protective equipment is required for any extended exposure.` });
  }

  const precipType = getVal('precip-type');
  if (precipType === 2) {
    items.push({ color: 'amber', icon: 'Freezing Drizzle',
      text: `Freezing drizzle is forecast during the ${window}. This hazard is particularly dangerous because accumulation is difficult to see on road and walkway surfaces. Black ice conditions are likely. Exercise significant caution.` });
  } else if (precipType === 3) {
    items.push({ color: riskColor(winter), icon: 'Freezing Rain',
      text: `Freezing rain is forecast during the ${window}. Ice will accumulate on all exposed surfaces including roads, walkways, vehicles, and infrastructure. Hazardous travel and pedestrian conditions are expected.` });
  } else if (precipType === 4) {
    items.push({ color: riskColor(winter), icon: 'Sleet / Ice Mix',
      text: `A sleet and ice mix is forecast during the ${window}. Accumulating sleet combined with freezing precipitation will create hazardous conditions on all surfaces. This combination is among the most operationally disruptive winter weather scenarios.` });
  }

  if (getVal('freeze-thaw') === 1) {
    items.push({ color: 'amber', icon: 'Freeze-Thaw Cycle',
      text: `A freeze-thaw cycle is forecast with temperatures crossing 32°F. This significantly increases black ice risk on road surfaces, elevated walkways, bridge decks, and shadowed areas. Morning hours typically carry the highest risk as overnight refreezing sets in.` });
  }

  // ── Heat ──
  const wbgt    = getVal('wbgt');
  const useWBGT = wbgt >= 0;
  if (useWBGT && wbgt > 0) {
    const wbgtMessages = [
      '', '',
      `WBGT of 85°F to 90°F indicates high heat stress conditions. Outdoor athletic and physical labor activities should be modified with mandatory rest breaks and hydration requirements. Consider rescheduling high-intensity work to cooler hours.`,
      `WBGT above 90°F indicates extreme heat stress. Outdoor athletic activities should be suspended. Heat illness risk is significant without aggressive rest and hydration protocols. Outdoor events should be evaluated for postponement or indoor relocation.`
    ];
    items.push({ color: riskColor(heat), icon: 'WBGT', text: wbgtMessages[wbgt] });
  } else if (!useWBGT) {
    const hiLevel = getVal('heat-index');
    if (hiLevel > 0) {
      const hiMessages = [
        '',
        `Heat index values of 90°F to 100°F are forecast. Caution is warranted for extended outdoor exposure. Encourage hydration and access to shade, particularly for outdoor workers and event participants.`,
        `Heat index values of 100°F to 108°F are forecast (NWS Danger range). Outdoor activity should be shortened and high-intensity work rescheduled to cooler hours. Ensure water and shade access for all outdoor personnel.`,
        `Heat index values above 108°F are forecast (NWS Extreme Danger range). Outdoor activities should be cancelled or moved indoors. Heat illness risk is high for all individuals regardless of physical condition.`
      ];
      items.push({ color: riskColor(heat), icon: 'Heat Index', text: hiMessages[hiLevel] });
    }
  }

  // ── Wind ──
  const windSpeed = getVal('wind-speed');
  const windGusts = getVal('wind-gusts');
  if (windSpeed >= 2 || windGusts >= 2) {
    const maxWind     = Math.max(windSpeed, windGusts);
    const windMessages = [
      '', '',
      `Sustained winds of 35 to 50 mph with gusts up to 60 mph are possible during the ${window}. Outdoor structures, temporary signage, canopies, and tents may be unsafe. Outdoor events should be evaluated for relocation or postponement.`,
      `Sustained winds above 50 mph with extreme gusts are forecast. High Wind Warning conditions are expected. Outdoor activities should not proceed. Large outdoor structures and vehicles are at risk.`
    ];
    items.push({ color: riskColor(wind), icon: 'Wind', text: windMessages[Math.min(maxWind, 3)] });
  }

  // ── Travel ──
  const odotLevel = getVal('odot-advisory');
  const roadLevel = getVal('road-conditions');
  if (odotLevel >= 2) {
    const odotMessages = [
      '', '',
      `An ODOT Travel Warning is in effect. Non-essential travel should be avoided. Commuter students and staff should be notified before morning departure and provided with guidance on campus access.`,
      `An Emergency Travel Ban is in effect. Campus access for commuters is not recommended. Only essential personnel should be on campus and routes should be confirmed passable before travel.`
    ];
    items.push({ color: 'red', icon: 'ODOT Advisory', text: odotMessages[odotLevel] });
  } else if (roadLevel >= 2) {
    const roadMessages = [
      '', '',
      `Patchy ice or snow is reported on primary routes to campus. Commuters should allow significantly more travel time and exercise caution, particularly on bridges and elevated roadways.`,
      `Widespread ice or packed snow is reported on primary routes. Travel is hazardous. Commuter students and staff should be notified before morning departure.`
    ];
    items.push({ color: riskColor(travel), icon: 'Road Conditions', text: roadMessages[roadLevel] });
  }

  if (floodLevel >= 2) {
    items.push({ color: riskColor(flood), icon: 'Flood — Travel',
      text: `Flooding conditions may affect primary travel routes. Avoid all flooded roadways regardless of apparent depth. Turn around, don't drown.` });
  }

  const walkLevel = getVal('campus-walkways');
  if (walkLevel >= 2) {
    items.push({ color: riskColor(travel), icon: 'Campus Walkways',
      text: walkLevel === 3
        ? `Widespread ice has been reported on campus walkways and parking areas. Fall risk is significant. Consider limiting outdoor pedestrian movement until surfaces are treated. Pre-position additional de-icing resources.`
        : `Icy patches have been reported on campus walkways. High-traffic areas should be treated as a priority. Advise campus community to use main walkways and exercise caution on all outdoor surfaces.` });
  }

  const visLevel = getVal('visibility');
  if (visLevel >= 1) {
    const visMessages = [
      '',
      `Visibility below one mile is forecast due to fog or precipitation. Commuters should reduce speed and increase following distance. Ensure campus exterior lighting is operational.`,
      `Visibility below one quarter mile is forecast. Near-zero visibility conditions significantly increase accident risk for commuters. Consider early notification to commuter students and staff.`,
      `Near-zero visibility conditions are forecast. Travel under these conditions is extremely hazardous. Commuter notifications should be sent before morning departure, and travel should be limited to essential purposes.`
    ];
    items.push({ color: riskColor(travel), icon: 'Visibility', text: visMessages[visLevel] });
  }

  // ── Campus context notes ──
  const hasEvent   = getVal('outdoor-event') === 1;
  const attendance = getVal('attendance');
  if (hasEvent && attendance >= 3) {
    const attLabels = ['', 'fewer than 100', '100 to 1,000', '1,000 to 5,000', 'more than 5,000'];
    items.push({ color: 'yellow', icon: 'Event Context',
      text: `A major outdoor event with an estimated attendance of ${attLabels[attendance]} is scheduled during the ${window}. Outdoor weather risk weights have been increased to reflect the elevated exposure of a large assembled group. Shelter and evacuation logistics should be confirmed in advance.` });
  }

  // ── Forecast confidence note ──
  const confidence = getStrVal('forecast-confidence');
  if (confidence === 'low') {
    items.push({ color: 'yellow', icon: 'Forecast Confidence',
      text: `Forecast confidence is rated Low for this assessment. Conditions may evolve significantly before the ${window}. Earlier decision points are advised and reassessment closer to the event is recommended.` });
  }

  // ── All clear ──
  if (items.length === 0) {
    items.push({ color: 'green', icon: 'All Clear',
      text: `No significant weather concerns have been identified for ${county} during the ${window}. Conditions support normal campus operations and outdoor activities. Continue standard weather monitoring.` });
  }

  return items;
}

// ── RENDER RESULTS ───────────────────────────────────────────
function renderResults(opsScore, outdoorScore, travelScore, conditions, opsOverride, outdoorOverride) {
  const opsLevel     = scoreToLevel(opsScore);
  const outdoorLevel = scoreToLevel(outdoorScore);
  const travelLevel  = scoreToLevel(travelScore);

  setScoreCard('ops',     opsScore,     opsLevel,     SCORE_DESCRIPTIONS.ops[opsLevel.level],        opsOverride);
  setScoreCard('outdoor', outdoorScore, outdoorLevel, SCORE_DESCRIPTIONS.outdoor[outdoorLevel.level], outdoorOverride);
  setScoreCard('travel',  travelScore,  travelLevel,  SCORE_DESCRIPTIONS.travel[travelLevel.level],   null);

  // Confidence badge
  const confidence = getStrVal('forecast-confidence');
  const confBadge  = document.getElementById('confidence-badge');
  if (confBadge) {
    const labels = { low: 'Low', moderate: 'Moderate', high: 'High' };
    confBadge.textContent  = `Forecast Confidence: ${labels[confidence] || 'Not specified'}`;
    confBadge.className    = `confidence-badge conf-${confidence || 'moderate'}`;
  }

  // Context line
  const hasEvent   = getVal('outdoor-event') === 1;
  const attLabels  = ['', '<100', '100–1,000', '1,000–5,000', '5,000+'];
  const attendance = getVal('attendance');
  let contextLine  = `${getCountyLabel()} · ${getDateLabel()} · ${getWindowLabel()} · Assessed ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  if (document.getElementById('assessor-name').value) {
    contextLine += ` by ${document.getElementById('assessor-name').value}`;
  }
  if (hasEvent) contextLine += ` · Outdoor event: est. ${attLabels[attendance] || 'unknown'} attendees`;
  document.getElementById('results-context-line').textContent = contextLine;

  // Condition list
  const ul = document.getElementById('condition-list');
  ul.innerHTML = '';
  conditions.forEach(c => {
    const li = document.createElement('li');
    li.className = `c-${c.color}`;
    li.innerHTML = `<span class="cond-tag">${c.icon}</span><span>${c.text}</span>`;
    ul.appendChild(li);
  });

  const panel = document.getElementById('results-panel');
  panel.style.display = 'flex';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setScoreCard(id, score, levelObj, description, overrideText) {
  document.getElementById(`dot-${id}`).className     = `stoplight-dot ${levelObj.level}`;
  document.getElementById(`status-${id}`).className  = `score-status ${levelObj.level}`;
  document.getElementById(`status-${id}`).textContent = levelObj.label;
  document.getElementById(`number-${id}`).textContent = overrideText ? 'Override' : `Score: ${score}/100`;
  document.getElementById(`desc-${id}`).textContent   = overrideText || description;
  document.getElementById(`score-card-${id}`).className = `score-card ${levelObj.level}`;
}

// ── TOGGLE SUMMARY ───────────────────────────────────────────
function toggleSummary() {
  const summary  = document.getElementById('condition-summary');
  const btn      = document.getElementById('summary-toggle');
  const isHidden = summary.style.display === 'none';
  summary.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? '- Hide Condition Summary' : '+ View Condition Summary';
  if (isHidden) summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── LABEL HELPERS ────────────────────────────────────────────
function getCountyLabel() {
  const map = { payne: 'Payne County', tulsa: 'Tulsa County', cherokee: 'Cherokee County' };
  return map[document.getElementById('county').value] || 'Selected Location';
}

function getDateLabel() {
  const d = document.getElementById('assessment-date').value;
  if (!d) return 'Date not specified';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

function getWindowLabel() {
  const map = { full: 'Full Day', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
  return map[document.getElementById('time-window').value] || 'Full Day';
}

// ── RESET ────────────────────────────────────────────────────
function resetForm() {
  document.getElementById('results-panel').style.display  = 'none';
  document.getElementById('condition-summary').style.display = 'none';
  document.getElementById('summary-toggle').textContent   = '+ View Condition Summary';
  document.querySelectorAll('select').forEach(sel => sel.selectedIndex = 0);
  document.getElementById('assessor-name').value = '';
  document.getElementById('notes').value = '';
  document.getElementById('assessment-date').value = new Date().toISOString().split('T')[0];
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── PDF EXPORT ───────────────────────────────────────────────
function exportPDF() {
  const summary   = document.getElementById('condition-summary');
  const wasHidden = summary.style.display === 'none';
  summary.style.display = 'block';
  const origTitle = document.title;
  document.title  = `OSU Weather Assessment — ${getCountyLabel()} — ${getDateLabel()}`;
  window.print();
  document.title  = origTitle;
  if (wasHidden) summary.style.display = 'none';
}
