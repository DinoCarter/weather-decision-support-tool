/**
 * WDST v2.0 — script.js
 * Oklahoma State University Office of Emergency Management
 *
 * All scoring logic, UI behavior, focus management, and PDF export.
 * No external dependencies — runs entirely in the browser.
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   1. SCORING ENGINE
   ═══════════════════════════════════════════════════════════ */

/**
 * Weight tables — Section 5 of PRD.
 * Structure: WEIGHTS[mode][inputKey][scoreType]
 * scoreType: 'campus' | 'outdoor' | 'roads'
 * All weights per scoreType sum to 100.
 */
const WEIGHTS = {
  severe: {
    rain:      { campus: 15, outdoor: 20, roads: 20 },
    hail:      { campus: 15, outdoor: 15, roads: 15 },
    lightning: { campus:  5, outdoor: 20, roads:  5 },
    windSust:  { campus: 20, outdoor: 10, roads:  5 },
    windGust:  { campus: 20, outdoor: 10, roads: 15 },
    flood:     { campus:  5, outdoor:  5, roads: 20 },
    tornado:   { campus: 20, outdoor: 20, roads: 20 },
  },
  heat: {
    // heatStress = WBGT or Heat Index (mutually exclusive, same weight)
    heatStress: { campus: 80, outdoor: 80, roads: 10 },
    windSust:   { campus: 20, outdoor: 20, roads: 10 },
    // remaining 80% of roads weight has no applicable input in heat mode
  },
  winter: {
    ice:        { campus: 50, outdoor: 20, roads: 40 },
    snow:       { campus: 20, outdoor: 20, roads: 20 },
    windChill:  { campus: 10, outdoor: 30, roads:  5 },
    windGust:   { campus:  5, outdoor: 20, roads: 15 },
    freezeThaw: { campus: 15, outdoor: 10, roads: 20 },
  },
};

/**
 * Recommendation text per score band and category.
 * Returns action-oriented text appropriate for the level.
 */
function getRecommendation(level, category) {
  const recs = {
    green: {
      campus:  'No weather-based action needed. Continue standard monitoring.',
      outdoor: 'No weather-based action needed. Continue standard monitoring.',
      roads:   'No weather-based action needed. Continue standard monitoring.',
    },
    yellow: {
      campus:  'Increase monitoring frequency. Notify decision makers. Begin contingency planning.',
      outdoor: 'Increase monitoring frequency. Notify decision makers. Consider event modifications.',
      roads:   'Increase monitoring frequency. Notify travel coordinators. Begin contingency planning.',
    },
    amber: {
      campus:  'Evaluate operational delays or modifications. Earlier decision points advised.',
      outdoor: 'Evaluate delays, modifications, or contingency activation. Earlier decision points advised.',
      roads:   'Evaluate travel restrictions or route modifications. Contingency activation advised.',
    },
    red: {
      campus:  'Evaluate closure or emergency procedures. Immediate action may be required.',
      outdoor: 'Evaluate cancellation or emergency procedures. Immediate action may be required.',
      roads:   'Evaluate travel restriction or emergency procedures. Immediate action may be required.',
    },
  };
  return recs[level][category];
}

/**
 * Map a numeric score (0–100) to a risk level label.
 */
function scoreToLevel(score) {
  if (score < 25)  return 'green';
  if (score < 50)  return 'yellow';
  if (score < 75)  return 'amber';
  return 'red';
}

const LEVEL_LABELS = {
  green:  'Normal Operations',
  yellow: 'Elevated Caution',
  amber:  'High Risk',
  red:    'Severe Risk',
};

/**
 * In Beta Modal
 */
function initBetaModal() {
  const modal = document.getElementById('beta-modal');
  const closeBtn = document.getElementById('beta-modal-close');

  if (!modal || !closeBtn) return;

  modal.hidden = false;
  document.body.classList.add('modal-open');

  closeBtn.addEventListener('click', () => {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  });
}

/**
 * Calculate a single score from an inputs object and a weight row.
 * Formula: Σ(rawScore × weight) / 100
 * Capped 0–100, rounded to nearest integer.
 */
/**
 * Read all severe weather inputs from the DOM.
 * Returns { campus, outdoor, roads } scores.
 */
function calcSevereScores() {
  const inputs = {
    rain:      getSelectVal('sw-rain'),
    hail:      getSelectVal('sw-hail'),
    lightning: getRadioVal('sw-lightning'),
    windSust:  getSelectVal('sw-wind-sustained'),
    windGust:  getSelectVal('sw-wind-gust'),
    flood:     getRadioVal('sw-flood'),
    tornado:   getRadioVal('sw-tornado'),
  };
  return {
    campus:  calcScoreByType(inputs, 'severe', 'campus'),
    outdoor: calcScoreByType(inputs, 'severe', 'outdoor'),
    roads:   calcScoreByType(inputs, 'severe', 'roads'),
    rawInputs: inputs,
  };
}

/**
 * Generic helper: calculate score for a mode + scoreType combo.
 */
function calcScoreByType(inputs, mode, type) {
  let total = 0;
  const modeWeights = WEIGHTS[mode];
  for (const key in modeWeights) {
    total += (inputs[key] || 0) * (modeWeights[key][type] || 0);
  }
  return Math.min(100, Math.max(0, Math.round(total / 100)));
}

/**
 * Read all heat inputs from the DOM.
 * WBGT and Heat Index are mutually exclusive.
 */
function calcHeatScores() {
  const useWBGT = document.querySelector('input[name="heat-source"]:checked').value === 'wbgt';
  const heatStress = useWBGT
    ? getSelectVal('heat-wbgt')
    : getSelectVal('heat-hi');
  const inputs = {
    heatStress,
    windSust: getSelectVal('heat-wind'),
  };
  return {
    campus:  calcScoreByType(inputs, 'heat', 'campus'),
    outdoor: calcScoreByType(inputs, 'heat', 'outdoor'),
    roads:   calcScoreByType(inputs, 'heat', 'roads'),
    rawInputs: inputs,
    usedWBGT: useWBGT,
  };
}

