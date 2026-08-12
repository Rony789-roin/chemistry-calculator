// Global State & Data
let chemicals = [];
let selectedChem = null;

const DENSITY_WATER = 1.0000;
const DENSITY_NITROBENZENE = 1.2040;
const DENSITY_ACETIC_ACID = 1.0520;

const DEFAULT_DATA = [
  [10.0, 0.4, 10.7], [10.0, 0.8, 11.7], [10.0, 1.0, 12.6], [10.0, 2.0, 15.4],
  [10.0, 3.0, 16.4], [10.0, 5.0, 19.8], [10.0, 8.0, 22.4], [10.0, 10.0, 24.4],
  [0.4, 10.0, 4.3],  [0.8, 10.0, 5.6],  [1.0, 10.0, 6.1],  [2.0, 10.0, 8.8],
  [3.0, 10.0, 11.2], [5.0, 10.0, 15.6], [8.0, 10.0, 21.4], [10.0, 10.0, 24.5],
];

let calculatedResults = [];
let userSelectedPoints = [];
let clickablePoints = [];

let unkPctNb = null;
let origUnkComp = null;
let showUnknownMark = false;
let activeTool = 'none'; // 'none', 'zoom', 'pan'
let currentView = { minX: 0, maxX: 1, minY: 0, maxY: Math.sqrt(3)/2 };
let viewStack = [];

// Load Chemical CSV Data
async function loadChemicalsFromCSV() {
  try {
    const response = await fetch('chemical.csv');
    const dataText = await response.text();
    const lines = dataText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length >= 4) {
        chemicals.push({
          name: cols[0].trim(),
          formula: cols[1].trim(),
          mw: parseFloat(cols[2].trim()),
          ew: parseFloat(cols[3].trim())
        });
      }
    }
  } catch (error) {
    console.error("chemical.csv fetch error:", error);
  }
}

