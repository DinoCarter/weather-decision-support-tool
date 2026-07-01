/**
 * Kestrel — script.js
 * Know before you go
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   1. LOCATIONS
   ═══════════════════════════════════════════════════════════ */

const LOCATIONS = {
  stillwater:         { name: 'Stillwater',            lat: 36.12581499621311,  lon: -97.06645384994434 },
  lakecarlblackwell:  { name: 'Lake Carl Blackwell',    lat: 36.130491704733885, lon: -97.2081247868443  },
  tulsa:              { name: 'Tulsa',                  lat: 36.13824970581936,  lon: -96.00554292132907 },
  tahlequah:          { name: 'Tahlequah',              lat: 35.91002640860136,  lon: -94.95092187900713 },
  okmulgee:           { name: 'Okmulgee',               lat: 35.62802890894432,  lon: -95.93902391148185 },
  okc:                { name: 'Oklahoma City',          lat: 35.47068894814791,  lon: -97.58216723809198 },
};

/**
 * Resolves a location select value to a { name, lat, lon } object.
 * Handles the "custom" option by reading the custom lat/lon fields directly,
 * since custom coordinates aren't present in LOCATIONS.
 */
function resolveLocation(locationKey) {
  if (locationKey === 'custom') {
    const lat = parseFloat(document.getElementById('custom-lat').value);
    const lon = parseFloat(document.getElementById('custom-lon').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { name: `Custom (${lat.toFixed(4)}, ${lon.toFixed(4)})`, lat, lon };
  }
  return LOCATIONS[locationKey] || null;
}

/* ═══════════════════════════════════════════════════════════
   2. SCORING ENGINE
   ═══════════════════════════════════════════════════════════ */

const WEIGHTS = {
  severe: {
    rain:      { facility: 15, outdoor: 20, roads: 20 },
    hail:      { facility: 15, outdoor: 15, roads: 15 },
    lightning: { facility:  5, outdoor: 20, roads:  5 },
    windSust:  { facility: 20, outdoor: 10, roads:  5 },
    windGust:  { facility: 20, outdoor: 10, roads: 15 },
    flood:     { facility:  5, outdoor:  5, roads: 20 },
    tornado:   { facility: 20, outdoor: 20, roads: 20 },
  },
  heat: {
    heatStress: { facility: 55, outdoor: 80, roads: 30 },
    windSust:   { facility: 45, outdoor: 20, roads: 20 },
  },
  winter: {
    ice:        { facility: 35, outdoor: 20, roads: 40 },
    snow:       { facility: 20, outdoor: 20, roads: 20 },
    windChill:  { facility: 15, outdoor: 45, roads:  5 },
    windGust:   { facility: 20, outdoor: 10, roads: 15 },
    freezeThaw: { facility: 10, outdoor: 5,  roads: 20 },
  },
};

function getRecommendation(level, category) {
  const recs = {
    green: {
      facility: 'No weather-based action needed. Continue standard monitoring.',
      outdoor:  'No weather-based action needed. Continue standard monitoring.',
      roads:    'No weather-based action needed. Continue standard monitoring.',
    },
    yellow: {
      facility: 'Increase monitoring. Begin contingency planning.',
      outdoor:  'Increase monitoring. Consider event modifications.',
      roads:    'Increase monitoring. Begin contingency planning.',
    },
    amber: {
      facility: 'Evaluate operational delays or modifications.',
      outdoor:  'Evaluate delays, modifications, or contingency activation.',
      roads:    'Evaluate travel restrictions or route modifications.',
    },
    red: {
      facility: 'Evaluate closure or emergency procedures. Immediate action may be required.',
      outdoor:  'Evaluate cancellation or emergency procedures. Immediate action may be required.',
      roads:    'Evaluate travel restriction or emergency procedures. Immediate action may be required.',
    },
  };
  return recs[level][category];
}

function scoreToLevel(score) {
  if (score < 25) return 'green';
  if (score < 50) return 'yellow';
  if (score < 75) return 'amber';
  return 'red';
}

const LEVEL_LABELS = {
  green:  'Normal Operations',
  yellow: 'Elevated Caution',
  amber:  'High Risk',
  red:    'Severe Risk',
};

function calcScoreByType(inputs, mode, type) {
  let total = 0;
  const modeWeights = WEIGHTS[mode];
  for (const key in modeWeights) {
    total += (inputs[key] || 0) * (modeWeights[key][type] || 0);
  }
  return Math.min(100, Math.max(0, Math.round(total / 100)));
}

function calcScoresFromInputs(inputs, mode) {
  return {
    facility:  calcScoreByType(inputs, mode, 'facility'),
    outdoor:   calcScoreByType(inputs, mode, 'outdoor'),
    roads:     calcScoreByType(inputs, mode, 'roads'),
    rawInputs: inputs,
  };
}

/* ═══════════════════════════════════════════════════════════
   3. MANUAL INPUT READERS
   ═══════════════════════════════════════════════════════════ */

function getSelectVal(id) {
  return parseInt(document.getElementById(id)?.value || '0', 10);
}

function getRadioVal(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? parseInt(checked.value, 10) : 0;
}

function calcManualSevere() {
  const inputs = {
    rain:      getSelectVal('sw-rain'),
    hail:      getSelectVal('sw-hail'),
    lightning: getRadioVal('sw-lightning'),
    windSust:  getSelectVal('sw-wind-sustained'),
    windGust:  getSelectVal('sw-wind-gust'),
    flood:     getRadioVal('sw-flood'),
    tornado:   getRadioVal('sw-tornado'),
  };
  return { ...calcScoresFromInputs(inputs, 'severe'), meta: null };
}

function calcManualHeat() {
  const useWBGT = document.querySelector('input[name="heat-source"]:checked')?.value === 'wbgt';
  const inputs = {
    heatStress: useWBGT ? getSelectVal('heat-wbgt') : getSelectVal('heat-hi'),
    windSust:   getSelectVal('heat-wind'),
  };
  return { ...calcScoresFromInputs(inputs, 'heat'), meta: null, usedWBGT: useWBGT };
}

function calcManualWinter() {
  const inputs = {
    ice:        getSelectVal('ww-ice'),
    snow:       getSelectVal('ww-snow'),
    windChill:  getSelectVal('ww-windchill'),
    windGust:   getSelectVal('ww-gust'),
    freezeThaw: getRadioVal('ww-freezethaw'),
  };
  return { ...calcScoresFromInputs(inputs, 'winter'), meta: null };
}

/* ═══════════════════════════════════════════════════════════
   4. NWS API LAYER
   ═══════════════════════════════════════════════════════════ */

async function nwsFetch(url) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/geo+json,application/json' },
  });
  if (!res.ok) throw new Error(`NWS API returned ${res.status} for ${url}`);
  return res.json();
}

async function fetchNWSData(loc, windowStart, windowEnd) {
  const pointsData = await nwsFetch(
    `https://api.weather.gov/points/${loc.lat},${loc.lon}`
  );
  const { forecastHourly, forecastGridData, forecastZone } = pointsData.properties;
  const zoneId = forecastZone.split('/').pop();

  const [hourlyData, gridData, alertsData] = await Promise.all([
    nwsFetch(forecastHourly),
    nwsFetch(forecastGridData),
    nwsFetch(`https://api.weather.gov/alerts/active?zone=${zoneId}`),
  ]);

  const allPeriods = hourlyData.properties.periods || [];
  let periods = allPeriods.filter(p => {
    const t = new Date(p.startTime);
    return t >= windowStart && t < windowEnd;
  });

  if (periods.length === 0 || new Date(periods[0].startTime) > windowStart) {
    const straddling = allPeriods.find(p =>
      new Date(p.startTime) <= windowStart && new Date(p.endTime) > windowStart
    );
    if (straddling && !periods.includes(straddling)) periods.unshift(straddling);
  }

  return {
    periods,
    gridProps: gridData.properties,
    alerts: alertsData.features || [],
    zoneId,
    locationName: loc.name,
  };
}