/**
 * Read all winter weather inputs from the DOM.
 */
function calcWinterScores() {
  const inputs = {
    ice:        getSelectVal('ww-ice'),
    snow:       getSelectVal('ww-snow'),
    windChill:  getSelectVal('ww-windchill'),
    windGust:   getSelectVal('ww-gust'),
    freezeThaw: getRadioVal('ww-freezethaw'),
  };
  return {
    campus:  calcScoreByType(inputs, 'winter', 'campus'),
    outdoor: calcScoreByType(inputs, 'winter', 'outdoor'),
    roads:   calcScoreByType(inputs, 'winter', 'roads'),
    rawInputs: inputs,
  };
}

/* ═══════════════════════════════════════════════════════════
   2. CONDITION SUMMARY ENGINE
   ═══════════════════════════════════════════════════════════ */

/**
 * Generate condition summary items for each active mode.
 * A condition item appears when rawScore > 0.
 */
function buildConditionSummary(mode, rawInputs, county, extra) {
  const items = [];
  const countyLabel = countyName(county);

  if (mode === 'severe') {
    if (rawInputs.rain > 0) {
      const rainLabel = rawInputs.rain === 33 ? '0.01–0.75"' : rawInputs.rain === 67 ? '0.75–1.5"' : '>1.5"';
      items.push({
        tag: 'RAIN ACCUMULATION',
        level: scoreToLevel(rawInputs.rain),
        text: `Forecast precipitation of ${rainLabel} for ${countyLabel}. Evaluate outdoor event surfaces, drainage around campus infrastructure, and road ponding risk.`,
      });
    }
    if (rawInputs.hail > 0) {
      const hailLabel = rawInputs.hail === 50 ? 'small hail (<1" diameter)' : 'large hail (≥1" diameter — golf ball size or larger)';
      items.push({
        tag: 'HAIL',
        level: scoreToLevel(rawInputs.hail),
        text: `${rawInputs.hail === 100 ? 'Large' : 'Small'} hail (${hailLabel}) forecast for ${countyLabel}. Evaluate roof, vehicle, and outdoor equipment exposure. Large hail meets NWS Severe Thunderstorm Warning criteria.`,
      });
    }
    if (rawInputs.lightning > 0) {
      items.push({
        tag: 'LIGHTNING',
        level: 'red',
        text: `Lightning is forecast during the assessment period for ${countyLabel}. Outdoor activities should not proceed without an established lightning safety protocol and evacuation plan. This is a forecast-based input — not real-time detection.`,
      });
    }
    if (rawInputs.windSust > 0) {
      const windLabels = { 25: '20–30 mph', 50: '30–40 mph', 75: '40–50 mph', 100: '>50 mph' };
      items.push({
        tag: 'SUSTAINED WIND',
        level: scoreToLevel(rawInputs.windSust),
        text: `Sustained winds of ${windLabels[rawInputs.windSust]} forecast for ${countyLabel}. Evaluate structural exposure for temporary structures, outdoor signage, and event tenting. Winds above 40 mph may meet NWS Wind Advisory criteria.`,
      });
    }
    if (rawInputs.windGust > 0) {
      const gustLabels = { 25: '30–40 mph', 50: '40–50 mph', 75: '50–60 mph', 100: '>60 mph' };
      items.push({
        tag: 'WIND GUSTS',
        level: scoreToLevel(rawInputs.windGust),
        text: `Maximum gusts of ${gustLabels[rawInputs.windGust]} forecast for ${countyLabel}. Gusts above 58 mph meet NWS High Wind Warning criteria. Evaluate vehicle handling on open roadways and structural resilience.`,
      });
    }
    if (rawInputs.flood > 0) {
      items.push({
        tag: 'FLASH FLOOD',
        level: 'red',
        text: `Flash flooding is possible during the forecast period for ${countyLabel}. Evaluate road closures on low-lying routes, campus drainage infrastructure, and parking lot flood risk. Reference NWS Flash Flood Watch or Warning for official guidance.`,
      });
    }
    if (rawInputs.tornado > 0) {
      items.push({
        tag: 'TORNADO POSSIBLE',
        level: 'red',
        text: `Tornado occurrence is forecast as possible for ${countyLabel}. Verify shelter-in-place locations are accessible and that all campus areas have a clear evacuation route to interior spaces. Reference NWS Tornado Watch or SPC Convective Outlook for official guidance.`,
      });
    }
  }

  if (mode === 'heat') {
    if (rawInputs.heatStress > 0) {
      const usedWBGT = extra && extra.usedWBGT;
      const measureLabel = usedWBGT ? 'WBGT' : 'Heat Index';
      const thresholds = { 33: 'moderate heat stress', 67: 'high heat stress', 100: 'extreme heat stress' };
      items.push({
        tag: usedWBGT ? 'WBGT' : 'HEAT INDEX',
        level: scoreToLevel(rawInputs.heatStress),
        text: `Forecast ${measureLabel} indicates ${thresholds[rawInputs.heatStress]} conditions for ${countyLabel}. ${usedWBGT ? 'A WBGT ≥82°F meets the threshold for activity modification under most athletic and occupational heat protocols.' : 'A Heat Index ≥90°F meets the NWS Heat Advisory threshold.'} Evaluate outdoor work schedules, athletic activity, and the availability of cooling stations.`,
      });
    }
    if (rawInputs.windSust > 0) {
      items.push({
        tag: 'WIND (HEAT CONTEXT)',
        level: scoreToLevel(rawInputs.windSust),
        text: `Sustained winds of ${['','<20 mph','20–30 mph','30–40 mph','>40 mph'][rawInputs.windSust === 25 ? 2 : rawInputs.windSust === 50 ? 3 : 4]} are forecast. At higher speeds (>30 mph), the cooling benefit of wind diminishes and sustained exposure risk remains elevated alongside heat stress.`,
      });
    }
  }

  if (mode === 'winter') {
    if (rawInputs.ice > 0) {
      const iceLabels = { 33: 'trace to 0.10"', 67: '0.10–0.25"', 100: '>0.25"' };
      const iceNote = rawInputs.ice === 100
        ? ' This exceeds the NWS Ice Storm Warning issuance threshold (≥0.25"). Campus operations historically have a high probability of disruption at this level.'
        : rawInputs.ice === 67
        ? ' This approaches the NWS Ice Storm Warning threshold (≥0.25").'
        : '';
      items.push({
        tag: 'ICE ACCUMULATION',
        level: scoreToLevel(rawInputs.ice),
        text: `Ice accumulation of ${iceLabels[rawInputs.ice]} forecast for ${countyLabel}.${iceNote} Evaluate sidewalk treatment schedules, parking lot access, and the need for early campus operation changes.`,
      });
    }
    if (rawInputs.snow > 0) {
      const snowLabels = { 33: '1–3"', 67: '3–6"', 100: '>6"' };
      items.push({
        tag: 'SNOW ACCUMULATION',
        level: scoreToLevel(rawInputs.snow),
        text: `Snow accumulation of ${snowLabels[rawInputs.snow]} forecast for ${countyLabel}. Evaluate snow removal capacity, parking lot and walkway clearance timing, and the impact on early-morning campus access.`,
      });
    }
    if (rawInputs.windChill > 0) {
      const chillLabels = { 25: '20–32°F', 50: '10–20°F', 75: '0–10°F', 100: '<0°F' };
      const chillNote = rawInputs.windChill >= 75
        ? ' This meets the NWS Wind Chill Warning threshold (<0°F).'
        : rawInputs.windChill === 50
        ? ' This meets the NWS Wind Chill Advisory threshold (<20°F).'
        : '';
      items.push({
        tag: 'WIND CHILL',
        level: scoreToLevel(rawInputs.windChill),
        text: `Wind chill values of ${chillLabels[rawInputs.windChill]} forecast for ${countyLabel}.${chillNote} Evaluate outdoor exposure duration for personnel, event attendees, and early-morning commuters. Frostbite risk increases significantly below 0°F.`,
      });
    }
    if (rawInputs.windGust > 0) {
      const gustLabels = { 25: '30–40 mph', 50: '40–50 mph', 75: '50–60 mph', 100: '>60 mph' };
      items.push({
        tag: 'WIND GUSTS',
        level: scoreToLevel(rawInputs.windGust),
        text: `Maximum gusts of ${gustLabels[rawInputs.windGust]} forecast for ${countyLabel}. In winter conditions, gusts significantly worsen wind chill exposure and create blowing snow hazards that reduce visibility on open roadways.`,
      });
    }
    if (rawInputs.freezeThaw > 0) {
      items.push({
        tag: 'FREEZE-THAW CYCLE',
        level: scoreToLevel(rawInputs.freezeThaw),
        text: `Temperatures are expected to cross 32°F in both directions during the forecast period for ${countyLabel}. This is a primary black ice formation mechanism. Evaluate treatment schedules for untreated surfaces, particularly in morning hours when refreezing risk is highest.`,
      });
    }
  }

  if (items.length === 0) {
    items.push({
      tag: 'ALL CLEAR',
      level: 'green',
      text: 'No inputs are contributing to an elevated score for this hazard mode. Continue standard weather monitoring protocols.',
    });
  }

  return items;
}