// Tab Switching
function switchTab(id, btn) {
  document.querySelectorAll('.app-card .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.app-card .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
}

function switchSubTab(id, btn) {
  document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('subtab-' + id).classList.add('active');
  btn.classList.add('active');
  if (id === 'plot') drawTernaryPlot();
}

function openTernaryModule() {
  document.getElementById('ternary-workspace').classList.remove('hidden');
  initObsTable();
  calculateTernaryData();
}

function closeTernaryModule() {
  document.getElementById('ternary-workspace').classList.add('hidden');
}

// Observation Table Controls
function initObsTable() {
  const tbody = document.getElementById('obs-tbody');
  tbody.innerHTML = '';
  DEFAULT_DATA.forEach((row) => {
    addObsRow(row[0], row[1], row[2]);
  });
}

function addObsRow(vw, vnb, vaa) {
  const tbody = document.getElementById('obs-tbody');
  const idx = tbody.children.length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${idx}</td>
    <td><input type="number" class="py-vw" value="${vw}" step="any" onchange="calculateTernaryData()"></td>
    <td><input type="number" class="py-vnb" value="${vnb}" step="any" onchange="calculateTernaryData()"></td>
    <td><input type="number" class="py-vaa" value="${vaa}" step="any" onchange="calculateTernaryData()"></td>
  `;
  tbody.appendChild(tr);
}

// Calculations Engine
function calculateTernaryData() {
  calculatedResults = [];
  const vws = document.querySelectorAll('.py-vw');
  const vnbs = document.querySelectorAll('.py-vnb');
  const vaas = document.querySelectorAll('.py-vaa');
  const resTbody = document.getElementById('res-tbody');
  resTbody.innerHTML = '';

  vws.forEach((_, i) => {
    try {
      const mw = parseFloat(vws[i].value) * DENSITY_WATER;
      const mnb = parseFloat(vnbs[i].value) * DENSITY_NITROBENZENE;
      const maa = parseFloat(vaas[i].value) * DENSITY_ACETIC_ACID;
      const mtotal = mw + mnb + maa;

      if (mtotal > 0) {
        const pct_w = (mw / mtotal) * 100;
        const pct_nb = (mnb / mtotal) * 100;
        const pct_aa = (maa / mtotal) * 100;

        calculatedResults.push({ idx: i + 1, pct_w, pct_nb, pct_aa });

        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${pct_w.toFixed(2)}%</td><td>${pct_nb.toFixed(2)}%</td><td>${pct_aa.toFixed(2)}%</td>`;
        resTbody.appendChild(tr);
      }
    } catch (e) {}
  });

  try {
    const w2 = parseFloat(document.getElementById('py-w2').value);
    const w1 = parseFloat(document.getElementById('py-w1').value);
    const vNbUnk = parseFloat(document.getElementById('py-vnb').value);
    
    const mMix = w1 - w2;
    const mNbAdded = vNbUnk * DENSITY_NITROBENZENE;
    unkPctNb = (mNbAdded / (mMix + mNbAdded)) * 100;

    const sortedByNb = [...calculatedResults].sort((a, b) => a.pct_nb - b.pct_nb);
    let interW = null, interAa = null;

    for (let i = 0; i < sortedByNb.length - 1; i++) {
      const p1 = sortedByNb[i], p2 = sortedByNb[i + 1];
      if ((p1.pct_nb <= unkPctNb && unkPctNb <= p2.pct_nb) || (p2.pct_nb <= unkPctNb && unkPctNb <= p1.pct_nb)) {
        const denom = p2.pct_nb - p1.pct_nb;
        const ratio = denom !== 0 ? (unkPctNb - p1.pct_nb) / denom : 0;
        interW = p1.pct_w + ratio * (p2.pct_w - p1.pct_w);
        interAa = p1.pct_aa + ratio * (p2.pct_aa - p1.pct_aa);
        break;
      }
    }

    if (interW !== null && interAa !== null) {
      const origW = (interW / (interW + interAa)) * 100;
      const origAa = (interAa / (interW + interAa)) * 100;
      origUnkComp = { pct_w: origW, pct_nb: 0.0, pct_aa: origAa, inter_w: interW, inter_aa: interAa };

      document.getElementById('py-unk-output').innerHTML = `
        Titrated Unknown: ${unkPctNb.toFixed(2)}% Nitrobenzene<br>
        Original Mixture Composition (0% NB Baseline):<br>
        &nbsp;&bull; Water: ${origW.toFixed(2)}%<br>
        &nbsp;&bull; Acetic Acid: ${origAa.toFixed(2)}%
      `;
    } else {
      document.getElementById('py-unk-output').innerHTML = `Titrated Unknown: ${unkPctNb.toFixed(2)}% Nitrobenzene`;
    }
  } catch (e) {
    unkPctNb = null;
    origUnkComp = null;
    document.getElementById('py-unk-output').innerHTML = "Invalid Unknown Mixture Input!";
  }
}