/* ═══════════════════════════════════════════════════════════
   5. UNIT HELPERS
   ═══════════════════════════════════════════════════════════ */

function toInches(value, unitCode) {
  if (!unitCode) return value;
  if (unitCode.includes('mm')) return value / 25.4;
  if (unitCode.includes('m') && !unitCode.includes('mph') && !unitCode.includes('km') && !unitCode.includes('degC')) return value * 39.3701;
  return value;
}

function toMph(value, unitCode) {
  if (!unitCode || value == null) return 0;
  if (unitCode.includes('km_h') || unitCode.includes('km/h')) return value / 1.60934;
  if (unitCode.includes('kt') || unitCode.includes('knot'))   return value * 1.15078;
  if (unitCode.includes('m_s') || unitCode.includes('m/s'))   return value * 2.23694;
  return value;
}

function toDegF(value, unitCode) {
  if (!unitCode || value == null) return null;
  if (unitCode.includes('degC') || unitCode.includes('Cel')) return value * 9 / 5 + 32;
  return value;
}

function parseDurationMs(durationStr) {
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 3600000;
  return (parseInt(match[1] || '0', 10) * 60 + parseInt(match[2] || '0', 10)) * 60000;
}

function gridValuesInWindow(gridValues, windowStart, windowEnd) {
  if (!Array.isArray(gridValues)) return [];
  return gridValues.filter(({ validTime }) => {
    const [startStr, durationStr] = validTime.split('/');
    const start = new Date(startStr);
    const end   = new Date(start.getTime() + parseDurationMs(durationStr));
    return start < windowEnd && end > windowStart;
  });
}

function sumGrid(gridValues, unitCode, windowStart, windowEnd, converter) {
  let total = 0;
  for (const { validTime, value } of gridValuesInWindow(gridValues, windowStart, windowEnd)) {
    if (value == null) continue;
    const [startStr, durationStr] = validTime.split('/');
    const start = new Date(startStr);
    const durationMs = parseDurationMs(durationStr);
    const end = new Date(start.getTime() + durationMs);
    const overlapMs = Math.min(end, windowEnd) - Math.max(start, windowStart);
    total += converter(value, unitCode) * (overlapMs / durationMs);
  }
  return total;
}

function maxGrid(gridValues, unitCode, windowStart, windowEnd, converter) {
  let max = null;
  for (const { value } of gridValuesInWindow(gridValues, windowStart, windowEnd)) {
    if (value == null) continue;
    const v = converter(value, unitCode);
    if (max === null || v > max) max = v;
  }
  return max;
}

function minGrid(gridValues, unitCode, windowStart, windowEnd, converter) {
  let min = null;
  for (const { value } of gridValuesInWindow(gridValues, windowStart, windowEnd)) {
    if (value == null) continue;
    const v = converter(value, unitCode);
    if (min === null || v < min) min = v;
  }
  return min;
}

function parseWindSpeedStr(str) {
  if (!str || str.toLowerCase() === 'calm') return 0;
  const nums = str.match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : 0;
}

function calcHeatIndex(tempF, rh) {
  if (tempF < 80 || rh == null) return tempF;
  const T = tempF, RH = rh;
  let HI = -42.379 + 2.04901523*T + 10.14333127*RH - 0.22475541*T*RH
    - 0.00683783*T*T - 0.05481717*RH*RH + 0.00122874*T*T*RH
    + 0.00085282*T*RH*RH - 0.00000199*T*T*RH*RH;
  if (RH < 13 && T > 80 && T < 112) HI -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  if (RH > 85 && T > 80 && T < 87)  HI += ((RH - 85) / 10) * ((87 - T) / 5);
  return Math.round(HI);
}

/* ═══════════════════════════════════════════════════════════
   6. NWS → SCORE INPUTS MAPPER
   ═══════════════════════════════════════════════════════════ */

function alertMatches(alerts, ...keywords) {
  return alerts.some(a => {
    const text = ((a.properties?.event || '') + ' ' + (a.properties?.description || '')).toLowerCase();
    return keywords.some(kw => text.includes(kw.toLowerCase()));
  });
}

