/* ══════════════════════════════════════════════════════
   STASHIMO v0.2 — Supplies Tracker & Meal Planner
   All data stored locally on-device via localStorage.
   ══════════════════════════════════════════════════════ */

/* ─── CONSTANTS ─── */
const COLOR_PALETTE = [
  '#23272f', '#ffffff', '#b98bd6', '#8bb6d6', '#8bd6b0', '#d6c48b',
  '#d68b9e', '#a3d68b', '#d6a08b', '#8ba3d6', '#c78bd6', '#8bd6c9'
];
const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const UNIT_PRESETS = ['piece','pack','bottle','box','can','kg','g','liter','ml'];

const LS_KEYS = {
  items: 'stashimo_items',
  types: 'stashimo_types',
  meals: 'stashimo_meals',
  boughtLog: 'stashimo_bought_log',
  ingLib: 'stashimo_ingredient_library',
  extraGrocery: 'stashimo_extra_grocery',
  week: 'stashimo_current_week',
  theme: 'stashimo_theme',
  tut: 'stashimo_tutorial_seen',
  // legacy (v0.1) keys used for one-time migration
  legacyTags: 'stashimo_tags',
  legacyPrice: 'stashimo_price_memory'
};

/* ─── HELPERS ─── */
function qs(id){ return document.getElementById(id); }

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(str){
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

function formatMoney(n){
  n = Number(n) || 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function pad2(n){ return n < 10 ? '0' + n : '' + n; }
function toISODate(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
function fromISODate(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(d, n){ const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function getMonday(d){
  const r = new Date(d);
  const day = r.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  r.setDate(r.getDate() + diff);
  r.setHours(0,0,0,0);
  return r;
}
function formatWeekRange(mondayISO){
  const mon = fromISODate(mondayISO);
  const sun = addDays(mon, 6);
  const monStr = mon.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  const sunStr = sun.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  return monStr + ' – ' + sunStr;
}

function loadJSON(key, fallback){
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch(e){ return fallback; }
}

/* ─── STATE ─── */
let items = loadJSON(LS_KEYS.items, []);
let types = loadJSON(LS_KEYS.types, []);
let meals = loadJSON(LS_KEYS.meals, []);
let boughtLog = loadJSON(LS_KEYS.boughtLog, {});
let ingredientLibrary = loadJSON(LS_KEYS.ingLib, {}); // { lowercaseName: { name, cost } }
let extraGroceryItems = loadJSON(LS_KEYS.extraGrocery, {}); // { weekStart: [{id, name, cost}] }
let currentWeekStart = localStorage.getItem(LS_KEYS.week) || toISODate(getMonday(new Date()));
let currentTheme = localStorage.getItem(LS_KEYS.theme) || 'slate';
let pantryFilter = 'all';
let calViewDate = fromISODate(currentWeekStart);
let tutStep = 0;

/* ─── ONE-TIME MIGRATION FROM v0.1 SCHEMA ─── */
(function migrateLegacyData(){
  const legacyTagsRaw = localStorage.getItem(LS_KEYS.legacyTags);
  if (legacyTagsRaw && types.length === 0){
    try {
      const legacyTags = JSON.parse(legacyTagsRaw);
      types = legacyTags.map(t => ({ id: t.id, name: t.name, color: t.color }));
      items.forEach(i => {
        if (i.tagId !== undefined){ i.typeId = i.tagId; delete i.tagId; }
        if (i.type !== undefined){ delete i.type; }
        if (i.unit === undefined) i.unit = 'piece';
        if (i.pricePerUnit === undefined) i.pricePerUnit = null;
      });
      // legacy meals had weekStart/color/ingredients(with inline bought)
      meals.forEach(m => {
        if (m.versions) return; // already migrated shape
        const legacyIngredients = (m.ingredients || []).map(ing => ({ id: ing.id, name: ing.name, cost: ing.cost != null ? ing.cost : null }));
        legacyIngredients.forEach(ing => {
          if (ing.cost != null) boughtLogSetIfMissing();
          if (m.weekStart && ing.cost != null) { /* handled below */ }
        });
        if (m.weekStart){
          (m.ingredients || []).forEach(ing => {
            if (ing.bought) boughtLog[m.weekStart + ':' + ing.id] = true;
          });
        }
        m.versions = [{ effectiveFrom: m.weekStart || currentWeekStart, ingredients: legacyIngredients }];
        delete m.weekStart;
        delete m.color;
        delete m.ingredients;
      });
      const legacyPriceRaw = localStorage.getItem(LS_KEYS.legacyPrice);
      if (legacyPriceRaw){
        try {
          const legacyPrice = JSON.parse(legacyPriceRaw);
          Object.keys(legacyPrice).forEach(k => {
            ingredientLibrary[k] = { name: k, cost: legacyPrice[k] };
          });
        } catch(e){}
      }
      saveTypes(); saveItems(); saveMeals(); saveBoughtLog(); saveIngredientLibrary();
      localStorage.removeItem(LS_KEYS.legacyTags);
      localStorage.removeItem(LS_KEYS.legacyPrice);
    } catch(e){ /* ignore malformed legacy data */ }
  }
  function boughtLogSetIfMissing(){}
})();

if (types.length === 0){
  types.push({ id: uid(), name: 'Food', color: COLOR_PALETTE[0] });
  saveTypes();
}

function saveItems(){ localStorage.setItem(LS_KEYS.items, JSON.stringify(items)); }
function saveTypes(){ localStorage.setItem(LS_KEYS.types, JSON.stringify(types)); }
function saveMeals(){ localStorage.setItem(LS_KEYS.meals, JSON.stringify(meals)); }
function saveBoughtLog(){ localStorage.setItem(LS_KEYS.boughtLog, JSON.stringify(boughtLog)); }
function saveIngredientLibrary(){ localStorage.setItem(LS_KEYS.ingLib, JSON.stringify(ingredientLibrary)); }
function saveExtraGroceryItems(){ localStorage.setItem(LS_KEYS.extraGrocery, JSON.stringify(extraGroceryItems)); }
function persistCurrentWeek(){ localStorage.setItem(LS_KEYS.week, currentWeekStart); }

/* ─── PAGE NAV ─── */
function showPage(name, btnEl, fromBottom){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  qs('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  const idx = name === 'pantry' ? 0 : 1;
  const navTabs = document.querySelectorAll('.nav-tab');
  const bottomBtns = document.querySelectorAll('.bottom-nav-btn');
  if (navTabs[idx]) navTabs[idx].classList.add('active');
  if (bottomBtns[idx]) bottomBtns[idx].classList.add('active');
}

/* ─── UNIT SELECT (custom unit toggle) ─── */
function onUnitSelectChange(selectId, customInputId){
  const sel = qs(selectId);
  const customInput = qs(customInputId);
  customInput.style.display = (sel.value === 'custom') ? 'block' : 'none';
}

/* ═══════════════════════════ THEMES ═══════════════════════════ */
function hexToRgba(hex, a){
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0,2), 16);
  const g = parseInt(hex.substring(2,4), 16);
  const b = parseInt(hex.substring(4,6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const LIGHT_NEUTRALS = {
  bg: '#f4f5f7', surface: '#ffffff', text: '#252830', textMid: '#555c6b', textDim: '#8a9099',
  inputBorder: '#dde0e8', success: '#4a8c72', danger: '#c0523a', warning: '#c98a2e'
};

function buildTheme(base){
  const computed = {
    accentDim: hexToRgba(base.border, base.dark ? 0.10 : 0.07),
    successDim: hexToRgba(base.success, 0.10),
    dangerDim: hexToRgba(base.danger, 0.08),
    warningDim: hexToRgba(base.warning, 0.10)
  };
  return Object.assign({}, computed, base);
}

const THEMES = {
  slate:   buildTheme(Object.assign({ label: 'Slate',   headerBg: '#2c313a', footerBg: '#2c313a', border: '#3d4452', borderLite: '#5a6272' }, LIGHT_NEUTRALS)),
  ocean:   buildTheme(Object.assign({ label: 'Ocean',   headerBg: '#0e3460', footerBg: '#0e3460', border: '#1a5276', borderLite: '#2e6f95' }, LIGHT_NEUTRALS)),
  forest:  buildTheme(Object.assign({ label: 'Forest',  headerBg: '#134a30', footerBg: '#134a30', border: '#1e6b45', borderLite: '#2f8a5c' }, LIGHT_NEUTRALS)),
  crimson: buildTheme(Object.assign({ label: 'Crimson', headerBg: '#5e1010', footerBg: '#5e1010', border: '#8b1a1a', borderLite: '#a83232' }, LIGHT_NEUTRALS)),
  violet:  buildTheme(Object.assign({ label: 'Violet',  headerBg: '#3d1d5e', footerBg: '#3d1d5e', border: '#5b2c8b', borderLite: '#7443ab' }, LIGHT_NEUTRALS)),
  teal:    buildTheme(Object.assign({ label: 'Teal',    headerBg: '#074a4a', footerBg: '#074a4a', border: '#0f6b6b', borderLite: '#1c8c8c' }, LIGHT_NEUTRALS)),
  cocoa:   buildTheme(Object.assign({ label: 'Cocoa',   headerBg: '#4a2510', footerBg: '#4a2510', border: '#6b3a1f', borderLite: '#8a4f2c' }, LIGHT_NEUTRALS)),
  dark:    buildTheme({
    label: 'Dark', dark: true,
    bg: '#12141e', surface: '#191c28', text: '#e2e4ef', textMid: '#b0b4c4', textDim: '#6b7180',
    inputBorder: '#2a2e3d', headerBg: '#0d0f16', footerBg: '#0d0f16', border: '#4a5568', borderLite: '#5f6b80',
    success: '#45b98a', danger: '#e0685a', warning: '#d99b3f'
  })
};

function applyTheme(key){
  const t = THEMES[key] || THEMES.slate;
  const root = document.documentElement.style;
  root.setProperty('--bg', t.bg);
  root.setProperty('--surface', t.surface);
  root.setProperty('--card', t.surface);
  root.setProperty('--border', t.border);
  root.setProperty('--border-lite', t.borderLite);
  root.setProperty('--accent', t.border);
  root.setProperty('--accent-dim', t.accentDim);
  root.setProperty('--header-bg', t.headerBg);
  root.setProperty('--footer-bg', t.footerBg);
  root.setProperty('--text', t.text);
  root.setProperty('--text-mid', t.textMid);
  root.setProperty('--text-dim', t.textDim);
  root.setProperty('--input-border', t.inputBorder);
  root.setProperty('--success', t.success);
  root.setProperty('--success-dim', t.successDim);
  root.setProperty('--danger', t.danger);
  root.setProperty('--danger-dim', t.dangerDim);
  root.setProperty('--warning', t.warning);
  root.setProperty('--warning-dim', t.warningDim);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', t.headerBg);
}

function selectTheme(key){
  currentTheme = key;
  localStorage.setItem(LS_KEYS.theme, key);
  applyTheme(key);
  renderThemeSwatches();
}

function renderThemeSwatches(){
  const grid = qs('theme-swatch-grid');
  if (!grid) return;
  grid.innerHTML = Object.keys(THEMES).map(key => {
    const t = THEMES[key];
    const selected = currentTheme === key;
    return `<button type="button" class="theme-pill${selected ? ' selected' : ''}" style="background:${t.headerBg};" onclick="selectTheme('${key}')">${selected ? '<span class="theme-check">✓</span> ' : ''}${t.label}</button>`;
  }).join('');
}

/* ═══════════════════ COLOR SWATCH PICKER (shared) ═══════════════════ */
function renderColorGrid(containerId, selected){
  const grid = qs(containerId);
  const sel = selected || COLOR_PALETTE[0];
  grid.dataset.selected = sel;
  grid.innerHTML = COLOR_PALETTE.map(c =>
    `<button type="button" class="color-swatch${c === sel ? ' selected' : ''}" style="background:${c}" data-color="${c}" onclick="selectColorSwatch('${containerId}','${c}')"></button>`
  ).join('');
}
function selectColorSwatch(containerId, color){
  const grid = qs(containerId);
  grid.dataset.selected = color;
  grid.querySelectorAll('.color-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === color);
  });
}

/* ═══════════════════════════ TYPES ═══════════════════════════ */
function refreshTypeSelects(){
  const opts = types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  qs('item-type').innerHTML = opts;
  qs('edit-item-type').innerHTML = opts;

  const restockOpts = '<option value="all">All Types</option>' +
    types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  const restockSel = qs('restock-type-filter');
  const prevVal = restockSel.value || 'all';
  restockSel.innerHTML = restockOpts;
  restockSel.value = types.some(t => t.id === prevVal) ? prevVal : 'all';
}

function openTypeModal(){
  qs('new-type-name').value = '';
  qs('editing-type-id').value = '';
  qs('type-save-btn').textContent = 'Add Type';
  renderColorGrid('new-type-color-grid', COLOR_PALETTE[2]);
  renderTypeList();
  qs('type-modal-overlay').classList.remove('hidden');
}
function closeTypeModal(){
  qs('type-modal-overlay').classList.add('hidden');
  refreshTypeSelects();
  renderPantry();
  renderRestockEstimate();
}

function renderTypeList(){
  const wrap = qs('type-list');
  if (types.length === 0){
    wrap.innerHTML = '<p class="empty-msg">No types yet.</p>';
    return;
  }
  wrap.innerHTML = types.map(t => `
    <div class="settings-row">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="group-dot" style="background:${t.color};"></span>
        <span class="settings-row-label">${esc(t.name)}</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn-sm btn-edit" onclick="editTypeInline('${t.id}')">Edit</button>
        <button class="btn-sm btn-delete" onclick="deleteTypeConfirm('${t.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function editTypeInline(id){
  const t = types.find(x => x.id === id);
  if (!t) return;
  qs('new-type-name').value = t.name;
  qs('editing-type-id').value = t.id;
  qs('type-save-btn').textContent = 'Update Type';
  renderColorGrid('new-type-color-grid', t.color);
}

function saveType(){
  const name = qs('new-type-name').value.trim();
  if (!name){ alert('Please enter a type name.'); return; }
  const color = qs('new-type-color-grid').dataset.selected || COLOR_PALETTE[0];
  const editingId = qs('editing-type-id').value;
  if (editingId){
    const t = types.find(x => x.id === editingId);
    if (t){ t.name = name; t.color = color; }
  } else {
    types.push({ id: uid(), name, color });
  }
  saveTypes();
  qs('new-type-name').value = '';
  qs('editing-type-id').value = '';
  qs('type-save-btn').textContent = 'Add Type';
  renderColorGrid('new-type-color-grid', COLOR_PALETTE[2]);
  renderTypeList();
  refreshTypeSelects();
  renderPantry();
  renderRestockEstimate();
}

function deleteTypeConfirm(id){
  if (!confirm('Delete this type? Items using it will move to "Other".')) return;
  items.forEach(i => { if (i.typeId === id) i.typeId = null; });
  types = types.filter(t => t.id !== id);
  saveTypes(); saveItems();
  renderTypeList();
  refreshTypeSelects();
  renderPantry();
  renderRestockEstimate();
}

/* ═══════════════════════════ SUPPLIES (PANTRY) ═══════════════════════════ */
function recomputeStatus(item){
  if (item.currentCount != null){
    if (item.currentCount <= 0) item.status = 'out';
    else if (item.targetCount != null && item.currentCount < item.targetCount) item.status = 'low';
    else item.status = 'ok';
  }
}

function resolveUnitFromInputs(selectId, customInputId){
  const sel = qs(selectId);
  if (sel.value === 'custom'){
    const custom = qs(customInputId).value.trim();
    return custom || 'unit';
  }
  return sel.value;
}

function saveItem(){
  const name = qs('item-name').value.trim();
  if (!name){ alert('Please enter an item name.'); return; }
  const typeId = qs('item-type').value || null;
  const unit = resolveUnitFromInputs('item-unit', 'item-unit-custom');
  const priceRaw = qs('item-price').value;
  const pricePerUnit = priceRaw === '' ? null : Math.max(0, parseFloat(priceRaw));
  const currentRaw = qs('item-current').value;
  const targetRaw = qs('item-target').value;
  const currentCount = currentRaw === '' ? null : Math.max(0, parseInt(currentRaw, 10));
  const targetCount = targetRaw === '' ? null : Math.max(0, parseInt(targetRaw, 10));
  const item = { id: uid(), name, typeId, unit, pricePerUnit, currentCount, targetCount, status: 'ok' };
  recomputeStatus(item);
  items.push(item);
  saveItems();
  qs('item-name').value = '';
  qs('item-price').value = '';
  qs('item-current').value = '';
  qs('item-target').value = '';
  qs('item-unit').value = 'piece';
  qs('item-unit-custom').style.display = 'none';
  qs('item-unit-custom').value = '';
  renderPantry();
  renderRestockEstimate();
}

function adjustCount(id, delta){
  const item = items.find(i => i.id === id);
  if (!item || item.currentCount == null) return;
  item.currentCount = Math.max(0, item.currentCount + delta);
  recomputeStatus(item);
  saveItems();
  renderPantry();
  renderRestockEstimate();
}

function toggleStatus(id, status){
  const item = items.find(i => i.id === id);
  if (!item) return;
  if (item.status === status){
    if (item.currentCount != null) recomputeStatus(item);
    else item.status = 'ok';
  } else {
    item.status = status;
    if (status === 'out' && item.currentCount != null) item.currentCount = 0;
  }
  saveItems();
  renderPantry();
  renderRestockEstimate();
}

function setPantryFilter(filter, btnEl){
  pantryFilter = filter;
  document.querySelectorAll('#pantry-filter-pills .filter-pill').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
  renderPantry();
}

function editItem(id){
  const item = items.find(i => i.id === id);
  if (!item) return;
  refreshTypeSelects();
  qs('edit-item-id').value = item.id;
  qs('edit-item-name').value = item.name;
  qs('edit-item-type').value = item.typeId || '';
  const isPreset = UNIT_PRESETS.includes(item.unit);
  qs('edit-item-unit').value = isPreset ? item.unit : 'custom';
  qs('edit-item-unit-custom').style.display = isPreset ? 'none' : 'block';
  qs('edit-item-unit-custom').value = isPreset ? '' : item.unit;
  qs('edit-item-price').value = item.pricePerUnit != null ? item.pricePerUnit : '';
  qs('edit-item-current').value = item.currentCount != null ? item.currentCount : '';
  qs('edit-item-target').value = item.targetCount != null ? item.targetCount : '';
  qs('item-modal-overlay').classList.remove('hidden');
}
function closeItemModal(){ qs('item-modal-overlay').classList.add('hidden'); }

function updateItem(){
  const id = qs('edit-item-id').value;
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.name = qs('edit-item-name').value.trim() || item.name;
  item.typeId = qs('edit-item-type').value || null;
  item.unit = resolveUnitFromInputs('edit-item-unit', 'edit-item-unit-custom');
  const priceRaw = qs('edit-item-price').value;
  item.pricePerUnit = priceRaw === '' ? null : Math.max(0, parseFloat(priceRaw));
  const currentRaw = qs('edit-item-current').value;
  const targetRaw = qs('edit-item-target').value;
  item.currentCount = currentRaw === '' ? null : Math.max(0, parseInt(currentRaw, 10));
  item.targetCount = targetRaw === '' ? null : Math.max(0, parseInt(targetRaw, 10));
  recomputeStatus(item);
  saveItems();
  closeItemModal();
  renderPantry();
  renderRestockEstimate();
}

function deleteItem(){
  const id = qs('edit-item-id').value;
  if (!confirm('Delete this item?')) return;
  items = items.filter(i => i.id !== id);
  saveItems();
  closeItemModal();
  renderPantry();
  renderRestockEstimate();
}

function deleteItemInline(id){
  if (!confirm('Delete this item?')) return;
  items = items.filter(i => i.id !== id);
  saveItems();
  renderPantry();
  renderRestockEstimate();
}

function renderPantry(){
  const search = qs('pantry-search').value.trim().toLowerCase();
  const filtered = items.filter(i => {
    if (pantryFilter !== 'all' && i.status !== pantryFilter) return false;
    if (search && !i.name.toLowerCase().includes(search)) return false;
    return true;
  });
  const wrap = qs('pantry-list');
  if (filtered.length === 0){
    wrap.innerHTML = '<p class="empty-msg">' +
      (items.length === 0 ? 'No items yet. Add your first item above!' : 'No items match your search/filter.') +
      '</p>';
    return;
  }
  const groups = {};
  filtered.forEach(i => {
    const key = (i.typeId && types.find(t => t.id === i.typeId)) ? i.typeId : 'none';
    if (!groups[key]) groups[key] = [];
    groups[key].push(i);
  });
  let html = '';
  types.forEach(t => {
    if (!groups[t.id]) return;
    html += renderGroupHtml(t.name, t.color, groups[t.id]);
  });
  if (groups['none']) html += renderGroupHtml('Other', null, groups['none']);
  wrap.innerHTML = html;
}

function renderGroupHtml(name, color, groupItems){
  const dotStyle = color ? `background:${color};` : 'background:var(--text-dim);';
  let html = `<div class="pantry-group">
    <div class="group-header"><span class="group-dot" style="${dotStyle}"></span><span class="group-name">${esc(name)}</span><span class="group-count">(${groupItems.length})</span></div>`;
  groupItems.forEach(i => html += renderItemCardHtml(i, color));
  html += `</div>`;
  return html;
}

function renderItemCardHtml(item, typeColor){
  const statusLabelMap = { ok:'In Stock', low:'Needs Refill', out:'Out of Stock' };
  const unitLabel = esc(item.unit || 'piece');
  const countHtml = (item.currentCount != null)
    ? `<span class="pantry-count"><strong>${item.currentCount}</strong>${item.targetCount != null ? ' / ' + item.targetCount : ''} ${unitLabel}</span>`
    : '';
  const priceHtml = (item.pricePerUnit != null)
    ? `<span class="pantry-count">₱${formatMoney(item.pricePerUnit)} / ${unitLabel}</span>`
    : '';
  const trackedActions = (item.currentCount != null)
    ? `<button class="btn-pantry-action" onclick="adjustCount('${item.id}', -1)">− Used</button>
       <button class="btn-pantry-action" onclick="adjustCount('${item.id}', 1)">+ Restock</button>`
    : '';
  return `
    <div class="pantry-item status-${item.status}" style="--tag-color:${typeColor || 'var(--border)'}">
      <div class="pantry-item-top">
        <div>
          <div class="pantry-item-name">${esc(item.name)}</div>
          <div class="pantry-item-meta">
            ${countHtml}
            ${priceHtml}
          </div>
        </div>
        <span class="status-badge ${item.status}">${statusLabelMap[item.status]}</span>
      </div>
      <div class="pantry-actions">
        ${trackedActions}
        <button class="btn-pantry-action warn" onclick="toggleStatus('${item.id}','low')">${item.status === 'low' ? 'Undo Refill' : 'Needs Refill'}</button>
        <button class="btn-pantry-action danger" onclick="toggleStatus('${item.id}','out')">${item.status === 'out' ? 'Back In Stock' : 'Out of Stock'}</button>
        <span style="flex:1;"></span>
        <button class="icon-btn" onclick="editItem('${item.id}')" title="Edit">✎</button>
        <button class="icon-btn" onclick="deleteItemInline('${item.id}')" title="Delete">🗑</button>
      </div>
    </div>`;
}

/* ═══════════════════════════ RESTOCK COST ESTIMATE ═══════════════════════════ */
function neededQtyForItem(item, mode){
  const needsRestock = item.status !== 'ok';
  if (mode === 'min'){
    return needsRestock ? 1 : 0;
  }
  // mode === 'max'
  if (item.targetCount != null){
    const cur = item.currentCount || 0;
    return Math.max(item.targetCount - cur, 0);
  }
  return needsRestock ? 1 : 0;
}

function renderRestockEstimate(){
  const filterTypeId = qs('restock-type-filter').value;
  const relevant = items.filter(i => filterTypeId === 'all' || i.typeId === filterTypeId);
  let minCost = 0, maxCost = 0;
  relevant.forEach(i => {
    const price = i.pricePerUnit || 0;
    minCost += neededQtyForItem(i, 'min') * price;
    maxCost += neededQtyForItem(i, 'max') * price;
  });
  qs('restock-min-cost').textContent = '₱' + formatMoney(minCost);
  qs('restock-max-cost').textContent = '₱' + formatMoney(maxCost);
}

/* ═══════════════════════════ MEAL PLANNER ═══════════════════════════ */
function renderPlanner(){
  renderWeekNav();
  renderMealWeekList();
  renderGroceryList();
}

function renderWeekNav(){
  qs('week-range-text').textContent = formatWeekRange(currentWeekStart);
  const thisMonday = toISODate(getMonday(new Date()));
  qs('week-sub-text').textContent = (currentWeekStart === thisMonday) ? 'This week' : 'Tap to pick a week';
}

function changeWeek(delta){
  currentWeekStart = toISODate(addDays(fromISODate(currentWeekStart), delta * 7));
  persistCurrentWeek();
  renderPlanner();
}

function goToThisWeek(){
  currentWeekStart = toISODate(getMonday(new Date()));
  persistCurrentWeek();
  renderPlanner();
}

/* Returns the ingredient version applicable to a given week (the most
   recent version whose effectiveFrom <= weekStart), or null if the meal
   didn't exist yet that week. */
function getVersionForWeek(meal, weekStart){
  let chosen = null;
  for (const v of meal.versions){
    if (v.effectiveFrom <= weekStart) chosen = v;
    else break;
  }
  return chosen;
}

/* Edits ingredients starting from `weekStart` forward. Past versions
   (effectiveFrom < weekStart) are preserved untouched; any version dated
   on/after weekStart is superseded by this edit. */
function setIngredientsForWeek(meal, weekStart, ingredients){
  meal.versions = meal.versions.filter(v => v.effectiveFrom < weekStart);
  meal.versions.push({ effectiveFrom: weekStart, ingredients });
  meal.versions.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

function mealsVisibleForWeek(weekStart){
  return meals.filter(m => m.versions.length > 0 && m.versions[0].effectiveFrom <= weekStart);
}

function computeMealStats(ingredients, weekStart){
  const total = ingredients.length;
  const bought = ingredients.filter(ing => !!boughtLog[weekStart + ':' + ing.id]).length;
  let status, label;
  if (total === 0){ status = 'none'; label = 'No Ingredients'; }
  else if (bought === total){ status = 'complete'; label = 'Complete'; }
  else if (bought === 0){ status = 'missing'; label = 'Missing'; }
  else { status = 'partial'; label = 'Partial'; }
  return { total, bought, status, label };
}

function renderMealWeekList(){
  const wrap = qs('meal-week-list');
  const weekMeals = mealsVisibleForWeek(currentWeekStart);
  if (weekMeals.length === 0){
    wrap.innerHTML = '<p class="empty-msg">No meals planned for this week yet.</p>';
    return;
  }
  let html = '';
  for (let day = 0; day < 7; day++){
    const dayMeals = weekMeals.filter(m => m.day === day);
    if (dayMeals.length === 0) continue;
    const dateObj = addDays(fromISODate(currentWeekStart), day);
    const dateLabel = dateObj.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    html += `<div class="day-group">
      <div class="day-group-header"><span class="day-group-name">${DAY_NAMES[day]}</span><span class="day-group-date">${dateLabel}</span></div>`;
    dayMeals.forEach(m => html += renderMealCardHtml(m));
    html += `</div>`;
  }
  wrap.innerHTML = html || '<p class="empty-msg">No meals planned for this week yet.</p>';
}

function renderMealCardHtml(meal){
  const version = getVersionForWeek(meal, currentWeekStart);
  const ingredients = version ? version.ingredients : [];
  const stats = computeMealStats(ingredients, currentWeekStart);
  const chips = ingredients.map(ing => {
    const bought = !!boughtLog[currentWeekStart + ':' + ing.id];
    return `<label class="ing-chip ${bought ? 'bought' : ''}">
      <input type="checkbox" ${bought ? 'checked' : ''} onchange="toggleIngredientBought('${ing.id}')" />
      ${esc(ing.name)}${ing.cost != null ? ` <span class="ing-cost">₱${formatMoney(ing.cost)}</span>` : ''}
    </label>`;
  }).join('');
  return `
    <div class="meal-card">
      <div class="meal-card-top">
        <div>
          <div class="meal-name">${esc(meal.name)}</div>
          <div class="meal-ingredient-count">${stats.total === 0 ? 'No ingredients added' : stats.bought + ' / ' + stats.total + ' bought'}</div>
        </div>
        <span class="meal-status ${stats.status}">${stats.label}</span>
      </div>
      ${chips ? `<div class="meal-ingredient-chips">${chips}</div>` : ''}
      <div class="meal-card-actions">
        <button class="btn-sm btn-edit" onclick="editMeal('${meal.id}')">Edit</button>
        <button class="btn-sm btn-delete" onclick="deleteMealInline('${meal.id}')">Delete</button>
      </div>
    </div>`;
}

function toggleIngredientBought(ingId){
  const key = currentWeekStart + ':' + ingId;
  boughtLog[key] = !boughtLog[key];
  saveBoughtLog();
  renderMealWeekList();
  renderGroceryList();
}

function renderGroceryList(){
  const weekMeals = mealsVisibleForWeek(currentWeekStart).slice().sort((a, b) => a.day - b.day);
  const rows = [];
  weekMeals.forEach(m => {
    const version = getVersionForWeek(m, currentWeekStart);
    const ingredients = version ? version.ingredients : [];
    ingredients.forEach(ing => rows.push({ mealName: m.name, ing, extra: false }));
  });
  const extras = extraGroceryItems[currentWeekStart] || [];
  extras.forEach(ing => rows.push({ mealName: 'Other', ing, extra: true }));

  rows.sort((a, b) => {
    const aBought = !!boughtLog[currentWeekStart + ':' + a.ing.id];
    const bBought = !!boughtLog[currentWeekStart + ':' + b.ing.id];
    return (aBought ? 1 : 0) - (bBought ? 1 : 0);
  });

  const totalCost = rows.reduce((s, r) => s + (r.ing.cost || 0), 0);
  const boughtCost = rows.filter(r => boughtLog[currentWeekStart + ':' + r.ing.id]).reduce((s, r) => s + (r.ing.cost || 0), 0);
  const remainingCost = totalCost - boughtCost;
  qs('grocery-total-cost').textContent = '₱' + formatMoney(totalCost);
  qs('grocery-bought-cost').textContent = '₱' + formatMoney(boughtCost);
  qs('grocery-remaining-cost').textContent = '₱' + formatMoney(remainingCost);

  const wrap = qs('grocery-list');
  if (rows.length === 0){
    wrap.innerHTML = '<p class="empty-msg">Nothing to buy yet — plan a meal first, or add an item below.</p>';
    return;
  }
  wrap.innerHTML = rows.map(r => {
    const bought = !!boughtLog[currentWeekStart + ':' + r.ing.id];
    const deleteBtn = r.extra
      ? `<button class="icon-btn" onclick="deleteExtraGroceryItem('${r.ing.id}')" title="Remove">🗑</button>`
      : '';
    return `
    <div class="grocery-item ${bought ? 'bought' : ''}">
      <input type="checkbox" ${bought ? 'checked' : ''} onchange="toggleIngredientBought('${r.ing.id}')" />
      <div class="grocery-item-info">
        <div class="grocery-item-name">${esc(r.ing.name)}</div>
        <div class="grocery-item-meal">${esc(r.mealName)}</div>
      </div>
      <div class="grocery-item-cost">${r.ing.cost != null ? '₱' + formatMoney(r.ing.cost) : '—'}</div>
      ${deleteBtn}
    </div>`;
  }).join('');
}

function addExtraGroceryItem(){
  const name = qs('grocery-extra-name').value.trim();
  if (!name){ alert('Please enter an item name.'); return; }
  const costRaw = qs('grocery-extra-cost').value;
  const cost = costRaw === '' ? null : Math.max(0, parseFloat(costRaw));
  if (cost != null){
    ingredientLibrary[name.toLowerCase()] = { name, cost };
    saveIngredientLibrary();
  }
  if (!extraGroceryItems[currentWeekStart]) extraGroceryItems[currentWeekStart] = [];
  extraGroceryItems[currentWeekStart].push({ id: uid(), name, cost });
  saveExtraGroceryItems();
  qs('grocery-extra-name').value = '';
  qs('grocery-extra-cost').value = '';
  renderGroceryList();
}

function deleteExtraGroceryItem(id){
  const list = extraGroceryItems[currentWeekStart] || [];
  extraGroceryItems[currentWeekStart] = list.filter(i => i.id !== id);
  delete boughtLog[currentWeekStart + ':' + id];
  saveExtraGroceryItems();
  saveBoughtLog();
  renderGroceryList();
}

/* ─── MEAL MODAL ─── */
function refreshIngredientSuggestions(){
  const names = Object.values(ingredientLibrary).map(e => e.name);
  qs('ingredient-suggestions').innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join('');
}

function openMealModal(){
  qs('meal-modal-title').textContent = 'Add Meal';
  qs('editing-meal-id').value = '';
  qs('meal-name').value = '';
  qs('meal-day').value = '0';
  qs('meal-effective-note').style.display = 'none';
  qs('meal-ingredient-list').innerHTML = '';
  refreshIngredientSuggestions();
  addIngredientRow();
  qs('meal-delete-btn').style.display = 'none';
  qs('meal-modal-overlay').classList.remove('hidden');
}
function closeMealModal(){ qs('meal-modal-overlay').classList.add('hidden'); }

function addIngredientRow(name = '', cost = null, ingId = null){
  const list = qs('meal-ingredient-list');
  const rowId = ingId || uid();
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.dataset.rowId = rowId;
  row.innerHTML = `
    <input type="text" class="ing-name-input" list="ingredient-suggestions" placeholder="e.g. Chicken thighs" value="${esc(name)}" oninput="onIngredientNameInput(this)" />
    <input type="number" class="ing-cost-input" placeholder="₱ cost" min="0" step="0.01" value="${cost != null ? cost : ''}" />
    <button type="button" class="icon-btn" onclick="this.closest('.ingredient-row').remove()" title="Remove">✕</button>
  `;
  list.appendChild(row);
}

function onIngredientNameInput(inputEl){
  const row = inputEl.closest('.ingredient-row');
  const costInput = row.querySelector('.ing-cost-input');
  const key = inputEl.value.trim().toLowerCase();
  if (key && ingredientLibrary[key] != null && costInput.value === ''){
    costInput.value = ingredientLibrary[key].cost != null ? ingredientLibrary[key].cost : '';
  }
}

function editMeal(id){
  const meal = meals.find(m => m.id === id);
  if (!meal) return;
  qs('meal-modal-title').textContent = 'Edit Meal';
  qs('editing-meal-id').value = meal.id;
  qs('meal-name').value = meal.name;
  qs('meal-day').value = String(meal.day);

  const note = qs('meal-effective-note');
  note.style.display = 'block';
  note.textContent = 'Ingredient changes apply from ' + formatWeekRange(currentWeekStart) + ' forward. Earlier weeks keep their original list.';

  qs('meal-ingredient-list').innerHTML = '';
  refreshIngredientSuggestions();
  const version = getVersionForWeek(meal, currentWeekStart);
  const ingredients = version ? version.ingredients : [];
  if (ingredients.length === 0) addIngredientRow();
  else ingredients.forEach(ing => addIngredientRow(ing.name, ing.cost, ing.id));
  qs('meal-delete-btn').style.display = 'block';
  qs('meal-modal-overlay').classList.remove('hidden');
}

function collectIngredientsFromModal(){
  const rows = Array.from(qs('meal-ingredient-list').querySelectorAll('.ingredient-row'));
  return rows.map(row => {
    const name = row.querySelector('.ing-name-input').value.trim();
    if (!name) return null;
    const costRaw = row.querySelector('.ing-cost-input').value;
    const cost = costRaw === '' ? null : Math.max(0, parseFloat(costRaw));
    return { id: row.dataset.rowId, name, cost };
  }).filter(Boolean);
}

function saveMeal(){
  const name = qs('meal-name').value.trim();
  if (!name){ alert('Please enter a meal name.'); return; }
  const day = parseInt(qs('meal-day').value, 10);
  const ingredients = collectIngredientsFromModal();

  ingredients.forEach(ing => {
    if (ing.cost != null){
      ingredientLibrary[ing.name.trim().toLowerCase()] = { name: ing.name.trim(), cost: ing.cost };
    }
  });
  saveIngredientLibrary();

  const editingId = qs('editing-meal-id').value;
  if (editingId){
    const meal = meals.find(m => m.id === editingId);
    if (meal){
      meal.name = name;
      meal.day = day;
      setIngredientsForWeek(meal, currentWeekStart, ingredients);
    }
  } else {
    meals.push({ id: uid(), day, name, versions: [{ effectiveFrom: currentWeekStart, ingredients }] });
  }
  saveMeals();
  closeMealModal();
  renderPlanner();
}

function deleteMeal(){
  const id = qs('editing-meal-id').value;
  if (!id) return;
  if (!confirm('Delete this meal and all its planned occurrences?')) return;
  meals = meals.filter(m => m.id !== id);
  saveMeals();
  closeMealModal();
  renderPlanner();
}

function deleteMealInline(id){
  if (!confirm('Delete this meal and all its planned occurrences?')) return;
  meals = meals.filter(m => m.id !== id);
  saveMeals();
  renderPlanner();
}

/* ─── CALENDAR / WEEK PICKER ─── */
function openCalendar(){
  calViewDate = fromISODate(currentWeekStart);
  renderCalendar();
  qs('cal-overlay').classList.remove('hidden');
}
function closeCalendar(){ qs('cal-overlay').classList.add('hidden'); }
function calPrevMonth(){ calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth()-1, 1); renderCalendar(); }
function calNextMonth(){ calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth()+1, 1); renderCalendar(); }

function renderCalendar(){
  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();
  qs('cal-month-label').textContent = new Date(year, month, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' });

  const daysInMonth = new Date(year, month+1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const todayISO = toISODate(new Date());
  const selStartISO = currentWeekStart;
  const selEndISO = toISODate(addDays(fromISODate(currentWeekStart), 6));

  const weeksWithData = new Set();
  meals.forEach(m => m.versions.forEach(v => weeksWithData.add(v.effectiveFrom)));

  let html = '';
  for (let i = 0; i < firstWeekday; i++) html += '<span class="cal-empty"></span>';
  for (let d = 1; d <= daysInMonth; d++){
    const dateObj = new Date(year, month, d);
    const iso = toISODate(dateObj);
    const classes = ['cal-day'];
    if (iso === todayISO) classes.push('today');
    if (iso >= selStartISO && iso <= selEndISO) classes.push('in-selected-week');
    if (iso === selStartISO) classes.push('week-start');
    if (iso === selEndISO) classes.push('week-end');
    const dayMonday = toISODate(getMonday(dateObj));
    if (weeksWithData.has(dayMonday) || mealsVisibleForWeek(dayMonday).length > 0) classes.push('has-data');
    html += `<span class="${classes.join(' ')}" onclick="selectWeekFromDate('${iso}')">${d}</span>`;
  }
  qs('cal-grid').innerHTML = html;
}

function selectWeekFromDate(iso){
  currentWeekStart = toISODate(getMonday(fromISODate(iso)));
  persistCurrentWeek();
  renderPlanner();
  closeCalendar();
}

/* ═══════════════════════════ SETTINGS ═══════════════════════════ */
function openSettings(){ renderThemeSwatches(); qs('settings-overlay').classList.remove('hidden'); }
function closeSettings(){ qs('settings-overlay').classList.add('hidden'); }

function exportData(){
  const payload = { items, types, meals, boughtLog, ingredientLibrary, extraGroceryItems, exportedAt: new Date().toISOString(), version: 'stashimo-v0.2' };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stashimo-backup-' + toISODate(new Date()) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(event){
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.items) || !Array.isArray(data.types) || !Array.isArray(data.meals)){
        alert('This file doesn\'t look like a valid Stashimo backup.');
        return;
      }
      if (!confirm('Importing will replace all current data. Continue?')) return;
      items = data.items;
      types = data.types;
      meals = data.meals;
      boughtLog = data.boughtLog || {};
      ingredientLibrary = data.ingredientLibrary || {};
      extraGroceryItems = data.extraGroceryItems || {};
      saveItems(); saveTypes(); saveMeals(); saveBoughtLog(); saveIngredientLibrary(); saveExtraGroceryItems();
      refreshTypeSelects();
      renderPantry();
      renderRestockEstimate();
      renderPlanner();
      closeSettings();
      alert('Import complete!');
    } catch(e){
      alert('Could not read that file.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function resetAllData(){
  if (!confirm('This will permanently erase all supplies, types, and meal plans. Continue?')) return;
  items = [];
  meals = [];
  boughtLog = {};
  ingredientLibrary = {};
  extraGroceryItems = {};
  types = [{ id: uid(), name: 'Food', color: COLOR_PALETTE[0] }];
  saveItems(); saveTypes(); saveMeals(); saveBoughtLog(); saveIngredientLibrary(); saveExtraGroceryItems();
  refreshTypeSelects();
  renderPantry();
  renderRestockEstimate();
  renderPlanner();
  closeSettings();
}

/* ═══════════════════════════ TUTORIAL ═══════════════════════════ */
function openTutorial(){ tutStep = 0; updateTutorialUI(); qs('tutorial-overlay').classList.remove('hidden'); }
function closeTutorial(){ qs('tutorial-overlay').classList.add('hidden'); }
function goToTutStep(i){ tutStep = i; updateTutorialUI(); }
function tutNav(dir){
  const next = tutStep + dir;
  if (next < 0 || next > 1) return;
  tutStep = next;
  updateTutorialUI();
}
function updateTutorialUI(){
  document.querySelectorAll('.tutorial-step').forEach((el, i) => el.classList.toggle('active', i === tutStep));
  document.querySelectorAll('.tut-dot').forEach((el, i) => el.classList.toggle('active', i === tutStep));
  qs('tut-prev').style.visibility = tutStep === 0 ? 'hidden' : 'visible';
  const nextBtn = qs('tut-next');
  if (tutStep === 1){
    nextBtn.textContent = 'Done';
    nextBtn.onclick = closeTutorial;
  } else {
    nextBtn.textContent = 'Next';
    nextBtn.onclick = () => tutNav(1);
  }
}

/* ═══════════════════════════ INIT ═══════════════════════════ */
applyTheme(currentTheme);
refreshTypeSelects();
renderPantry();
renderRestockEstimate();
renderPlanner();

if (!localStorage.getItem(LS_KEYS.tut)){
  openTutorial();
  localStorage.setItem(LS_KEYS.tut, '1');
}