// Plotting Engine matching Python App
function drawTernaryPlot() {
  const canvas = document.getElementById('ternaryCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 900;
  const hCanvas = 580;

  canvas.width = w * dpr;
  canvas.height = hCanvas * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, hCanvas);
  clickablePoints = [];

  const topVal = document.getElementById('cb-top').value;
  const leftVal = document.getElementById('cb-left').value;
  const rightVal = document.getElementById('cb-right').value;

  const h = Math.sqrt(3) / 2;
  
  function toCartesian(pct_w, pct_nb, pct_aa) {
    const valMap = { "Water": pct_w, "Nitrobenzene": pct_nb, "Acetic Acid": pct_aa };
    const t = valMap[topVal], l = valMap[leftVal], r = valMap[rightVal];
    const x = (r + 0.5 * t) / 100.0;
    const y = (h * t) / 100.0;
    return { x, y };
  }

  const margin = 80;
  const plotWidth = w - 2 * margin;
  const plotHeight = hCanvas - 2 * margin;

  function transform(cx, cy) {
    const px = margin + ((cx - currentView.minX) / (currentView.maxX - currentView.minX)) * plotWidth;
    const py = (hCanvas - margin) - ((cy - currentView.minY) / (currentView.maxY - currentView.minY)) * plotHeight;
    return { px, py };
  }

  const pTop = transform(0.5, h);
  const pLeft = transform(0, 0);
  const pRight = transform(1, 0);

  // Grid lines
  const gridStr = document.getElementById('cb-grid').value.replace("%", "");
  const stepVal = parseInt(gridStr) || 1;
  ctx.font = '9px Arial';

  for (let pct = stepVal; pct < 100; pct += stepVal) {
    const f = pct / 100.0;
    const is10 = (pct % 10 === 0);
    const is5 = (pct % 5 === 0);

    ctx.strokeStyle = is10 ? '#444444' : (is5 ? '#888888' : '#cccccc');
    ctx.lineWidth = is10 ? 0.8 : 0.4;
    ctx.setLineDash(is10 ? [2, 2] : []);

    const h1 = transform(0.5 * f, f * h);
    const h2 = transform(1 - 0.5 * f, f * h);
    ctx.beginPath(); ctx.moveTo(h1.px, h1.py); ctx.lineTo(h2.px, h2.py); ctx.stroke();

    const l1 = transform(f, 0);
    const l2 = transform(0.5 + 0.5 * f, (1 - f) * h);
    ctx.beginPath(); ctx.moveTo(l1.px, l1.py); ctx.lineTo(l2.px, l2.py); ctx.stroke();

    const r1 = transform(1 - f, 0);
    const r2 = transform(0.5 * (1 - f), (1 - f) * h);
    ctx.beginPath(); ctx.moveTo(r1.px, r1.py); ctx.lineTo(r2.px, r2.py); ctx.stroke();
    ctx.setLineDash([]);

    if (is10) {
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, h1.px - 4, h1.py + 3);
      ctx.textAlign = 'center';
      ctx.fillText(`${pct}%`, l1.px, l1.py + 12);
      ctx.textAlign = 'left';
      ctx.fillText(`${100 - pct}%`, h2.px + 4, h2.py + 3);
    }
  }

  // Outer Triangle Frame
  ctx.beginPath();
  ctx.moveTo(pTop.px, pTop.py);
  ctx.lineTo(pLeft.px, pLeft.py);
  ctx.lineTo(pRight.px, pRight.py);
  ctx.closePath();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Vertex Labels
  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.fillText(`100% ${topVal}`, pTop.px, pTop.py - 16);
  ctx.textAlign = 'right';
  ctx.fillText(`100% ${leftVal}`, pLeft.px - 10, pLeft.py + 18);
  ctx.textAlign = 'left';
  ctx.fillText(`100% ${rightVal}`, pRight.px + 10, pRight.py + 18);

  // Base Data Points
  calculatedResults.forEach(r => {
    const c = toCartesian(r.pct_w, r.pct_nb, r.pct_aa);
    const p = transform(c.x, c.y);
    clickablePoints.push({ x: c.x, y: c.y, data: r });

    ctx.beginPath();
    ctx.arc(p.px, p.py, 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.75)';
    ctx.fill();
  });

  // Connected Curve
  document.getElementById('connected-count').innerText = `Connected Points: ${userSelectedPoints.length}`;
  const listEl = document.getElementById('connected-list');
  listEl.innerHTML = '';
  userSelectedPoints.forEach((r, orderIdx) => {
    const opt = document.createElement('option');
    opt.text = `#${orderIdx + 1} P${r.idx}: W:${r.pct_w.toFixed(1)}% NB:${r.pct_nb.toFixed(1)}% AA:${r.pct_aa.toFixed(1)}%`;
    listEl.add(opt);
  });

  if (userSelectedPoints.length >= 2) {
    const screenPts = userSelectedPoints.map(r => {
      const c = toCartesian(r.pct_w, r.pct_nb, r.pct_aa);
      return transform(c.x, c.y);
    });

    ctx.beginPath();
    screenPts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    screenPts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.px, p.py, 6, 0, 2 * Math.PI);
      ctx.fillStyle = 'red';
      ctx.fill();
    });
  }

  // Unknown Point
  if (showUnknownMark && unkPctNb !== null && origUnkComp !== null) {
    const comp = origUnkComp;
    const vNbCart = toCartesian(0, 100, 0);
    const ptUnkCart = toCartesian(comp.inter_w, unkPctNb, comp.inter_aa);
    const ptOrigCart = toCartesian(comp.pct_w, 0.0, comp.pct_aa);

    const pNb = transform(vNbCart.x, vNbCart.y);
    const pUnk = transform(ptUnkCart.x, ptUnkCart.y);
    const pOrig = transform(ptOrigCart.x, ptOrigCart.y);

    ctx.beginPath();
    ctx.moveTo(pNb.px, pNb.py);
    ctx.lineTo(pUnk.px, pUnk.py);
    ctx.lineTo(pOrig.px, pOrig.py);
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath(); ctx.arc(pUnk.px, pUnk.py, 7, 0, 2 * Math.PI); ctx.fillStyle = 'purple'; ctx.fill();
    ctx.beginPath(); ctx.arc(pOrig.px, pOrig.py, 7, 0, 2 * Math.PI); ctx.fillStyle = 'green'; ctx.fill();
  }

  // Legend
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.fillRect(w - 230, 20, 215, userSelectedPoints.length >= 2 ? 65 : 45);
  ctx.strokeRect(w - 230, 20, 215, userSelectedPoints.length >= 2 ? 65 : 45);

  ctx.font = '10px Arial';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  if (userSelectedPoints.length >= 2) {
    ctx.beginPath(); ctx.moveTo(w - 220, 35); ctx.lineTo(w - 190, 35); ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.setLineDash([4,3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillText('Smooth Binodal Curve', w - 180, 38);
    ctx.beginPath(); ctx.moveTo(w - 220, 53); ctx.lineTo(w - 190, 53); ctx.strokeStyle = 'blue'; ctx.lineWidth = 1.5; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillText('Unknown Projection Line', w - 180, 56);
  } else {
    ctx.beginPath(); ctx.moveTo(w - 220, 35); ctx.lineTo(w - 190, 35); ctx.strokeStyle = 'blue'; ctx.lineWidth = 1.5; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillText('Unknown Projection Line', w - 180, 38);
  }

  // Title
  ctx.font = 'bold 13px Arial';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.fillText("Ternary Phase Diagram", w / 2, 16);
}

// Toolbar Interactions
function toggleZoomMode() {
  activeTool = activeTool === 'zoom' ? 'none' : 'zoom';
  document.getElementById('btn-tb-zoom').classList.toggle('active', activeTool === 'zoom');
  document.getElementById('btn-tb-pan').classList.remove('active');
}

function togglePanMode() {
  activeTool = activeTool === 'pan' ? 'none' : 'pan';
  document.getElementById('btn-tb-pan').classList.toggle('active', activeTool === 'pan');
  document.getElementById('btn-tb-zoom').classList.remove('active');
}

function resetZoom() {
  currentView = { minX: 0, maxX: 1, minY: 0, maxY: Math.sqrt(3)/2 };
  viewStack = [];
  activeTool = 'none';
  document.getElementById('btn-tb-zoom').classList.remove('active');
  document.getElementById('btn-tb-pan').classList.remove('active');
  drawTernaryPlot();
}

function undoZoom() {
  if (viewStack.length > 0) {
    currentView = viewStack.pop();
    drawTernaryPlot();
  }
}

function saveGraphImage() {
  const canvas = document.getElementById('ternaryCanvas');
  const link = document.createElement('a');
  link.download = 'ternary_phase_diagram.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Canvas Click & Drag Handling
function initCanvasClickHandler() {
  const canvas = document.getElementById('ternaryCanvas');
  if (!canvas) return;

  let isDragging = false;
  let startX, startY;
  let panStartX, panStartY;

  canvas.addEventListener('mousedown', function(e) {
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (activeTool === 'zoom' || activeTool === 'pan') {
      isDragging = true;
      panStartX = startX;
      panStartY = startY;
    } else {
      handlePointClick(startX, startY, rect);
    }
  });

  canvas.addEventListener('mousemove', function(e) {
    const rect = canvas.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;

    // Update coordinate text in toolbar
    document.getElementById('tb-coords-text').innerText = `(x, y) = (${(currX/rect.width).toFixed(3)}, ${((rect.height - currY)/rect.height).toFixed(3)})`;

    if (!isDragging) return;

    if (activeTool === 'pan') {
      const dx = (currX - panStartX) / rect.width;
      const dy = (currY - panStartY) / rect.height;
      const rangeX = currentView.maxX - currentView.minX;
      const rangeY = currentView.maxY - currentView.minY;

      currentView.minX -= dx * rangeX;
      currentView.maxX -= dx * rangeX;
      currentView.minY += dy * rangeY;
      currentView.maxY += dy * rangeY;

      panStartX = currX;
      panStartY = currY;
      drawTernaryPlot();
    }
  });

  canvas.addEventListener('mouseup', function(e) {
    if (isDragging) {
      isDragging = false;
      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      if (activeTool === 'zoom' && Math.abs(endX - startX) > 10) {
        applyBoxZoom(startX, startY, endX, endY, rect);
      }
    }
  });
}

function handlePointClick(mouseX, mouseY, rect) {
  let minDistPx = Infinity;
  let closestPt = null;

  const topVal = document.getElementById('cb-top').value;
  const leftVal = document.getElementById('cb-left').value;
  const rightVal = document.getElementById('cb-right').value;
  const h = Math.sqrt(3) / 2;
  const w = rect.width || 900;
  const hCanvas = 580;
  const margin = 80;
  const plotWidth = w - 2 * margin;
  const plotHeight = hCanvas - 2 * margin;

  clickablePoints.forEach(pt => {
    const valMap = { "Water": pt.data.pct_w, "Nitrobenzene": pt.data.pct_nb, "Acetic Acid": pt.data.pct_aa };
    const t = valMap[topVal], l = valMap[leftVal], r = valMap[rightVal];
    const cx = (r + 0.5 * t) / 100.0;
    const cy = (h * t) / 100.0;

    const px = margin + ((cx - currentView.minX) / (currentView.maxX - currentView.minX)) * plotWidth;
    const py = (hCanvas - margin) - ((cy - currentView.minY) / (currentView.maxY - currentView.minY)) * plotHeight;

    const distPx = Math.hypot(px - mouseX, py - mouseY);
    if (distPx < minDistPx) {
      minDistPx = distPx;
      closestPt = pt;
    }
  });

  if (minDistPx < 25 && closestPt) {
    const data = closestPt.data;
    if (data.idx && !userSelectedPoints.includes(data)) {
      userSelectedPoints.push(data);
      drawTernaryPlot();
    }
  }
}

function applyBoxZoom(x1, y1, x2, y2, rect) {
  viewStack.push(JSON.parse(JSON.stringify(currentView)));
  const margin = 80;
  const plotWidth = rect.width - 2 * margin;
  const plotHeight = 580 - 2 * margin;

  const minPx = Math.min(x1, x2), maxPx = Math.max(x1, x2);
  const minPy = Math.min(y1, y2), maxPy = Math.max(y1, y2);

  const newMinX = currentView.minX + ((minPx - margin) / plotWidth) * (currentView.maxX - currentView.minX);
  const newMaxX = currentView.minX + ((maxPx - margin) / plotWidth) * (currentView.maxX - currentView.minX);
  
  const newMaxY = currentView.maxY - ((minPy - margin) / plotHeight) * (currentView.maxY - currentView.minY);
  const newMinY = currentView.maxY - ((maxPy - margin) / plotHeight) * (currentView.maxY - currentView.minY);

  currentView = { minX: newMinX, maxX: newMaxX, minY: newMinY, maxY: newMaxY };
  drawTernaryPlot();
}

function autoConnectPoints() {
  const s1 = calculatedResults.filter(r => r.idx <= 8).sort((a, b) => a.pct_nb - b.pct_nb);
  const s2 = calculatedResults.filter(r => r.idx > 8).sort((a, b) => b.pct_nb - a.pct_nb);
  userSelectedPoints = [...s1, ...s2];
  drawTernaryPlot();
}

function undoPoint() {
  if (userSelectedPoints.length > 0) {
    userSelectedPoints.pop();
    drawTernaryPlot();
  }
}

function resetMouseCurve() {
  userSelectedPoints = [];
  drawTernaryPlot();
}

function toggleZoomView() { toggleZoomMode(); }

function toggleUnknownPoint() {
  if (unkPctNb === null || origUnkComp === null) {
    alert("Please ensure valid unknown mixture inputs in the calculations tab first!");
    return;
  }
  showUnknownMark = !showUnknownMark;
  document.getElementById('btn-toggle-unk').innerText = showUnknownMark ? "Hide Unknown Point" : "Mark Unknown Point";
  drawTernaryPlot();
}

function onListSelect() {}

// Dilution & Weight Calculators
function updateDilutionLabels() {
  const v = document.querySelector('input[name=dtype]:checked').value;
  if (v === 'molarity') {
    document.getElementById('d-c1-label').textContent = 'Initial molarity (M₁)';
    document.getElementById('d-c2-label').textContent = 'Final molarity (M₂)';
  } else if (v === 'normality') {
    document.getElementById('d-c1-label').textContent = 'Initial normality (N₁)';
    document.getElementById('d-c2-label').textContent = 'Final normality (N₂)';
  } else {
    document.getElementById('d-c1-label').textContent = 'Stock concentration %';
    document.getElementById('d-c2-label').textContent = 'Required concentration %';
  }
}

function calcDilution() {
  const c1 = parseFloat(document.getElementById('d-c1').value);
  const c2 = parseFloat(document.getElementById('d-c2').value);
  const v2 = parseFloat(document.getElementById('d-v2').value);
  const el = document.getElementById('d-result');

  if (isNaN(c1) || isNaN(c2) || isNaN(v2) || c1 <= 0 || c2 < 0 || v2 <= 0) {
    el.className = 'result-box error';
    el.innerHTML = '<i class="ti ti-alert-circle"></i> Please enter valid positive numeric values.';
    return;
  }
  const v1 = (c2 * v2) / c1;
  el.className = 'result-box success';
  el.innerHTML = `<i class="ti ti-check"></i> Take <strong>${v1.toFixed(4)} mL</strong> of stock solution and dilute to ${v2} mL`;
}

function updateWeightLabels() {
  const v = document.querySelector('input[name=wtype]:checked').value;
  if (v === 'molarity') {
    document.getElementById('w-mw-label').textContent = 'Molecular weight (g/mol)';
    document.getElementById('w-conc-label').textContent = 'Required molarity (M)';
    document.getElementById('w-formula').textContent = 'mass = M × V(mL) × MW / 1000';
  } else {
    document.getElementById('w-mw-label').textContent = 'Equivalent weight (g/eq)';
    document.getElementById('w-conc-label').textContent = 'Required normality (N)';
    document.getElementById('w-formula').textContent = 'mass = N × V(mL) × EW / 1000';
  }
}

function searchChem() {
  const q = document.getElementById('chem-search').value.trim().toLowerCase();
  const box = document.getElementById('suggestions');
  if (!q) { box.classList.remove('open'); box.innerHTML = ''; return; }

  const matches = chemicals.filter(c =>
    c.name.toLowerCase().includes(q) || c.formula.toLowerCase().includes(q)
  ).slice(0, 10);

  if (!matches.length) { box.classList.remove('open'); box.innerHTML = ''; return; }

  box.innerHTML = matches.map((c) =>
    `<div class="suggestion-item" onclick="pickChem(${chemicals.indexOf(c)})">
      <span>${c.name}</span>
      <span style="font-family: monospace; color: #a0aec0">${c.formula}</span>
    </div>`
  ).join('');
  box.classList.add('open');
}

function searchKeydown(e) {
  const box = document.getElementById('suggestions');
  if (e.key === 'Escape') box.classList.remove('open');
}

function pickChem(idx) {
  selectedChem = chemicals[idx];
  document.getElementById('chem-search').value = `${selectedChem.name} (${selectedChem.formula})`;
  document.getElementById('suggestions').classList.remove('open');
  const v = document.querySelector('input[name=wtype]:checked').value;
  document.getElementById('w-mw').value = v === 'molarity' ? selectedChem.mw : selectedChem.ew;
}

function calcWeight() {
  const mw = parseFloat(document.getElementById('w-mw').value);
  const conc = parseFloat(document.getElementById('w-conc').value);
  const vol = parseFloat(document.getElementById('w-vol').value);
  const el = document.getElementById('w-result');

  if (isNaN(mw) || isNaN(conc) || isNaN(vol) || mw <= 0 || conc <= 0 || vol <= 0) {
    el.className = 'result-box error';
    el.innerHTML = '<i class="ti ti-alert-circle"></i> Please enter valid positive numeric values.';
    return;
  }
  const mass = (conc * vol * mw) / 1000;
  const unit = document.querySelector('input[name=wtype]:checked').value === 'molarity' ? 'M' : 'N';
  el.className = 'result-box success';
  el.innerHTML = `<i class="ti ti-check"></i> Weigh <strong>${mass.toFixed(4)} g</strong> and dissolve in ${vol} mL to get ${conc} ${unit}`;
}

window.onload = function() {
  loadChemicalsFromCSV();
  initCanvasClickHandler();
};