function mapNWSToSevere(nwsData, windowStart, windowEnd) {
  const { periods, gridProps, alerts } = nwsData;
  const wsUOM = gridProps.windSpeed?.uom  || 'wmoUnit:km_h-1';
  const wgUOM = gridProps.windGust?.uom   || 'wmoUnit:km_h-1';
  const qpfUOM = gridProps.quantitativePrecipitation?.uom || 'wmoUnit:mm';

  const qpfIn       = sumGrid(gridProps.quantitativePrecipitation?.values, qpfUOM, windowStart, windowEnd, toInches);
  const maxWindSust  = maxGrid(gridProps.windSpeed?.values, wsUOM, windowStart, windowEnd, toMph)
    ?? Math.max(0, ...periods.map(p => parseWindSpeedStr(p.windSpeed)));
  const maxWindGust  = maxGrid(gridProps.windGust?.values, wgUOM, windowStart, windowEnd, toMph)
    ?? Math.max(0, ...periods.map(p => parseWindSpeedStr(p.windGust || '0')));

  const maxThunder = maxGrid(gridProps.probabilityOfThunder?.values, null, windowStart, windowEnd, v => v) ?? 0;
  const hasThunderText = periods.some(p => (p.shortForecast || '').toLowerCase().includes('thunder'));
  const hasLightning   = maxThunder > 20 || hasThunderText || alertMatches(alerts, 'Thunderstorm');
  const hasFlood       = alertMatches(alerts, 'Flash Flood');
  const hasTornado     = alertMatches(alerts, 'Tornado');
  const hasSevereTS    = alertMatches(alerts, 'Severe Thunderstorm');

  const hailScore = (() => {
    if (!hasSevereTS && !hasLightning) return 0;
    const txt = alerts.map(a => (a.properties?.description || '') + ' ' + (a.properties?.headline || '')).join(' ');
    if (/\b[1-9]\d*(\.\d+)?\s*(inch|in\b|")/i.test(txt)) return 100;
    if (/\bhail\b/i.test(txt)) return 50;
    return hasSevereTS ? 50 : 0;
  })();

  const inputs = {
    rain:      qpfIn > 1.5 ? 100 : qpfIn > 0.75 ? 67 : qpfIn > 0.01 ? 33 : 0,
    hail:      hailScore,
    lightning: hasLightning ? 100 : 0,
    windSust:  maxWindSust >= 50 ? 100 : maxWindSust >= 40 ? 75 : maxWindSust >= 30 ? 50 : maxWindSust >= 20 ? 25 : 0,
    windGust:  maxWindGust >= 60 ? 100 : maxWindGust >= 50 ? 75 : maxWindGust >= 40 ? 50 : maxWindGust >= 30 ? 25 : 0,
    flood:     hasFlood   ? 100 : 0,
    tornado:   hasTornado ? 100 : 0,
  };

  return {
    ...calcScoresFromInputs(inputs, 'severe'),
    meta: { qpfIn: Math.round(qpfIn * 100) / 100, maxWindSust: Math.round(maxWindSust), maxWindGust: Math.round(maxWindGust), maxThunderPct: Math.round(maxThunder), hasLightning, hasFlood, hasTornado },
  };
}

function mapNWSToHeat(nwsData, windowStart, windowEnd) {
  const { periods, gridProps } = nwsData;
  const wsUOM   = gridProps.windSpeed?.uom || 'wmoUnit:km_h-1';
  const tempUOM = gridProps.temperature?.uom || 'wmoUnit:degC';

  // Prefer WBGT directly from NWS; fall back to NWS heatIndex
  const wbgtRaw = gridProps.wetBulbGlobeTemperature;
  const hiRaw   = gridProps.heatIndex;
  const wbgtInWindow = gridValuesInWindow(wbgtRaw?.values || [], windowStart, windowEnd);
  const usingWBGT    = wbgtInWindow.length > 0;

  const maxHeatStressF = usingWBGT
    ? maxGrid(wbgtRaw.values, wbgtRaw.uom, windowStart, windowEnd, toDegF)
    : maxGrid(hiRaw?.values, hiRaw?.uom || 'wmoUnit:degC', windowStart, windowEnd, toDegF);

  // WBGT thresholds match manual mode: <82=0, 82–87=33, 87–90=67, ≥90=100
  // Heat Index thresholds: <90=0, 90–100=33, 100–108=67, >108=100
  const heatStressScore = maxHeatStressF == null ? 0 : usingWBGT
    ? (maxHeatStressF >= 90 ? 100 : maxHeatStressF >= 87 ? 67 : maxHeatStressF >= 82 ? 33 : 0)
    : (maxHeatStressF >  108 ? 100 : maxHeatStressF >= 100 ? 67 : maxHeatStressF >= 90 ? 33 : 0);

  const maxWindSust = maxGrid(gridProps.windSpeed?.values, wsUOM, windowStart, windowEnd, toMph)
    ?? Math.max(0, ...periods.map(p => parseWindSpeedStr(p.windSpeed)));

  const maxTempF = maxGrid(gridProps.temperature?.values, tempUOM, windowStart, windowEnd, toDegF);
  const minTempF = minGrid(gridProps.temperature?.values, tempUOM, windowStart, windowEnd, toDegF);

  const inputs = {
    heatStress: heatStressScore,
    windSust:   maxWindSust >= 40 ? 75 : maxWindSust >= 30 ? 50 : maxWindSust >= 20 ? 25 : 0,
  };

  return {
    ...calcScoresFromInputs(inputs, 'heat'),
    meta: {
      maxHeatStressF: maxHeatStressF != null ? Math.round(maxHeatStressF) : null,
      usingWBGT,
      maxTempF: maxTempF != null ? Math.round(maxTempF) : null,
      minTempF: minTempF != null ? Math.round(minTempF) : null,
      maxWindSust: Math.round(maxWindSust),
    },
  };
}

function mapNWSToWinter(nwsData, windowStart, windowEnd) {
  const { gridProps } = nwsData;
  const iceUOM  = gridProps.iceAccumulation?.uom  || 'wmoUnit:in';
  const snowUOM = gridProps.snowfallAmount?.uom    || 'wmoUnit:in';
  const wcUOM   = gridProps.windChill?.uom         || 'wmoUnit:degC';
  const wgUOM   = gridProps.windGust?.uom          || 'wmoUnit:km_h-1';
  const tempUOM = gridProps.temperature?.uom       || 'wmoUnit:degC';

  const iceIn  = sumGrid(gridProps.iceAccumulation?.values, iceUOM, windowStart, windowEnd, toInches);
  const snowIn = sumGrid(gridProps.snowfallAmount?.values, snowUOM, windowStart, windowEnd, toInches);
  const minWCF = minGrid(gridProps.windChill?.values, wcUOM, windowStart, windowEnd, toDegF);
  const maxGust = maxGrid(gridProps.windGust?.values, wgUOM, windowStart, windowEnd, toMph);

  const freezeThaw = (() => {
    const temps = gridValuesInWindow(gridProps.temperature?.values || [], windowStart, windowEnd)
      .map(({ value }) => toDegF(value, tempUOM));
    return (temps.some(t => t > 32) && temps.some(t => t < 32)) ? 100 : 0;
  })();

  const inputs = {
    ice:        iceIn >= 0.25 ? 100 : iceIn >= 0.10 ? 67 : iceIn > 0 ? 33 : 0,
    snow:       snowIn >= 6 ? 100 : snowIn >= 3 ? 67 : snowIn >= 1 ? 33 : 0,
    windChill:  minWCF == null ? 0 : minWCF < 0 ? 100 : minWCF < 10 ? 75 : minWCF < 20 ? 50 : minWCF < 32 ? 25 : 0,
    windGust:   maxGust == null ? 0 : maxGust >= 60 ? 100 : maxGust >= 50 ? 75 : maxGust >= 40 ? 50 : maxGust >= 30 ? 25 : 0,
    freezeThaw,
  };

  return {
    ...calcScoresFromInputs(inputs, 'winter'),
    meta: { iceIn: Math.round(iceIn * 100) / 100, snowIn: Math.round(snowIn * 100) / 100, minWCF: minWCF != null ? Math.round(minWCF) : null, maxGust: maxGust != null ? Math.round(maxGust) : null, freezeThaw: freezeThaw > 0 },
  };
}

/* ═══════════════════════════════════════════════════════════
   7. CONDITION SUMMARY ENGINE
   ═══════════════════════════════════════════════════════════ */

function buildConditionSummary(mode, rawInputs, locationName, result) {
  const items = [];
  const loc  = locationName;
  const meta = result?.meta || null; // null in manual mode

  if (mode === 'severe') {
    if (rawInputs.rain > 0) {
      const label = rawInputs.rain === 33 ? '0.01–0.75"' : rawInputs.rain === 67 ? '0.75–1.5"' : '>1.5"';
      const detail = meta ? ` NWS QPF: ${meta.qpfIn}".` : '';
      items.push({ tag: 'RAIN ACCUMULATION', level: scoreToLevel(rawInputs.rain),
        text: `Forecast precipitation of ${label} for ${loc}.${detail} Evaluate outdoor event surfaces, drainage around site infrastructure, and road ponding risk.` });
    }
    if (rawInputs.hail > 0) {
      const label = rawInputs.hail === 100 ? 'Large hail (≥1" diameter)' : 'Hail potential — Severe Thunderstorm alert or forecast';
      items.push({ tag: 'HAIL', level: scoreToLevel(rawInputs.hail),
        text: `${label} indicated for ${loc}. Evaluate roof, vehicle, and outdoor equipment exposure.` });
    }
    if (rawInputs.lightning > 0) {
      const detail = meta?.maxThunderPct > 0 ? ` NWS probability of thunder: ${meta.maxThunderPct}%.` : '';
      items.push({ tag: 'LIGHTNING', level: 'red',
        text: `Lightning is forecast during the assessment period for ${loc}.${detail} Outdoor activities should not proceed without an established lightning safety protocol and evacuation plan.` });
    }
    if (rawInputs.windSust > 0) {
      const labels = { 25: '20–30 mph', 50: '30–40 mph', 75: '40–50 mph', 100: '>50 mph' };
      const detail = meta ? ` (NWS max: ${meta.maxWindSust} mph)` : '';
      items.push({ tag: 'SUSTAINED WIND', level: scoreToLevel(rawInputs.windSust),
        text: `Sustained winds of ${labels[rawInputs.windSust]}${detail} forecast for ${loc}. Evaluate temporary structures, outdoor signage, and event tenting.` });
    }
    if (rawInputs.windGust > 0) {
      const labels = { 25: '30–40 mph', 50: '40–50 mph', 75: '50–60 mph', 100: '>60 mph' };
      const detail = meta ? ` (NWS max: ${meta.maxWindGust} mph)` : '';
      items.push({ tag: 'WIND GUSTS', level: scoreToLevel(rawInputs.windGust),
        text: `Maximum gusts of ${labels[rawInputs.windGust]}${detail} forecast for ${loc}. Gusts above 58 mph meet NWS High Wind Warning criteria.` });
    }
    if (rawInputs.flood > 0) items.push({ tag: 'FLASH FLOOD', level: 'red',
      text: `Flash flooding is possible for ${loc}. Evaluate road closures on low-lying routes, site drainage infrastructure, and parking lot flood risk.` });
    if (rawInputs.tornado > 0) items.push({ tag: 'TORNADO POSSIBLE', level: 'red',
      text: `Tornado occurrence is possible for ${loc}. Verify shelter-in-place locations are accessible and all facility areas have a clear evacuation route to interior spaces.` });
  }

  if (mode === 'heat') {
    if (rawInputs.heatStress > 0) {
      const isAPI = meta != null;
      const measureLabel = isAPI ? (meta.usingWBGT ? 'WBGT' : 'Heat Index') : (result?.usedWBGT ? 'WBGT' : 'Heat Index');
      const measure = measureLabel;
      const levels  = { 33: 'moderate heat stress', 67: 'high heat stress', 100: 'extreme heat stress' };
      const detail  = meta ? ` (NWS peak ${measureLabel}: ${meta.maxHeatStressF}°F, high temp: ${meta.maxTempF}°F)` : '';
      const threshold = (isAPI ? meta.usingWBGT : result?.usedWBGT)
        ? 'A WBGT ≥82°F meets the threshold for activity modification under most athletic and occupational heat protocols.'
        : 'A Heat Index ≥90°F meets the NWS Heat Advisory threshold.';
      items.push({ tag: measure, level: scoreToLevel(rawInputs.heatStress),
        text: `Forecast ${measure} indicates ${levels[rawInputs.heatStress]} conditions${detail} for ${loc}. ${threshold} Evaluate outdoor work schedules, athletic activity, and cooling station availability.` });
    }
    if (rawInputs.windSust > 0) {
      const detail = meta ? ` (NWS: ${meta.maxWindSust} mph)` : '';
      items.push({ tag: 'WIND (HEAT CONTEXT)', level: scoreToLevel(rawInputs.windSust),
        text: `Elevated sustained winds${detail} are forecast. Above 30 mph, the cooling benefit of wind diminishes and sustained heat exposure risk remains elevated.` });
    }
  }

  if (mode === 'winter') {
    if (rawInputs.ice > 0) {
      const labels = { 33: 'trace to 0.10"', 67: '0.10–0.25"', 100: '>0.25"' };
      const detail = meta ? ` NWS forecast: ${meta.iceIn}".` : '';
      const note   = rawInputs.ice === 100 ? ' Exceeds NWS Ice Storm Warning threshold (≥0.25").' : rawInputs.ice === 67 ? ' Approaches NWS Ice Storm Warning threshold.' : '';
      items.push({ tag: 'ICE ACCUMULATION', level: scoreToLevel(rawInputs.ice),
        text: `Ice accumulation of ${labels[rawInputs.ice]} forecast for ${loc}.${detail}${note} Evaluate sidewalk treatment schedules, parking lot access, and early operational changes.` });
    }
    if (rawInputs.snow > 0) {
      const labels = { 33: '1–3"', 67: '3–6"', 100: '>6"' };
      const detail = meta ? ` NWS forecast: ${meta.snowIn}".` : '';
      items.push({ tag: 'SNOW ACCUMULATION', level: scoreToLevel(rawInputs.snow),
        text: `Snow accumulation of ${labels[rawInputs.snow]} forecast for ${loc}.${detail} Evaluate snow removal capacity, parking lot and walkway clearance timing, and impact on early-morning site access.` });
    }
    if (rawInputs.windChill > 0) {
      const labels = { 25: '20–32°F', 50: '10–20°F', 75: '0–10°F', 100: '<0°F' };
      const detail = meta?.minWCF != null ? ` NWS min: ${meta.minWCF}°F.` : '';
      const note   = rawInputs.windChill >= 75 ? ' Meets NWS Wind Chill Warning threshold (<0°F).' : rawInputs.windChill === 50 ? ' Meets NWS Wind Chill Advisory threshold (<20°F).' : '';
      items.push({ tag: 'WIND CHILL', level: scoreToLevel(rawInputs.windChill),
        text: `Wind chill values of ${labels[rawInputs.windChill]} forecast for ${loc}.${detail}${note} Evaluate outdoor exposure duration for personnel and event attendees.` });
    }
    if (rawInputs.windGust > 0) {
      const labels = { 25: '30–40 mph', 50: '40–50 mph', 75: '50–60 mph', 100: '>60 mph' };
      const detail = meta?.maxGust != null ? ` (NWS: ${meta.maxGust} mph)` : '';
      items.push({ tag: 'WIND GUSTS', level: scoreToLevel(rawInputs.windGust),
        text: `Maximum gusts of ${labels[rawInputs.windGust]}${detail} forecast for ${loc}. In winter conditions, gusts worsen wind chill and create blowing snow hazards.` });
    }
    if (rawInputs.freezeThaw > 0) items.push({ tag: 'FREEZE-THAW CYCLE', level: scoreToLevel(rawInputs.freezeThaw),
      text: `Temperatures are expected to cross 32°F in both directions during the forecast period for ${loc}. This is a primary black ice formation mechanism. Evaluate treatment schedules, especially for morning refreezing.` });
  }

  if (items.length === 0) items.push({ tag: 'ALL CLEAR', level: 'green',
    text: 'No inputs are contributing to an elevated score for this hazard mode. Continue standard weather monitoring protocols.' });

  return items;
}

/* ═══════════════════════════════════════════════════════════
   8. NWS DATA DISPLAY
   ═══════════════════════════════════════════════════════════ */

function getAlertClass(event) {
  const e = event.toLowerCase();
  if (e.includes('warning') || e.includes('emergency')) return 'alert-pill--warning';
  if (e.includes('watch'))    return 'alert-pill--watch';
  if (e.includes('advisory')) return 'alert-pill--advisory';
  return 'alert-pill--statement';
}

function renderNWSSection(nwsData, windowStart, windowEnd, activeModes, modeResults) {
  const { periods, alerts, locationName } = nwsData;

  const alertsHTML = alerts.length > 0
    ? `<div class="nws-alerts">
        <div class="nws-subsection-label">Active NWS Alerts</div>
        <div class="alert-pills">${alerts.map(a => `<span class="alert-pill ${getAlertClass(a.properties?.event || '')}">${a.properties?.event || 'Alert'}</span>`).join('')}</div>
        ${alerts.map(a => a.properties?.headline ? `<div class="alert-headline">${a.properties.headline}</div>` : '').join('')}
      </div>`
    : `<div class="nws-alerts nws-alerts--none">
        <div class="nws-subsection-label">Active NWS Alerts</div>
        <span class="no-alerts-note">No active alerts for this zone.</span>
      </div>`;

  const metricRows = [];
  if (activeModes.includes('severe') && modeResults.severe?.meta) {
    const m = modeResults.severe.meta;
    metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">QPF (Rain)</span><span class="nws-metric-value">${m.qpfIn}"</span></div>`);
    metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">Max Sust. Wind</span><span class="nws-metric-value">${m.maxWindSust} mph</span></div>`);
    metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">Max Gust</span><span class="nws-metric-value">${m.maxWindGust} mph</span></div>`);
    if (m.maxThunderPct > 0) metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">Prob. Thunder</span><span class="nws-metric-value">${m.maxThunderPct}%</span></div>`);
  }
  if (activeModes.includes('heat') && modeResults.heat?.meta) {
    const m = modeResults.heat.meta;
    if (m.maxTempF != null) metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">High Temp</span><span class="nws-metric-value">${m.maxTempF}°F</span></div>`);
    if (m.minTempF != null) metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">Low Temp</span><span class="nws-metric-value">${m.minTempF}°F</span></div>`);
    const heatLabel = m.usingWBGT ? 'Peak WBGT' : 'Peak Heat Index';
    if (m.maxHeatStressF != null) metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">${heatLabel}</span><span class="nws-metric-value">${m.maxHeatStressF}°F</span></div>`);
  }
  if (activeModes.includes('winter') && modeResults.winter?.meta) {
    const m = modeResults.winter.meta;
    metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">Ice Accum.</span><span class="nws-metric-value">${m.iceIn}"</span></div>`);
    metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">Snow Accum.</span><span class="nws-metric-value">${m.snowIn}"</span></div>`);
    if (m.minWCF != null) metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">Min Wind Chill</span><span class="nws-metric-value">${m.minWCF}°F</span></div>`);
    if (m.maxGust != null) metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">Max Gust</span><span class="nws-metric-value">${m.maxGust} mph</span></div>`);
    metricRows.push(`<div class="nws-metric"><span class="nws-metric-label">Freeze-Thaw</span><span class="nws-metric-value">${m.freezeThaw ? 'Yes' : 'No'}</span></div>`);
  }

  const visiblePeriods = periods.slice(0, 12);
  const hourlyHTML = visiblePeriods.length
    ? `<div class="nws-subsection-label" style="margin-top:12px;">Hourly Conditions</div>
       <div class="nws-hourly-table" role="table" aria-label="Hourly forecast">
         <div class="nws-hourly-header" role="row">
           <span role="columnheader">Time</span><span role="columnheader">Temp</span>
           <span role="columnheader">Wind</span><span role="columnheader">Precip %</span>
           <span role="columnheader">Humidity</span><span role="columnheader">Conditions</span>
         </div>
         ${visiblePeriods.map(p => {
           const t = new Date(p.startTime);
           const precip = p.probabilityOfPrecipitation?.value;
           const rh = p.relativeHumidity?.value;
           const gust = p.windGust && p.windGust !== 'null' ? ` / ${p.windGust} gust` : '';
           return `<div class="nws-hourly-row" role="row">
             <span role="cell" class="nws-time">${formatTime(t)}</span>
             <span role="cell">${p.temperature}°${p.temperatureUnit || 'F'}</span>
             <span role="cell">${p.windSpeed}${gust}</span>
             <span role="cell">${precip != null ? precip + '%' : '—'}</span>
             <span role="cell">${rh != null ? rh + '%' : '—'}</span>
             <span role="cell" class="nws-forecast-text">${p.shortForecast}</span>
           </div>`;
         }).join('')}
       </div>`
    : '<p class="nws-no-data">No hourly forecast data available for this window.</p>';

  return `
    <div class="nws-data-section">
      <div class="nws-data-header">
        <span class="nws-data-title">NWS Weather Data</span>
        <span class="nws-data-location">${locationName} &nbsp;·&nbsp; ${formatDateTime(windowStart)} – ${formatDateTime(windowEnd)}</span>
      </div>
      <div class="nws-data-body">
        ${alertsHTML}
        ${metricRows.length ? `<div class="nws-subsection-label" style="margin-top:12px;">Key Metrics</div><div class="nws-metrics-grid">${metricRows.join('')}</div>` : ''}
        ${hourlyHTML}
        <p class="nws-attribution">Data sourced from the <strong>National Weather Service API</strong> (api.weather.gov). Retrieved ${formatDateTime(new Date())}.</p>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   9. RESULTS RENDERER
   ═══════════════════════════════════════════════════════════ */

function renderResults(activeModes, modeResults, nwsData, windowStart, windowEnd) {
  const locationKey  = document.getElementById('location').value;
  const locationName = resolveLocation(locationKey)?.name || locationKey;
  const assessor     = document.getElementById('assessor-name').value;
  const jobTitle     = document.getElementById('assessor-title').value;
  const isAPI        = nwsData != null;

  const metaParts = [locationName];
  if (assessor) metaParts.push(`Assessor: ${assessor}`);
  if (jobTitle) metaParts.push(jobTitle);
  if (windowStart) metaParts.push(`${formatDateTime(windowStart)} – ${formatDateTime(windowEnd)}`);
  metaParts.push(`Generated: ${formatDateTime(new Date())}`);

  let html = `
    <div class="results-header">
      <div class="results-header-top">
        <div>
          <div class="results-title">Risk Assessment — ${locationName}</div>
          <div class="results-meta">${metaParts.join(' &nbsp;·&nbsp; ')}</div>
        </div>
        <span class="data-source-badge data-source-badge--${isAPI ? 'api' : 'manual'}">${isAPI ? 'NWS API' : 'Manual Entry'}</span>
      </div>
    </div>`;

  if (isAPI) html += renderNWSSection(nwsData, windowStart, windowEnd, activeModes, modeResults);

  const modeOrder  = ['severe', 'heat', 'winter'];
  const modeConfig = {
    severe: { label: '⛈ Severe Weather', cssClass: 'severe' },
    heat:   { label: '☀ Heat',            cssClass: 'heat'   },
    winter: { label: '❄ Winter Weather',  cssClass: 'winter' },
  };

  const allConditionItems = [];
  modeOrder.forEach(mode => {
    if (!activeModes.includes(mode)) return;
    const cfg    = modeConfig[mode];
    const result = modeResults[mode];

    html += `
      <div class="mode-results-block">
        <div class="mode-results-label mode-results-label--${cfg.cssClass}">${cfg.label}</div>
        <div class="score-cards">
          ${[
            { key: 'facility', label: 'Facility Operations', score: result.facility },
            { key: 'outdoor',  label: 'Outdoor Activities',  score: result.outdoor },
            { key: 'roads',    label: 'Roads & Travel',      score: result.roads, note: mode === 'heat' },
          ].map(cat => renderScoreCard(cat, mode)).join('')}
        </div>
      </div>`;

    buildConditionSummary(mode, result.rawInputs, locationName, result)
      .forEach(item => allConditionItems.push({ ...item, mode: cfg.label }));
  });

  html += `
    <div class="condition-summary-wrapper">
      <button type="button" class="condition-summary-toggle" aria-expanded="false" aria-controls="condition-summary-body" id="condition-summary-btn">
        <span>Condition Summary <span style="color:var(--k-text-secondary);font-weight:400;font-size:0.8em;">(${allConditionItems.length} contributing factor${allConditionItems.length !== 1 ? 's' : ''})</span></span>
        <span class="condition-toggle-icon" aria-hidden="true">▾</span>
      </button>
      <div id="condition-summary-body" class="condition-summary-body" hidden>
        ${allConditionItems.map(item => `
          <div class="condition-item condition-item--${item.level}">
            <span class="condition-tag condition-tag--${item.level}">${item.tag}</span>
            <span class="condition-text">${item.text}</span>
          </div>`).join('')}
      </div>
    </div>`;

  document.getElementById('results-content').innerHTML = html;

  const condBtn  = document.getElementById('condition-summary-btn');
  const condBody = document.getElementById('condition-summary-body');
  if (condBtn && condBody) {
    condBtn.addEventListener('click', () => {
      const expanded = condBtn.getAttribute('aria-expanded') === 'true';
      condBtn.setAttribute('aria-expanded', String(!expanded));
      condBody.hidden = expanded;
    });
  }
}

function renderScoreCard({ key, label, score, note }, mode) {
  const level = scoreToLevel(score);
  const showNote = note && mode === 'heat';
  return `
    <div class="score-card">
      <span class="sr-only">${label}: ${LEVEL_LABELS[level]}, score ${score} out of 100. ${getRecommendation(level, key)}</span>
      <div class="score-card-category" aria-hidden="true">${label}</div>
      <div class="score-card-main" aria-hidden="true">
        <span class="stoplight-dot stoplight-dot--${level}" aria-hidden="true"></span>
        <span class="score-status score-status--${level}">${LEVEL_LABELS[level]}</span>
      </div>
      <div class="score-number score-number--${level}" aria-hidden="true">${score}</div>
      <div class="score-out-of" aria-hidden="true">out of 100</div>
      <div class="score-recommendation" aria-hidden="true">${getRecommendation(level, key)}</div>
      ${showNote ? '<div class="score-subdued-label">Heat has minimal direct impact on road conditions. Score reflects indirect factors only.</div>' : ''}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   10. UI BEHAVIOR
   ═══════════════════════════════════════════════════════════ */

const THEME_KEY = 'kestrel-theme';

function getPreferredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) {}
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.setAttribute('aria-checked', String(theme === 'dark'));
}

