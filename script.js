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
  const useWBGT = getHeatSourceSelection() === 'wbgt';
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
 if (forecastPer) {
  metaParts.push(`Forecast period: ${escapeHtml(forecastPer)}`);
}

if (assessor) {
  metaParts.push(`Assessor: ${escapeHtml(assessor)}`);
}
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
    if (!activeModes.has(mode)) return;
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

function getHeatSourceSelection() {
  const checked = document.querySelector('input[name="heat-source"]:checked');
  return checked ? checked.value : 'wbgt';
}

function setHeatSourceUI(useWBGT) {
  const wbgtGroup = document.getElementById('wbgt-field-group');
  const hiGroup   = document.getElementById('hi-field-group');
  const wbgtSel   = document.getElementById('heat-wbgt');
  const hiSel     = document.getElementById('heat-hi');

  if (wbgtSel) {
    wbgtSel.disabled = !useWBGT;
    wbgtSel.setAttribute('aria-disabled', String(!useWBGT));
  }
  if (hiSel) {
    hiSel.disabled = useWBGT;
    hiSel.setAttribute('aria-disabled', String(useWBGT));
  }
  if (wbgtGroup) wbgtGroup.style.opacity = useWBGT ? '1' : '0.4';
  if (hiGroup) hiGroup.style.opacity = useWBGT ? '0.4' : '1';
}

/**
 * Handle the WBGT / Heat Index mutual exclusivity toggle.
 */
function initHeatSourceToggle() {
  const radios = document.querySelectorAll('input[name="heat-source"]');

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      setHeatSourceUI(radio.value === 'wbgt');
    });
  });

  setHeatSourceUI(getHeatSourceSelection() === 'wbgt');
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

function handleExport() {
  // Force condition summary open for print
  const condBody = document.getElementById('condition-summary-body');
  const condBtn  = document.getElementById('condition-summary-btn');
  if (condBody) {
    condBody.hidden = false;
    if (condBtn) condBtn.setAttribute('aria-expanded', 'true');
  }
  window.print();
}

/* ═══════════════════════════════════════════════════════════
   9. INIT
   ═══════════════════════════════════════════════════════════ */
function initBetaModal() {
  const modal = document.getElementById('beta-modal');
  const closeBtn = document.getElementById('beta-modal-close');

  if (!modal || !closeBtn) return;

  closeBtn.focus();

  closeBtn.addEventListener('click', () => {
    modal.hidden = true;

    const countySelect = document.getElementById('county');
    if (countySelect) countySelect.focus();
  });
}

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
  initBetaModal();


  // Live clock — update immediately, then every 30 seconds
  updateClock();
  setInterval(updateClock, 30000);
});