/* ═══════════════════════════════════════════════════════════
   3. DOM HELPERS
   ═══════════════════════════════════════════════════════════ */

function getSelectVal(id) {
  return parseInt(document.getElementById(id)?.value || '0', 10);
}

function getRadioVal(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? parseInt(checked.value, 10) : 0;
}

function countyName(val) {
  const names = {
    payne:    'Payne County',
    tulsa:    'Tulsa County',
    cherokee: 'Cherokee County',
  };
  return names[val] || val;
}

function formatDateTime(d) {
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/* ═══════════════════════════════════════════════════════════
   4. RESULTS RENDERER
   ═══════════════════════════════════════════════════════════ */

/**
 * Build and inject all results HTML into #results-content.
 */
function renderResults(activeModes) {
  const county       = document.getElementById('county').value;
  const assessDate   = document.getElementById('assessment-date').value;
  const forecastPer  = document.getElementById('forecast-period').value;
  const assessor     = document.getElementById('assessor-name').value;
  const confidence   = document.getElementById('forecast-confidence').value;
  const calcTime     = formatDateTime(new Date());

  // Gather checked advisories
  const checkedAdvisories = [...document.querySelectorAll('input[name="advisory"]:checked')]
    .map(el => el.value);

  // Build meta line
  const metaParts = [countyName(county)];
  if (assessDate) metaParts.push(`Assessment date: ${assessDate}`);
  if (forecastPer) metaParts.push(`Forecast period: ${forecastPer}`);
  if (assessor) metaParts.push(`Assessor: ${assessor}`);
  metaParts.push(`Generated: ${calcTime}`);

  const confidenceLabels = { high: 'High Confidence', moderate: 'Moderate Confidence', low: 'Low Confidence' };
  const confidenceBadgeClass = `confidence-badge--${confidence}`;

  let html = `
    <div class="results-header">
      <div class="results-header-top">
        <div>
          <div class="results-title">Risk Assessment — ${countyName(county)}</div>
          <div class="results-meta">${metaParts.join(' &nbsp;·&nbsp; ')}</div>
        </div>
        <span class="confidence-badge ${confidenceBadgeClass}">${confidenceLabels[confidence]}</span>
      </div>
      ${confidence === 'low' ? `
      <div class="confidence-warning" role="alert">
        <strong>⚠ Low Forecast Confidence:</strong>&nbsp; Forecast conditions may change significantly before the assessment period. Scores should be treated as preliminary. Reassess as the forecast solidifies.
      </div>` : ''}
      ${checkedAdvisories.length > 0 ? `
      <div class="confidence-warning" style="background:#E3F2FD;border-color:#1565C0;color:#0D47A1;margin-top:8px;" role="note">
        <strong>Active NWS Advisories on record:</strong>&nbsp; ${checkedAdvisories.join(', ')}.
      </div>` : ''}
    </div>
  `;

  // Build score blocks per mode
  const modeOrder = ['severe', 'heat', 'winter'];
  const modeConfig = {
    severe: { label: '⛈ Severe Weather', cssClass: 'severe', calcFn: calcSevereScores },
    heat:   { label: '☀ Heat',            cssClass: 'heat',   calcFn: calcHeatScores },
    winter: { label: '❄ Winter Weather', cssClass: 'winter', calcFn: calcWinterScores },
  };

  const allConditionItems = [];

  modeOrder.forEach(mode => {
    if (!activeModes.includes(mode)) return;
    const cfg = modeConfig[mode];
    const result = cfg.calcFn();
    const categories = [
      { key: 'campus',  label: 'Campus Operations', score: result.campus },
      { key: 'outdoor', label: 'Outdoor Activities', score: result.outdoor },
      { key: 'roads',   label: 'Roads & Travel',     score: result.roads, subdued: mode === 'heat' },
    ];

    html += `
      <div class="mode-results-block">
        <div class="mode-results-label mode-results-label--${cfg.cssClass}">${cfg.label}</div>
        <div class="score-cards">
          ${categories.map(cat => renderScoreCard(cat, mode)).join('')}
        </div>
      </div>
    `;

    // Build condition items for summary
    const condItems = buildConditionSummary(mode, result.rawInputs, county, result);
    condItems.forEach(item => allConditionItems.push({ ...item, mode: cfg.label }));
  });

  // Condition Summary block
  html += `
    <div class="condition-summary-wrapper">
      <button
        type="button"
        class="condition-summary-toggle"
        aria-expanded="false"
        aria-controls="condition-summary-body"
        id="condition-summary-btn"
      >
        <span>Condition Summary <span style="color:var(--text-hint);font-weight:400;font-size:0.8em;">(${allConditionItems.length} contributing factor${allConditionItems.length !== 1 ? 's' : ''})</span></span>
        <span class="condition-toggle-icon" aria-hidden="true">▾</span>
      </button>
      <div id="condition-summary-body" class="condition-summary-body" hidden>
        ${allConditionItems.map(item => `
          <div class="condition-item condition-item--${item.level}">
            <span class="condition-tag condition-tag--${item.level}">${item.tag}</span>
            <span class="condition-text">${item.text}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('results-content').innerHTML = html;

  // Wire up condition summary toggle
  const condBtn = document.getElementById('condition-summary-btn');
  const condBody = document.getElementById('condition-summary-body');
  if (condBtn && condBody) {
    condBtn.addEventListener('click', () => {
      const expanded = condBtn.getAttribute('aria-expanded') === 'true';
      condBtn.setAttribute('aria-expanded', String(!expanded));
      condBody.hidden = expanded;
    });
  }
}

/**
 * Render a single score card.
 */
function renderScoreCard({ key, label, score, subdued }, mode) {
  const level = scoreToLevel(score);
  const statusLabel = LEVEL_LABELS[level];
  const rec = getRecommendation(level, key);
  const isSubdued = subdued && mode === 'heat';
  const subduedClass = isSubdued ? ' score-card--subdued' : '';

  const srText = `${label}: ${statusLabel}, score ${score} out of 100. ${rec}`;

  return `
    <div class="score-card${subduedClass}">
      <span class="sr-only">${srText}</span>
      <div class="score-card-category" aria-hidden="true">${label}</div>
      <div class="score-card-main" aria-hidden="true">
        <span class="stoplight-dot stoplight-dot--${level}" aria-hidden="true"></span>
        <span class="score-status score-status--${level}">${statusLabel}</span>
      </div>
      <div class="score-number score-number--${level}" aria-hidden="true">${score}</div>
      <div class="score-out-of" aria-hidden="true">out of 100</div>
      <div class="score-recommendation" aria-hidden="true">${rec}</div>
      ${isSubdued ? '<div class="score-subdued-label">Heat has minimal direct impact on road conditions. Score reflects indirect factors only.</div>' : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   5. UI BEHAVIOR
   ═══════════════════════════════════════════════════════════ */

// Track which modes are active
const activeModes = new Set();

/**
 * Toggle hazard mode on/off.
 */
function toggleMode(mode, btn) {
  if (activeModes.has(mode)) {
    activeModes.delete(mode);
    btn.setAttribute('aria-pressed', 'false');
    const section = document.getElementById(`inputs-${mode}`);
    if (section) section.hidden = true;
  } else {
    activeModes.add(mode);
    btn.setAttribute('aria-pressed', 'true');
    const section = document.getElementById(`inputs-${mode}`);
    if (section) section.hidden = false;
  }
}

/**
 * Handle the WBGT / Heat Index mutual exclusivity toggle.
 */
function initHeatSourceToggle() {
  const radios = document.querySelectorAll('input[name="heat-source"]');
  const wbgtGroup = document.getElementById('wbgt-field-group');
  const hiGroup   = document.getElementById('hi-field-group');
  const wbgtSel   = document.getElementById('heat-wbgt');
  const hiSel     = document.getElementById('heat-hi');

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      const useWBGT = radio.value === 'wbgt';
      // WBGT active
      wbgtSel.disabled = !useWBGT;
      wbgtSel.setAttribute('aria-disabled', String(!useWBGT));
      if (wbgtGroup) wbgtGroup.style.opacity = useWBGT ? '1' : '0.4';
      // Heat Index active
      hiSel.disabled = useWBGT;
      hiSel.setAttribute('aria-disabled', String(useWBGT));
      if (hiGroup) hiGroup.style.opacity = useWBGT ? '0.4' : '1';
    });
  });
}

/**
 * Validate that minimum required fields are filled.
 * Returns null on success, or an error message string.
 */
function validate() {
  const county = document.getElementById('county').value;
  if (!county) return 'Please select a county before calculating.';
  if (activeModes.size === 0) return 'Please select at least one hazard mode (Severe Weather, Heat, or Winter Weather) before calculating.';
  return null;
}

/**
 * Calculate button click handler.
 */
function handleCalculate() {
  const errorEl = document.getElementById('calc-error');
  const error = validate();

  if (error) {
    errorEl.textContent = error;
    errorEl.hidden = false;
    errorEl.focus();
    return;
  }

  errorEl.hidden = true;
  errorEl.textContent = '';

  renderResults([...activeModes]);

  const resultsPanel = document.getElementById('results-panel');
  resultsPanel.hidden = false;
  resultsPanel.focus();
  resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Reset everything to default state.
 */
function handleReset() {
  // Reset form fields
  document.getElementById('county').value = '';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('assessment-date').value = today;
  document.getElementById('forecast-period').value = '';
  document.getElementById('assessor-name').value = '';
  document.getElementById('forecast-confidence').value = 'high';

  // Clear NWS advisories
  document.querySelectorAll('input[name="advisory"]').forEach(cb => { cb.checked = false; });

  // Deactivate all hazard modes
  activeModes.clear();
  document.querySelectorAll('.hazard-tab').forEach(btn => {
    btn.setAttribute('aria-pressed', 'false');
    const mode = btn.dataset.mode;
    const section = document.getElementById(`inputs-${mode}`);
    if (section) section.hidden = true;
  });

  // Reset all hazard input selects and radios to first option
  document.querySelectorAll('.hazard-inputs select').forEach(sel => { sel.selectedIndex = 0; });
  document.querySelectorAll('.hazard-inputs input[type="radio"]').forEach(r => {
    r.checked = r.value === '0';
  });

  // Reset heat source to WBGT
  const wbgtRadio = document.getElementById('heat-source-wbgt');
  if (wbgtRadio) {
    wbgtRadio.checked = true;
    wbgtRadio.dispatchEvent(new Event('change'));
  }

  // Hide results
  const resultsPanel = document.getElementById('results-panel');
  resultsPanel.hidden = true;
  document.getElementById('results-content').innerHTML = '';

  // Hide error
  const errorEl = document.getElementById('calc-error');
  errorEl.hidden = true;
  errorEl.textContent = '';

  // Return focus to county
  document.getElementById('county').focus();
}

/* ═══════════════════════════════════════════════════════════
   6. DATA SOURCES PANEL TOGGLE
   ═══════════════════════════════════════════════════════════ */

function initDataSourcesPanel() {
  const btn   = document.getElementById('data-sources-btn');
  const panel = document.getElementById('data-sources-panel');
  if (!btn || !panel) return;

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  });
}

/* ═══════════════════════════════════════════════════════════
   7. LIVE CLOCK
   ═══════════════════════════════════════════════════════════ */

function updateClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/* ═══════════════════════════════════════════════════════════
   8. PDF EXPORT
   ═══════════════════════════════════════════════════════════ */

/**
 * Abbreviated one-sentence condition descriptions for the print report.
 * Keyed by mode → inputKey → rawScore value → string.
 */
function getAbbrConditionText(mode, key, rawScore, county, extra) {
  const c = countyName(county);
  if (mode === 'severe') {
    if (key === 'rain') {
      const label = rawScore === 33 ? '0.01–0.75"' : rawScore === 67 ? '0.75–1.5"' : '>1.5"';
      return `${label} of rain forecast — evaluate drainage, road ponding, and outdoor surface risk.`;
    }
    if (key === 'hail') return rawScore === 100
      ? 'Large hail (≥1") forecast — meets NWS Severe Thunderstorm Warning criteria; evaluate roof and vehicle exposure.'
      : 'Small hail (<1") forecast — evaluate outdoor equipment and roof exposure.';
    if (key === 'lightning') return 'Lightning forecast — no outdoor activity should proceed without an established safety and evacuation protocol.';
    if (key === 'windSust') {
      const label = { 25: '20–30 mph', 50: '30–40 mph', 75: '40–50 mph', 100: '>50 mph' }[rawScore];
      return `Sustained winds of ${label} — evaluate temporary structures, signage, and outdoor tenting.`;
    }
    if (key === 'windGust') {
      const label = { 25: '30–40 mph', 50: '40–50 mph', 75: '50–60 mph', 100: '>60 mph' }[rawScore];
      return `Gusts of ${label} — evaluate vehicle handling and structural resilience; gusts >58 mph meet High Wind Warning criteria.`;
    }
    if (key === 'flood') return 'Flash flooding possible — evaluate low-lying road routes, campus drainage, and parking lot risk.';
    if (key === 'tornado') return 'Tornado possible — verify shelter-in-place locations are accessible and evacuation routes are clear.';
  }
  if (mode === 'heat') {
    if (key === 'heatStress') {
      const measure = extra && extra.usedWBGT ? 'WBGT' : 'Heat Index';
      const level = { 33: 'moderate', 67: 'high', 100: 'extreme' }[rawScore];
      return `${measure} indicates ${level} heat stress — evaluate outdoor work schedules, athletic activity, and cooling station availability.`;
    }
    if (key === 'windSust') return 'Elevated wind speeds in heat context — above 30 mph, drying effect diminishes and sustained exposure risk remains high.';
  }
  if (mode === 'winter') {
    if (key === 'ice') {
      const label = { 33: 'trace–0.10"', 67: '0.10–0.25"', 100: '>0.25"' }[rawScore];
      const note = rawScore === 100 ? ' Exceeds NWS Ice Storm Warning threshold.' : rawScore === 67 ? ' Approaches NWS Ice Storm Warning threshold.' : '';
      return `Ice accumulation of ${label} forecast.${note} Evaluate sidewalk treatment schedules and parking lot access.`;
    }
    if (key === 'snow') {
      const label = { 33: '1–3"', 67: '3–6"', 100: '>6"' }[rawScore];
      return `Snow accumulation of ${label} forecast — evaluate snow removal capacity and early-morning campus access.`;
    }
    if (key === 'windChill') {
      const label = { 25: '20–32°F', 50: '10–20°F', 75: '0–10°F', 100: '<0°F' }[rawScore];
      const note = rawScore >= 75 ? ' Meets Wind Chill Warning threshold.' : rawScore === 50 ? ' Meets Wind Chill Advisory threshold.' : '';
      return `Wind chill of ${label} forecast.${note} Evaluate outdoor exposure duration for personnel and attendees.`;
    }
    if (key === 'windGust') {
      const label = { 25: '30–40 mph', 50: '40–50 mph', 75: '50–60 mph', 100: '>60 mph' }[rawScore];
      return `Gusts of ${label} in winter conditions — worsens wind chill and creates blowing snow visibility hazards.`;
    }
    if (key === 'freezeThaw') return 'Freeze-thaw cycle expected — primary black ice formation risk; evaluate treatment schedules, especially for morning refreezing.';
  }
  return '';
}

/**
 * Build abbreviated condition rows for a single hazard mode.
 * Returns array of { tag, level, text } — only inputs with rawScore > 0.
 */
function buildAbbrConditions(mode, rawInputs, county, extra) {
  const inputOrder = {
    severe: ['rain','hail','lightning','windSust','windGust','flood','tornado'],
    heat:   ['heatStress','windSust'],
    winter: ['ice','snow','windChill','windGust','freezeThaw'],
  };
  const tagLabels = {
    rain: 'Rain', hail: 'Hail', lightning: 'Lightning', windSust: 'Sustained Wind',
    windGust: 'Wind Gusts', flood: 'Flash Flood', tornado: 'Tornado Possible',
    heatStress: extra && extra.usedWBGT ? 'WBGT' : 'Heat Index',
    ice: 'Ice Accumulation', snow: 'Snow Accumulation', windChill: 'Wind Chill',
    freezeThaw: 'Freeze-Thaw Cycle',
  };

  const items = [];
  (inputOrder[mode] || []).forEach(key => {
    const val = rawInputs[key] || 0;
    if (val === 0) return;
    const text = getAbbrConditionText(mode, key, val, county, extra);
    if (!text) return;
    items.push({ tag: tagLabels[key] || key, level: scoreToLevel(val), text });
  });
  return items;
}

function handleExport() {
  // Gather form values
  const county      = document.getElementById('county').value || '';
  const assessDate  = document.getElementById('assessment-date').value || '—';
  const forecastPer = document.getElementById('forecast-period').value || '—';
  const assessor    = document.getElementById('assessor-name').value || '—';
  const confEl      = document.getElementById('forecast-confidence');
  const confShort   = confEl ? confEl.value : 'high';
  const confLabel   = { high: 'High Confidence', moderate: 'Moderate Confidence', low: 'Low Confidence' }[confShort] || confShort;
  const calcTime    = formatDateTime(new Date());
  const countyLabel = countyName(county);

  const checkedAdvisories = [...document.querySelectorAll('input[name="advisory"]:checked')]
    .map(el => el.value);

  const modeOrder = ['severe', 'heat', 'winter'];
  const modeConfig = {
    severe: { label: 'Severe Weather', icon: '⛈', calcFn: calcSevereScores },
    heat:   { label: 'Heat',           icon: '☀',  calcFn: calcHeatScores   },
    winter: { label: 'Winter Weather', icon: '❄',  calcFn: calcWinterScores },
  };
  const categories = [
    { key: 'campus',  label: 'Campus Operations' },
    { key: 'outdoor', label: 'Outdoor Activities' },
    { key: 'roads',   label: 'Roads & Travel'     },
  ];

  // Advisory bar
  const advisoryBarHTML = checkedAdvisories.length > 0 ? `
    <div class="rpt-advisory-bar">
      <span class="rpt-advisory-label">Active NWS Advisories</span>
      ${checkedAdvisories.map(a => `<span class="rpt-advisory-pill">${a}</span>`).join('')}
    </div>` : '';

  // Build mode sections
  let modeSectionsHTML = '';
  modeOrder.forEach(mode => {
    if (![...activeModes].includes(mode)) return;
    const cfg    = modeConfig[mode];
    const result = cfg.calcFn();
    const abbrConds = buildAbbrConditions(mode, result.rawInputs, county, result);

    const scoreCellsHTML = categories.map(cat => {
      const score   = result[cat.key];
      const level   = scoreToLevel(score);
      const label   = LEVEL_LABELS[level];
      const rec     = getRecommendation(level, cat.key);
      const subdued = cat.key === 'roads' && mode === 'heat';
      return `
        <div class="rpt-score-cell${subdued ? ' rpt-score-cell--subdued' : ''}">
          <div class="rpt-score-cat">${cat.label}</div>
          <div class="rpt-score-level-row">
            <div class="rpt-risk-bar rpt-risk-bar--${level}"></div>
            <div class="rpt-score-num-block">
              <div class="rpt-score-num">${score}</div>
              <div class="rpt-score-outof">/ 100</div>
            </div>
          </div>
          <div class="rpt-score-status">${label}</div>
          <div class="rpt-score-rec">${rec}</div>
          ${subdued ? '<div class="rpt-subdued-note">Heat has minimal direct road impact — score reflects indirect factors only.</div>' : ''}
        </div>`;
    }).join('');

    const condRowsHTML = abbrConds.length > 0 ? `
      <div class="rpt-conditions">
        <div class="rpt-conditions-heading">Contributing Factors</div>
        ${abbrConds.map(c => `
          <div class="rpt-condition-row">
            <div class="rpt-cond-indicator rpt-cond-indicator--${c.level}"></div>
            <div class="rpt-cond-tag">${c.tag}</div>
            <div class="rpt-cond-text">${c.text}</div>
          </div>`).join('')}
      </div>` : '';

    modeSectionsHTML += `
      <div class="rpt-mode-section">
        <div class="rpt-mode-header">
          <div class="rpt-mode-title">${cfg.icon} ${cfg.label}</div>
          <div class="rpt-mode-subtitle">Predictive Risk Assessment</div>
        </div>
        <div class="rpt-score-table">${scoreCellsHTML}</div>
        ${condRowsHTML}
      </div>`;
  });

  // All report styles inlined — completely self-contained, no dependency on styles.css
  const reportStyles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 8pt;
      color: #000;
      background: #fff;
      padding: 0.45in 0.5in 0.4in;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page { size: letter portrait; margin: 0; }

    /* Header */
    .rpt-header { display: flex; align-items: stretch; border-bottom: 3pt solid #000; margin-bottom: 7pt; padding-bottom: 6pt; }
    .rpt-header-logo { width: 6pt; background: #000; margin-right: 8pt; flex-shrink: 0; }
    .rpt-header-body { flex: 1; }
    .rpt-header-org { font-size: 6.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #555; margin-bottom: 1pt; }
    .rpt-header-title { font-size: 14pt; font-weight: 800; color: #000; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 2pt; }
    .rpt-header-sub { font-size: 7pt; color: #444; line-height: 1.5; }
    .rpt-header-meta { text-align: right; display: flex; flex-direction: column; justify-content: flex-end; gap: 2pt; min-width: 130pt; }
    .rpt-meta-row { font-size: 6.5pt; color: #555; line-height: 1.4; }
    .rpt-meta-row strong { color: #000; font-weight: 700; }
    .rpt-conf-badge { display: inline-block; font-size: 6pt; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 1pt 4pt; border: 1pt solid #000; border-radius: 2pt; margin-top: 3pt; }

    /* Info bar */
    .rpt-infobar { display: flex; align-items: stretch; border: 1pt solid #ccc; border-left: 3pt solid #000; margin-bottom: 7pt; background: #f8f8f8; }
    .rpt-infobar-cell { flex: 1; padding: 4pt 7pt; border-right: 1pt solid #ddd; }
    .rpt-infobar-cell:last-child { border-right: none; }
    .rpt-info-label { font-size: 5.5pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #777; margin-bottom: 1.5pt; }
    .rpt-info-value { font-size: 7.5pt; font-weight: 600; color: #000; line-height: 1.3; }

    /* Advisory bar */
    .rpt-advisory-bar { display: flex; align-items: baseline; gap: 5pt; border: 1pt solid #999; border-left: 3pt solid #000; background: #f0f0f0; padding: 3.5pt 7pt; margin-bottom: 7pt; flex-wrap: wrap; }
    .rpt-advisory-label { font-size: 6pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #333; white-space: nowrap; }
    .rpt-advisory-pill { font-size: 6.5pt; font-weight: 600; color: #000; background: #fff; border: 0.5pt solid #aaa; padding: 0.5pt 4pt; border-radius: 2pt; }

    /* Mode section */
    .rpt-mode-section { border: 1pt solid #ccc; margin-bottom: 6pt; page-break-inside: avoid; }
    .rpt-mode-header { display: flex; align-items: center; justify-content: space-between; background: #000; color: #fff; padding: 3.5pt 8pt; }
    .rpt-mode-title { font-size: 7.5pt; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #fff; }
    .rpt-mode-subtitle { font-size: 6pt; color: rgba(255,255,255,0.65); letter-spacing: 0.04em; }

    /* Score table */
    .rpt-score-table { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1pt solid #ddd; }
    .rpt-score-cell { padding: 6pt 8pt; border-right: 1pt solid #e8e8e8; }
    .rpt-score-cell:last-child { border-right: none; }
    .rpt-score-cell--subdued { background: #fafafa; opacity: 0.7; }
    .rpt-score-cat { font-size: 6pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #666; margin-bottom: 4pt; }
    .rpt-score-level-row { display: flex; align-items: center; gap: 4pt; margin-bottom: 3pt; }
    .rpt-risk-bar { width: 3pt; height: 22pt; border-radius: 1pt; flex-shrink: 0; }
    .rpt-risk-bar--green  { background: #2E7D32; }
    .rpt-risk-bar--yellow { background: #c8900a; }
    .rpt-risk-bar--amber  { background: #E65100; }
    .rpt-risk-bar--red    { background: #B71C1C; }
    .rpt-score-num-block { display: flex; flex-direction: column; }
    .rpt-score-num { font-size: 22pt; font-weight: 800; line-height: 1; color: #000; }
    .rpt-score-outof { font-size: 6pt; color: #888; }
    .rpt-score-status { font-size: 7.5pt; font-weight: 700; color: #000; margin-bottom: 3pt; }
    .rpt-score-rec { font-size: 6.5pt; color: #333; line-height: 1.4; border-top: 0.5pt solid #e0e0e0; padding-top: 3pt; margin-top: 1pt; }
    .rpt-subdued-note { font-size: 5.5pt; font-style: italic; color: #999; margin-top: 2pt; }

    /* Conditions */
    .rpt-conditions { padding: 4pt 8pt 5pt; }
    .rpt-conditions-heading { font-size: 5.5pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #888; margin-bottom: 3pt; border-bottom: 0.5pt solid #e8e8e8; padding-bottom: 2pt; }
    .rpt-condition-row { display: flex; align-items: baseline; gap: 5pt; padding: 2pt 0; border-bottom: 0.5pt solid #f0f0f0; }
    .rpt-condition-row:last-child { border-bottom: none; }
    .rpt-cond-indicator { width: 5pt; height: 5pt; border-radius: 50%; flex-shrink: 0; margin-top: 1pt; }
    .rpt-cond-indicator--green  { background: #2E7D32; }
    .rpt-cond-indicator--yellow { background: #c8900a; }
    .rpt-cond-indicator--amber  { background: #E65100; }
    .rpt-cond-indicator--red    { background: #B71C1C; }
    .rpt-cond-tag { font-size: 6pt; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; min-width: 80pt; color: #000; }
    .rpt-cond-text { font-size: 7pt; color: #222; line-height: 1.35; }

    /* Footer */
    .rpt-footer { margin-top: 6pt; padding-top: 5pt; border-top: 0.5pt solid #ccc; display: flex; justify-content: space-between; align-items: flex-start; gap: 12pt; }
    .rpt-disclaimer { font-size: 5.5pt; color: #666; line-height: 1.45; flex: 1; }
    .rpt-footer-right { font-size: 5.5pt; color: #999; text-align: right; white-space: nowrap; }
  `;

  // Full self-contained HTML document
  const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Weather Risk Assessment — ${countyLabel}</title>
  <style>${reportStyles}</style>
</head>
<body>
  <div class="rpt-header">
    <div class="rpt-header-logo"></div>
    <div class="rpt-header-body">
      <div class="rpt-header-org">Oklahoma State University — Office of Emergency Management</div>
      <div class="rpt-header-title">Weather Risk Assessment</div>
      <div class="rpt-header-sub">${countyLabel} &nbsp;&middot;&nbsp; Forecast Period: ${forecastPer}</div>
    </div>
    <div class="rpt-header-meta">
      <div class="rpt-meta-row">Date: <strong>${assessDate}</strong></div>
      <div class="rpt-meta-row">Assessor: <strong>${assessor}</strong></div>
      <div class="rpt-meta-row">Generated: <strong>${calcTime}</strong></div>
      <div class="rpt-meta-row"><span class="rpt-conf-badge">${confLabel}</span></div>
    </div>
  </div>

  <div class="rpt-infobar">
    <div class="rpt-infobar-cell"><div class="rpt-info-label">County</div><div class="rpt-info-value">${countyLabel}</div></div>
    <div class="rpt-infobar-cell"><div class="rpt-info-label">Assessment Date</div><div class="rpt-info-value">${assessDate}</div></div>
    <div class="rpt-infobar-cell"><div class="rpt-info-label">Forecast Period</div><div class="rpt-info-value">${forecastPer}</div></div>
    <div class="rpt-infobar-cell"><div class="rpt-info-label">Assessor</div><div class="rpt-info-value">${assessor}</div></div>
    <div class="rpt-infobar-cell"><div class="rpt-info-label">Confidence</div><div class="rpt-info-value">${confLabel}</div></div>
  </div>

  ${advisoryBarHTML}
  ${modeSectionsHTML}

  <div class="rpt-footer">
    <div class="rpt-disclaimer"><strong>Decision Support Only.</strong> This tool provides structured risk scores to inform human judgment. Scores are based on forecast inputs and do not constitute an official university policy, emergency directive, or operational order. Final authority rests with authorized Oklahoma State University leadership. Forecasts are subject to change — reassess as conditions evolve.</div>
    <div class="rpt-footer-right">WDST v2.0 &nbsp;|&nbsp; For Internal Use Only</div>
  </div>
</body>
</html>`;

  // Open in new window and print
  const printWin = window.open('', '_blank', 'width=850,height=1100');
  if (!printWin) {
    alert('Pop-up blocked. Please allow pop-ups for this page to export the report.');
    return;
  }
  printWin.document.open();
  printWin.document.write(fullHTML);
  printWin.document.close();

  // Wait for content to render before printing
  printWin.onload = () => {
    printWin.focus();
    printWin.print();
    printWin.onafterprint = () => printWin.close();
    // Fallback close if onafterprint doesn't fire
    setTimeout(() => { if (!printWin.closed) printWin.close(); }, 4000);
  };
}

/* ═══════════════════════════════════════════════════════════
   9. INIT
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // Set today's date as default
  const dateInput = document.getElementById('assessment-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Hazard mode tabs
  document.querySelectorAll('.hazard-tab').forEach(btn => {
    btn.addEventListener('click', () => toggleMode(btn.dataset.mode, btn));
  });

  // Heat source mutual exclusivity
  initHeatSourceToggle();

  // Calculate button
  const calcBtn = document.getElementById('calculate-btn');
  if (calcBtn) calcBtn.addEventListener('click', handleCalculate);

  // Export button (delegate — rendered dynamically)
  document.addEventListener('click', e => {
    if (e.target.id === 'export-btn') handleExport();
    if (e.target.id === 'reset-btn')  handleReset();
  });

  // Data sources panel
  initDataSourcesPanel();

  //In Beta Modal
  initBetaModal();
  
  // Live clock — update immediately, then every 30 seconds
  updateClock();
  setInterval(updateClock, 30000);
});