// Applied immediately (outside DOMContentLoaded) so the page never flashes the wrong theme.
applyTheme(getPreferredTheme());

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
  });
}

const activeModes = new Set();
let inputMode = 'api'; // 'api' | 'manual'

function toggleHazardMode(mode, btn) {
  if (activeModes.has(mode)) {
    activeModes.delete(mode);
    btn.setAttribute('aria-pressed', 'false');
  } else {
    activeModes.add(mode);
    btn.setAttribute('aria-pressed', 'true');
  }
  // In manual mode, show/hide the corresponding input section
  if (inputMode === 'manual') {
    const section = document.getElementById(`inputs-${mode}`);
    if (section) section.hidden = !activeModes.has(mode);
  }
}

function updateCustomLocationVisibility() {
  const isCustom = document.getElementById('location').value === 'custom';
  const group = document.getElementById('custom-location-group');
  if (group) group.hidden = !isCustom;
  document.getElementById('custom-lat').setAttribute('aria-required', String(isCustom));
  document.getElementById('custom-lon').setAttribute('aria-required', String(isCustom));
}

function setInputMode(mode) {
  inputMode = mode;

  document.getElementById('mode-tab-api').setAttribute('aria-pressed', String(mode === 'api'));
  document.getElementById('mode-tab-manual').setAttribute('aria-pressed', String(mode === 'manual'));
  document.getElementById('mode-tab-api').classList.toggle('input-mode-tab--active', mode === 'api');
  document.getElementById('mode-tab-manual').classList.toggle('input-mode-tab--active', mode === 'manual');

  document.getElementById('input-mode-hint-api').hidden    = mode !== 'api';
  document.getElementById('input-mode-hint-manual').hidden = mode !== 'manual';

  // Show manual input sections for active hazard modes, hide all when switching to API
  ['severe', 'heat', 'winter'].forEach(m => {
    const section = document.getElementById(`inputs-${m}`);
    if (section) section.hidden = !(mode === 'manual' && activeModes.has(m));
  });

  const btn = document.getElementById('calculate-btn');
  btn.textContent = mode === 'api' ? 'Fetch Weather Data & Calculate Risk' : 'Calculate Risk Assessment';
}

