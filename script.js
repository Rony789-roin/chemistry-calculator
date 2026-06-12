let chemicals = [];
let selectedChem = null;
let focusedIdx = -1;

// Load and parse chemicals directly from your CSV file
async function loadChemicalsFromCSV() {
  try {
    const response = await fetch('chemical.csv');
    const dataText = await response.text();
    
    // Split into individual clean rows
    const lines = dataText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Parse individual columns (skipping column header line at row index 0)
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',');
      if (columns.length >= 4) {
        chemicals.push({
          name: columns[0].trim(),
          formula: columns[1].trim(),
          mw: parseFloat(columns[2].trim()),
          ew: parseFloat(columns[3].trim())
        });
      }
    }
  } catch (error) {
    console.error("Error loading or parsing chemical.csv:", error);
  }
}

// Fire the dataset parse
loadChemicalsFromCSV();

// --- TAB SWITCHING ---
function switchTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
}

// --- DILUTION ---
function updateDilutionLabels() {
  const v = document.querySelector('input[name=dtype]:checked').value;
  if (v === 'molarity') {
    document.getElementById('d-c1-label').textContent = 'Initial molarity (M)';
    document.getElementById('d-c2-label').textContent = 'Final molarity (M)';
  } else if (v === 'normality') {
    document.getElementById('d-c1-label').textContent = 'Initial normality (N)';
    document.getElementById('d-c2-label').textContent = 'Final normality (N)';
  } else {
    document.getElementById('d-c1-label').textContent = 'Stock concentration';
    document.getElementById('d-c2-label').textContent = 'Required concentration';
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
  if (c2 > c1) {
    el.className = 'result-box error';
    el.innerHTML = '<i class="ti ti-alert-circle"></i> Final concentration cannot exceed initial concentration.';
    return;
  }
  const v1 = (c2 * v2) / c1;
  el.className = 'result-box success';
  el.innerHTML = `<i class="ti ti-check"></i> Take <strong>${v1.toFixed(4)} mL</strong> of stock solution and dilute to ${v2} mL`;
}

// --- WEIGHT ---
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
  fillWeightFromSelected();
}

function fillWeightFromSelected() {
  if (!selectedChem) return;
  const v = document.querySelector('input[name=wtype]:checked').value;
  document.getElementById('w-mw').value = v === 'molarity' ? selectedChem.mw : selectedChem.ew;
}

function searchChem() {
  const q = document.getElementById('chem-search').value.trim().toLowerCase();
  const box = document.getElementById('suggestions');
  focusedIdx = -1;
  if (!q) { box.classList.remove('open'); box.innerHTML = ''; return; }

  const matches = chemicals.filter(c =>
    c.name.toLowerCase().includes(q) || c.formula.toLowerCase().includes(q)
  ).slice(0, 12);

  if (!matches.length) { box.classList.remove('open'); box.innerHTML = ''; return; }

  box.innerHTML = matches.map((c, i) =>
    `<div class="suggestion-item" role="option" data-idx="${i}" onclick="pickChem(${chemicals.indexOf(c)})">
      <span>${c.name}</span>
      <span class="formula">${c.formula}</span>
    </div>`
  ).join('');
  box.classList.add('open');
}

function searchKeydown(e) {
  const box = document.getElementById('suggestions');
  const items = box.querySelectorAll('.suggestion-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); focusedIdx = Math.min(focusedIdx + 1, items.length - 1); updateFocus(items); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIdx = Math.max(focusedIdx - 1, 0); updateFocus(items); }
  else if (e.key === 'Enter' && focusedIdx >= 0) { e.preventDefault(); items[focusedIdx].click(); }
  else if (e.key === 'Escape') { box.classList.remove('open'); }
}

function updateFocus(items) {
  items.forEach((el, i) => el.classList.toggle('focused', i === focusedIdx));
  if (focusedIdx >= 0) items[focusedIdx].scrollIntoView({ block: 'nearest' });
}

function pickChem(idx) {
  selectedChem = chemicals[idx];
  document.getElementById('chem-search').value = `${selectedChem.name} (${selectedChem.formula})`;
  document.getElementById('suggestions').classList.remove('open');
  fillWeightFromSelected();
}

document.addEventListener('click', e => {
  if (!e.target.closest('#chem-search') && !e.target.closest('#suggestions'))
    document.getElementById('suggestions').classList.remove('open');
});

function calcWeight() {
  const mw   = parseFloat(document.getElementById('w-mw').value);
  const conc = parseFloat(document.getElementById('w-conc').value);
  const vol  = parseFloat(document.getElementById('w-vol').value);
  const el   = document.getElementById('w-result');

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