function initHeatSourceToggle() {
  document.querySelectorAll('input[name="heat-source"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const useWBGT = radio.value === 'wbgt';
      const wbgtSel = document.getElementById('heat-wbgt');
      const hiSel   = document.getElementById('heat-hi');
      const wbgtGrp = document.getElementById('wbgt-field-group');
      const hiGrp   = document.getElementById('hi-field-group');
      wbgtSel.disabled = !useWBGT;
      wbgtSel.setAttribute('aria-disabled', String(!useWBGT));
      hiSel.disabled   = useWBGT;
      hiSel.setAttribute('aria-disabled', String(useWBGT));
      if (wbgtGrp) wbgtGrp.style.opacity = useWBGT ? '1' : '0.4';
      if (hiGrp)   hiGrp.style.opacity   = useWBGT ? '0.4' : '1';
    });
  });
}

function getForecastDateTimeValue(prefix) {
  const date = document.getElementById(`${prefix}-date`).value;
  const time = document.getElementById(`${prefix}-time`).value;
  return date && time ? `${date}T${time}` : '';
}

function validate() {
  const name     = document.getElementById('assessor-name').value.trim();
  const jobTitle = document.getElementById('assessor-title').value.trim();
  const location = document.getElementById('location').value;
  const start    = getForecastDateTimeValue('forecast-start');
  const end      = getForecastDateTimeValue('forecast-end');
  if (!name)     return 'Please enter the assessor\'s name.';
  if (!jobTitle) return 'Please enter the assessor\'s job title or role.';
  if (!location) return 'Please select a location.';
  if (location === 'custom') {
    const latRaw = document.getElementById('custom-lat').value;
    const lonRaw = document.getElementById('custom-lon').value;
    if (!latRaw || !lonRaw) return 'Please enter both a latitude and longitude for the custom location.';
    const lat = parseFloat(latRaw);
    const lon = parseFloat(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Latitude and longitude must be valid numbers.';
    if (lat < -90 || lat > 90)   return 'Latitude must be between -90 and 90.';
    if (lon < -180 || lon > 180) return 'Longitude must be between -180 and 180.';
  }
  if (!start || !end) return 'Please enter both a forecast start and end time.';
  if (new Date(start) >= new Date(end)) return 'Forecast end time must be after start time.';
  if (activeModes.size === 0) return 'Please select at least one hazard type.';
  return null;
}

function setLoading(isLoading) {
  const btn = document.getElementById('calculate-btn');
  if (!btn) return;
  btn.disabled = isLoading;
  if (isLoading) btn.textContent = 'Fetching NWS data…';
  else btn.textContent = inputMode === 'api' ? 'Fetch Weather Data & Calculate Risk' : 'Calculate Risk Assessment';
}

async function handleCalculate() {
  const errorEl = document.getElementById('calc-error');
  const err = validate();
  if (err) { errorEl.textContent = err; errorEl.hidden = false; errorEl.focus(); return; }
  errorEl.hidden = true; errorEl.textContent = '';

  const locationKey  = document.getElementById('location').value;
  const windowStart  = new Date(getForecastDateTimeValue('forecast-start'));
  const windowEnd    = new Date(getForecastDateTimeValue('forecast-end'));
  const modesArray   = [...activeModes];

  if (inputMode === 'manual') {
    const modeResults = {};
    if (modesArray.includes('severe')) modeResults.severe = calcManualSevere();
    if (modesArray.includes('heat'))   modeResults.heat   = calcManualHeat();
    if (modesArray.includes('winter')) modeResults.winter = calcManualWinter();
    renderResults(modesArray, modeResults, null, windowStart, windowEnd);
    window._lastExport = { modeResults, nwsData: null, modesArray, windowStart, windowEnd };
    showResultsPanel();
    return;
  }

  // API mode
  setLoading(true);
  try {
    const loc = resolveLocation(locationKey);
    if (!loc) throw new Error('Please select a valid location.');
    const nwsData = await fetchNWSData(loc, windowStart, windowEnd);
    const modeResults = {};
    if (modesArray.includes('severe')) modeResults.severe = mapNWSToSevere(nwsData, windowStart, windowEnd);
    if (modesArray.includes('heat'))   modeResults.heat   = mapNWSToHeat(nwsData, windowStart, windowEnd);
    if (modesArray.includes('winter')) modeResults.winter = mapNWSToWinter(nwsData, windowStart, windowEnd);
    renderResults(modesArray, modeResults, nwsData, windowStart, windowEnd);
    window._lastExport = { modeResults, nwsData, modesArray, windowStart, windowEnd };
    showResultsPanel();
  } catch (e) {
    console.error('NWS fetch error:', e);
    errorEl.textContent = `Unable to retrieve NWS data: ${e.message}. Check your connection or switch to manual entry.`;
    errorEl.hidden = false; errorEl.focus();
  } finally {
    setLoading(false);
  }
}

function showResultsPanel() {
  const panel = document.getElementById('results-panel');
  panel.hidden = false;
  panel.focus();
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleReset() {
  document.getElementById('assessor-name').value  = '';
  document.getElementById('assessor-title').value = '';
  document.getElementById('location').value = 'stillwater';
  document.getElementById('custom-lat').value = '';
  document.getElementById('custom-lon').value = '';
  updateCustomLocationVisibility();
  setDefaultForecastWindow();

  activeModes.clear();
  document.querySelectorAll('.hazard-tab').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
  ['severe', 'heat', 'winter'].forEach(m => {
    const s = document.getElementById(`inputs-${m}`);
    if (s) s.hidden = true;
  });

  document.querySelectorAll('.hazard-inputs select').forEach(s => { s.selectedIndex = 0; });
  document.querySelectorAll('.hazard-inputs input[type="radio"]').forEach(r => { r.checked = r.value === '0'; });
  const wbgtRadio = document.getElementById('heat-source-wbgt');
  if (wbgtRadio) { wbgtRadio.checked = true; wbgtRadio.dispatchEvent(new Event('change')); }

  setInputMode('api');

  const panel = document.getElementById('results-panel');
  panel.hidden = true;
  document.getElementById('results-content').innerHTML = '';
  const errorEl = document.getElementById('calc-error');
  errorEl.hidden = true; errorEl.textContent = '';
  window._lastExport = null;

  document.getElementById('assessor-name').focus();
}

/* ═══════════════════════════════════════════════════════════
   11. PDF EXPORT
   ═══════════════════════════════════════════════════════════ */

function handleExport() {
  const exp = window._lastExport;
  if (!exp) { alert('No assessment to export. Please run an assessment first.'); return; }
  const { modeResults, nwsData, modesArray, windowStart, windowEnd } = exp;

  const locationKey  = document.getElementById('location').value;
  const locationName = resolveLocation(locationKey)?.name || locationKey;
  const assessor     = document.getElementById('assessor-name').value || '—';
  const jobTitle     = document.getElementById('assessor-title').value || '—';
  const calcTime     = formatDateTime(new Date());
  const isAPI        = nwsData != null;

  const modeOrder  = ['severe', 'heat', 'winter'];
  const modeConfig = {
    severe: { label: 'Severe Weather', icon: '⛈' },
    heat:   { label: 'Heat',           icon: '☀'  },
    winter: { label: 'Winter Weather', icon: '❄'  },
  };
  const categories = [
    { key: 'facility', label: 'Facility Operations' },
    { key: 'outdoor',  label: 'Outdoor Activities' },
    { key: 'roads',    label: 'Roads & Travel' },
  ];

  const alertsBarHTML = isAPI && nwsData.alerts.length > 0 ? `
    <div class="rpt-advisory-bar">
      <span class="rpt-advisory-label">Active NWS Alerts</span>
      ${nwsData.alerts.map(a => `<span class="rpt-advisory-pill">${a.properties?.event || 'Alert'}</span>`).join('')}
    </div>` : '';

  let modeSectionsHTML = '';
  modeOrder.forEach(mode => {
    if (!modesArray.includes(mode)) return;
    const cfg    = modeConfig[mode];
    const result = modeResults[mode];
    if (!result) return;
    const meta = result.meta || {};

    const metricLines = [];
    if (mode === 'severe' && isAPI) {
      if (meta.qpfIn != null)    metricLines.push(`QPF: ${meta.qpfIn}"`);
      if (meta.maxWindSust)      metricLines.push(`Max Wind: ${meta.maxWindSust} mph`);
      if (meta.maxWindGust)      metricLines.push(`Max Gust: ${meta.maxWindGust} mph`);
    }
    if (mode === 'heat' && isAPI) {
      if (meta.maxTempF != null) metricLines.push(`High: ${meta.maxTempF}°F`);
      if (meta.maxHeatStressF != null) metricLines.push(`Peak ${meta.usingWBGT ? 'WBGT' : 'HI'}: ${meta.maxHeatStressF}°F`);
    }
    if (mode === 'winter' && isAPI) {
      metricLines.push(`Ice: ${meta.iceIn}"`);
      metricLines.push(`Snow: ${meta.snowIn}"`);
      if (meta.minWCF != null)   metricLines.push(`Min WC: ${meta.minWCF}°F`);
    }

    modeSectionsHTML += `
      <div class="rpt-mode-section">
        <div class="rpt-mode-header">
          <div class="rpt-mode-title">${cfg.icon} ${cfg.label}</div>
          <div class="rpt-mode-subtitle">${isAPI ? 'NWS API' : 'Manual Entry'} — Predictive Risk Assessment</div>
        </div>
        ${metricLines.length ? `<div class="rpt-nws-metrics">${metricLines.map(m => `<span>${m}</span>`).join('')}</div>` : ''}
        <div class="rpt-score-table">
          ${categories.map(cat => {
            const score = result[cat.key];
            const level = scoreToLevel(score);
            const showNote = cat.key === 'roads' && mode === 'heat';
            return `
              <div class="rpt-score-cell">
                <div class="rpt-score-cat">${cat.label}</div>
                <div class="rpt-score-level-row">
                  <div class="rpt-risk-bar rpt-risk-bar--${level}"></div>
                  <div class="rpt-score-num-block">
                    <div class="rpt-score-num">${score}</div>
                    <div class="rpt-score-outof">/ 100</div>
                  </div>
                </div>
                <div class="rpt-score-status">${LEVEL_LABELS[level]}</div>
                <div class="rpt-score-rec">${getRecommendation(level, cat.key)}</div>
                ${showNote ? '<div class="rpt-subdued-note">Heat has minimal direct road impact.</div>' : ''}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  });

  // Fixed to Kestrel's light/branded palette — this report renders in an isolated
  // popup document, so it never sees the main page's [data-theme="dark"] and is
  // unaffected by the user's dark mode preference regardless.
  const reportStyles = `
    :root {
      --k-bg: #F3F4F7; --k-surface: #FFFFFF; --k-border: #D3D8DE; --k-border-strong: #818A98;
      --k-text: #131820; --k-text-secondary: #4F5764;
      --k-primary: #2D658F; --k-primary-text: #FFFFFF; --k-accent: #AD531F; --k-accent-text: #FFFFFF;
      --k-success-text: #235234; --k-warning-text: #8B610E; --k-danger-text: #7A261F; --k-info-text: #21759C;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 8pt; color: var(--k-text); background: var(--k-surface); padding: 0.45in 0.5in 0.4in; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: letter portrait; margin: 0; }
    .rpt-header { border-bottom: 3pt solid var(--k-accent); margin-bottom: 7pt; padding-bottom: 6pt; }
    .rpt-header-title { font-size: 16pt; font-weight: 800; color: var(--k-text); letter-spacing: 0.06em; margin-bottom: 1pt; }
    .rpt-header-tagline { font-size: 7.5pt; color: var(--k-accent); font-weight: 600; margin-bottom: 3pt; }
    .rpt-header-sub { font-size: 7pt; color: var(--k-text-secondary); }
    .rpt-infobar { display: flex; border: 1pt solid var(--k-border); border-left: 3pt solid var(--k-accent); margin-bottom: 7pt; background: var(--k-bg); }
    .rpt-infobar-cell { flex: 1; padding: 4pt 7pt; border-right: 1pt solid var(--k-border); }
    .rpt-infobar-cell:last-child { border-right: none; }
    .rpt-info-label { font-size: 5.5pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--k-text-secondary); margin-bottom: 1.5pt; }
    .rpt-info-value { font-size: 7.5pt; font-weight: 600; }
    .rpt-advisory-bar { display: flex; align-items: baseline; gap: 5pt; border: 1pt solid var(--k-border-strong); border-left: 3pt solid var(--k-accent); background: var(--k-bg); padding: 3.5pt 7pt; margin-bottom: 7pt; flex-wrap: wrap; }
    .rpt-advisory-label { font-size: 6pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--k-text); }
    .rpt-advisory-pill { font-size: 6.5pt; font-weight: 600; background: var(--k-surface); border: 0.5pt solid var(--k-border-strong); padding: 0.5pt 4pt; border-radius: 2pt; }
    .rpt-mode-section { border: 1pt solid var(--k-border); margin-bottom: 6pt; page-break-inside: avoid; }
    .rpt-mode-header { display: flex; align-items: center; justify-content: space-between; background: var(--k-text); color: var(--k-surface); padding: 3.5pt 8pt; }
    .rpt-mode-title { font-size: 7.5pt; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .rpt-mode-subtitle { font-size: 6pt; color: rgba(255,255,255,0.65); }
    .rpt-nws-metrics { display: flex; gap: 12pt; padding: 3pt 8pt; background: var(--k-bg); border-bottom: 1pt solid var(--k-border); font-size: 6.5pt; font-weight: 600; flex-wrap: wrap; }
    .rpt-score-table { display: grid; grid-template-columns: repeat(3, 1fr); }
    .rpt-score-cell { padding: 6pt 8pt; border-right: 1pt solid var(--k-border); }
    .rpt-score-cell:last-child { border-right: none; }
    .rpt-score-cat { font-size: 6pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--k-text-secondary); margin-bottom: 4pt; }
    .rpt-score-level-row { display: flex; align-items: center; gap: 4pt; margin-bottom: 3pt; }
    .rpt-risk-bar { width: 3pt; height: 22pt; border-radius: 1pt; flex-shrink: 0; }
    .rpt-risk-bar--green { background: var(--k-success-text); } .rpt-risk-bar--yellow { background: var(--k-warning-text); } .rpt-risk-bar--amber { background: var(--k-accent); } .rpt-risk-bar--red { background: var(--k-danger-text); }
    .rpt-score-num-block { display: flex; flex-direction: column; }
    .rpt-score-num { font-size: 22pt; font-weight: 800; line-height: 1; }
    .rpt-score-outof { font-size: 6pt; color: var(--k-text-secondary); }
    .rpt-score-status { font-size: 7.5pt; font-weight: 700; margin-bottom: 3pt; }
    .rpt-score-rec { font-size: 6.5pt; color: var(--k-text); line-height: 1.4; border-top: 0.5pt solid var(--k-border); padding-top: 3pt; }
    .rpt-subdued-note { font-size: 5.5pt; font-style: italic; color: var(--k-text-secondary); margin-top: 2pt; }
    .rpt-footer { margin-top: 6pt; padding-top: 5pt; border-top: 0.5pt solid var(--k-border); display: flex; justify-content: space-between; gap: 12pt; }
    .rpt-disclaimer { font-size: 5.5pt; color: var(--k-text-secondary); line-height: 1.45; flex: 1; }
    .rpt-footer-right { font-size: 5.5pt; color: var(--k-text-secondary); text-align: right; white-space: nowrap; }
  `;

  const fullHTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Kestrel — ${locationName}</title><style>${reportStyles}</style></head><body>
  <div class="rpt-header">
    <div class="rpt-header-title">KESTREL</div>
    <div class="rpt-header-tagline">Know before you go</div>
    <div class="rpt-header-sub">${locationName} &nbsp;&middot;&nbsp; ${formatDateTime(windowStart)} – ${formatDateTime(windowEnd)}</div>
  </div>
  <div class="rpt-infobar">
    <div class="rpt-infobar-cell"><div class="rpt-info-label">Assessor</div><div class="rpt-info-value">${assessor}</div></div>
    <div class="rpt-infobar-cell"><div class="rpt-info-label">Role</div><div class="rpt-info-value">${jobTitle}</div></div>
    <div class="rpt-infobar-cell"><div class="rpt-info-label">Data Source</div><div class="rpt-info-value">${isAPI ? 'NWS API' : 'Manual Entry'}</div></div>
    <div class="rpt-infobar-cell"><div class="rpt-info-label">Generated</div><div class="rpt-info-value">${calcTime}</div></div>
  </div>
  ${alertsBarHTML}${modeSectionsHTML}
  <div class="rpt-footer">
    <div class="rpt-disclaimer"><strong>Decision Support Only.</strong> Risk scores do not constitute an official operational directive. Final authority rests with authorized leadership. Reassess as conditions evolve.</div>
    <div class="rpt-footer-right">Kestrel &nbsp;|&nbsp; For Internal Use Only</div>
  </div></body></html>`;

  const printWin = window.open('', '_blank', 'width=850,height=1100');
  if (!printWin) { alert('Pop-up blocked. Please allow pop-ups to export the report.'); return; }
  printWin.document.open();
  printWin.document.write(fullHTML);
  printWin.document.close();
  printWin.onload = () => {
    printWin.focus(); printWin.print();
    printWin.onafterprint = () => printWin.close();
    setTimeout(() => { if (!printWin.closed) printWin.close(); }, 4000);
  };
}

/* ═══════════════════════════════════════════════════════════
   12. MISC HELPERS
   ═══════════════════════════════════════════════════════════ */

function formatDateTime(d) {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatTime(d) {
  return d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function toLocalDateStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

function toLocalTimeStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function setDefaultForecastWindow() {
  const now = new Date(); now.setMinutes(0, 0, 0);
  const end = new Date(now.getTime() + 12 * 3600000);
  document.getElementById('forecast-start-date').value = toLocalDateStr(now);
  document.getElementById('forecast-start-time').value = toLocalTimeStr(now);
  document.getElementById('forecast-end-date').value   = toLocalDateStr(end);
  document.getElementById('forecast-end-time').value   = toLocalTimeStr(end);
}

function initBetaModal() {
  const modal = document.getElementById('beta-modal');
  const btn   = document.getElementById('beta-modal-close');
  if (!modal || !btn) return;
  const key = 'wdst-beta-modal-dismissed';
  let show = true;
  try { show = localStorage.getItem(key) !== 'true'; } catch (_) {}
  if (!show) { modal.hidden = true; return; }
  modal.hidden = false;
  document.body.classList.add('modal-open');
  btn.addEventListener('click', () => {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    try { localStorage.setItem(key, 'true'); } catch (_) {}
  });
}

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

function updateClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  el.textContent = new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
}

/* ═══════════════════════════════════════════════════════════
   13. INIT
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  setDefaultForecastWindow();

  // Input mode tabs
  document.querySelectorAll('.input-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => setInputMode(btn.dataset.inputMode));
  });

  // Hazard mode tabs
  document.querySelectorAll('.hazard-tab').forEach(btn => {
    btn.addEventListener('click', () => toggleHazardMode(btn.dataset.mode, btn));
  });

  document.getElementById('location').addEventListener('change', updateCustomLocationVisibility);
  updateCustomLocationVisibility();

  initHeatSourceToggle();
  initDataSourcesPanel();
  initBetaModal();
  initThemeToggle();

  const calcBtn = document.getElementById('calculate-btn');
  if (calcBtn) calcBtn.addEventListener('click', handleCalculate);

  document.addEventListener('click', e => {
    if (e.target.id === 'export-btn') handleExport();
    if (e.target.id === 'reset-btn')  handleReset();
  });

  updateClock();
  setInterval(updateClock, 30000);
});
