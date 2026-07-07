/* ══════════════════════════════════════════════════════
   STASHIMO v0.3: Supplies Tracker & Meal Planner
   All data stored locally on-device via localStorage.
   ══════════════════════════════════════════════════════ */

/* ─── OUTLINE ICONS (no emoji) ─── */
const ICON_EDIT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>';

/* ─── CONSTANTS ─── */
// Distinct hues only, no near-duplicate purples/greens/blues.
const COLOR_PALETTE = [
  '#23272f', '#ffffff', '#e08283', '#e0a458', '#e0c15c',
  '#7fb08f', '#5fa8a0', '#6f9bd6', '#7b7fd6', '#a67bd6', '#d67ba0', '#b08a6b'
];
const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const UNIT_PRESETS = ['piece','pack','bottle','box','can','kg','g','liter','ml'];

const LS_KEYS = {
  items: 'stashimo_items',
  types: 'stashimo_types',
  meals: 'stashimo_meals',
  ingLib: 'stashimo_ingredient_library',
  extraGrocery: 'stashimo_extra_grocery',
  week: 'stashimo_current_week',
  theme: 'stashimo_theme',
  tut: 'stashimo_tutorial_seen',
  // legacy keys used for one-time migration
  legacyTags: 'stashimo_tags',
  legacyPrice: 'stashimo_price_memory',
  legacyBoughtLog: 'stashimo_bought_log'
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
let ingredientLibrary = loadJSON(LS_KEYS.ingLib, {}); // { lowercaseName: { name, cost } }
let extraGroceryItems = loadJSON(LS_KEYS.extraGrocery, {}); // { weekStart: [{id, name, cost, bought}] }
let currentWeekStart = localStorage.getItem(LS_KEYS.week) || toISODate(getMonday(new Date()));
let currentTheme = localStorage.getItem(LS_KEYS.theme) || 'slate';
let pantryFilter = 'all';
let calViewDate = fromISODate(currentWeekStart);
let tutStep = 0;

/* ─── ONE-TIME MIGRATION ─── */
(function migrateLegacyData(){
  // v0.1 -> current: tags/items/meals shape
  const legacyTagsRaw = localStorage.getItem(LS_KEYS.legacyTags);
  if (legacyTagsRaw && types.length === 0){
    try {
      const legacyTags = JSON.parse(legacyTagsRaw);
      types = legacyTags.map(t => ({ id: t.id, name: t.name, color: t.color }));
      items.forEach(i => {
        if (i.tagId !== undefined){ i.typeId = i.tagId; delete i.tagId; }
        if (i.type !== undefined){ delete i.type; }
        if (i.unit === undefined) i.unit = 'piece';
      });
      const legacyPriceRaw = localStorage.getItem(LS_KEYS.legacyPrice);
      if (legacyPriceRaw){
        try {
          const legacyPrice = JSON.parse(legacyPriceRaw);
          Object.keys(legacyPrice).forEach(k => { ingredientLibrary[k] = { name: k, cost: legacyPrice[k] }; });
        } catch(e){}
      }
      saveTypes(); saveItems();
      localStorage.removeItem(LS_KEYS.legacyTags);
      localStorage.removeItem(LS_KEYS.legacyPrice);
    } catch(e){ /* ignore malformed legacy data */ }
  }

  // v0.2/v0.3 -> current: pricePerUnit -> minPrice/minUnits
  let itemsChanged = false;
  items.forEach(i => {
    if (i.pricePerUnit !== undefined){
      i.minPrice = i.pricePerUnit;
      i.minUnits = 1;
      delete i.pricePerUnit;
      itemsChanged = true;
    }
    if (i.minPrice === undefined) i.minPrice = null;
    if (i.minUnits === undefined) i.minUnits = 1;
  });
  if (itemsChanged) saveItems();

  // v0.2 recurring/versioned meals -> flat per-week meals (uses legacy bought log if present)
  const legacyBoughtLog = loadJSON(LS_KEYS.legacyBoughtLog, null);
  let mealsChanged = false;
  meals = meals.map(m => {
    if (!m.versions) return m; // already flat
    mealsChanged = true;
    const lastVersion = m.versions[m.versions.length - 1];
    const weekStart = lastVersion.effectiveFrom;
    const ingredients = (lastVersion.ingredients || []).map(ing => ({
      id: ing.id, name: ing.name, cost: ing.cost != null ? ing.cost : null,
      bought: legacyBoughtLog ? !!legacyBoughtLog[weekStart + ':' + ing.id] : false
    }));
    return { id: m.id, weekStart, day: m.day, name: m.name, ingredients };
  });
  if (mealsChanged) saveMeals();

  // extra grocery items: add inline bought flag using legacy bought log if present
  let extrasChanged = false;
  Object.keys(extraGroceryItems).forEach(weekStart => {
    extraGroceryItems[weekStart] = (extraGroceryItems[weekStart] || []).map(it => {
      if (it.bought === undefined){
        extrasChanged = true;
        return Object.assign({}, it, { bought: legacyBoughtLog ? !!legacyBoughtLog[weekStart + ':' + it.id] : false });
      }
      return it;
    });
  });
  if (extrasChanged) saveExtraGroceryItems();

  if (legacyBoughtLog) localStorage.removeItem(LS_KEYS.legacyBoughtLog);
})();

if (types.length === 0){
  types.push({ id: uid(), name: 'Food', color: COLOR_PALETTE[0] });
  saveTypes();
}

function saveItems(){ localStorage.setItem(LS_KEYS.items, JSON.stringify(items)); }
function saveTypes(){ localStorage.setItem(LS_KEYS.types, JSON.stringify(types)); }
function saveMeals(){ localStorage.setItem(LS_KEYS.meals, JSON.stringify(meals)); }
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
  const minPriceRaw = qs('item-min-price').value;
  const minPrice = minPriceRaw === '' ? null : Math.max(0, parseFloat(minPriceRaw));
  const minUnitsRaw = qs('item-min-units').value;
  const minUnits = minUnitsRaw === '' ? 1 : Math.max(1, parseInt(minUnitsRaw, 10));
  const currentRaw = qs('item-current').value;
  const targetRaw = qs('item-target').value;
  const currentCount = currentRaw === '' ? null : Math.max(0, parseInt(currentRaw, 10));
  const targetCount = targetRaw === '' ? null : Math.max(0, parseInt(targetRaw, 10));
  const item = { id: uid(), name, typeId, unit, minPrice, minUnits, currentCount, targetCount, status: 'ok' };
  recomputeStatus(item);
  items.push(item);
  saveItems();
  qs('item-name').value = '';
  qs('item-min-price').value = '';
  qs('item-min-units').value = '';
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
  qs('edit-item-min-price').value = item.minPrice != null ? item.minPrice : '';
  qs('edit-item-min-units').value = (item.minUnits != null && item.minUnits !== 1) ? item.minUnits : '';
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
  const minPriceRaw = qs('edit-item-min-price').value;
  item.minPrice = minPriceRaw === '' ? null : Math.max(0, parseFloat(minPriceRaw));
  const minUnitsRaw = qs('edit-item-min-units').value;
  item.minUnits = minUnitsRaw === '' ? 1 : Math.max(1, parseInt(minUnitsRaw, 10));
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
  const priceHtml = (item.minPrice != null)
    ? (item.minUnits && item.minUnits > 1
        ? `<span class="pantry-count">₱${formatMoney(item.minPrice)} per ${item.minUnits} ${unitLabel}</span>`
        : `<span class="pantry-count">₱${formatMoney(item.minPrice)} / ${unitLabel}</span>`)
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
        <button class="icon-btn" onclick="editItem('${item.id}')" title="Edit">${ICON_EDIT}</button>
        <button class="icon-btn" onclick="deleteItemInline('${item.id}')" title="Delete">${ICON_TRASH}</button>
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

/* Cost to acquire `qty` units of an item, respecting bulk/minimum-purchase
   pricing: you can only buy in batches of `minUnits` at `minPrice` each. */
function batchCostForQty(item, qty){
  if (qty <= 0 || item.minPrice == null) return 0;
  const units = (item.minUnits && item.minUnits > 0) ? item.minUnits : 1;
  const batches = Math.ceil(qty / units);
  return batches * item.minPrice;
}

function renderRestockEstimate(){
  const filterTypeId = qs('restock-type-filter').value;
  const relevant = items.filter(i => filterTypeId === 'all' || i.typeId === filterTypeId);
  let minCost = 0, maxCost = 0;
  relevant.forEach(i => {
    minCost += batchCostForQty(i, neededQtyForItem(i, 'min'));
    maxCost += batchCostForQty(i, neededQtyForItem(i, 'max'));
  });
  qs('restock-min-cost').textContent = '₱' + formatMoney(minCost);
  qs('restock-max-cost').textContent = '₱' + formatMoney(maxCost);
}

/* ═══════════════════════════ MEAL PLANNER ═══════════════════════════
   Meals belong to exactly one week (no recurrence). Each ingredient
   carries its own bought flag directly. */
function renderPlanner(){
  renderWeekNav();
  renderMealWeekList();
  renderGroceryList();
  renderPastMealsDropdown();
  renderIngredientLibraryDropdown();
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

function mealsForCurrentWeek(){
  return meals.filter(m => m.weekStart === currentWeekStart);
}

function computeMealStats(meal){
  const total = meal.ingredients.length;
  const bought = meal.ingredients.filter(ing => !!ing.bought).length;
  let status, label;
  if (total === 0){ status = 'none'; label = 'No Ingredients'; }
  else if (bought === total){ status = 'complete'; label = 'Complete'; }
  else if (bought === 0){ status = 'missing'; label = 'Missing'; }
  else { status = 'partial'; label = 'Partial'; }
  return { total, bought, status, label };
}

function renderMealWeekList(){
  const wrap = qs('meal-week-list');
  const weekMeals = mealsForCurrentWeek();
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
  const stats = computeMealStats(meal);
  const chips = meal.ingredients.map(ing => {
    return `<label class="ing-chip ${ing.bought ? 'bought' : ''}">
      <input type="checkbox" ${ing.bought ? 'checked' : ''} onchange="toggleIngredientBought('${meal.id}','${ing.id}')" />
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

function toggleIngredientBought(mealId, ingId){
  const meal = meals.find(m => m.id === mealId);
  if (!meal) return;
  const ing = meal.ingredients.find(i => i.id === ingId);
  if (!ing) return;
  ing.bought = !ing.bought;
  saveMeals();
  renderMealWeekList();
  renderGroceryList();
}

function toggleExtraBought(extraId){
  const list = extraGroceryItems[currentWeekStart] || [];
  const item = list.find(i => i.id === extraId);
  if (!item) return;
  item.bought = !item.bought;
  saveExtraGroceryItems();
  renderGroceryList();
}

function renderGroceryList(){
  const weekMeals = mealsForCurrentWeek().slice().sort((a, b) => a.day - b.day);
  const rows = [];
  weekMeals.forEach(m => {
    m.ingredients.forEach(ing => rows.push({ mealName: m.name, ing, mealId: m.id, extra: false }));
  });
  const extras = extraGroceryItems[currentWeekStart] || [];
  extras.forEach(ing => rows.push({ mealName: 'Other', ing, extra: true }));

  rows.sort((a, b) => (a.ing.bought ? 1 : 0) - (b.ing.bought ? 1 : 0));

  const totalCost = rows.reduce((s, r) => s + (r.ing.cost || 0), 0);
  const boughtCost = rows.filter(r => r.ing.bought).reduce((s, r) => s + (r.ing.cost || 0), 0);
  const remainingCost = totalCost - boughtCost;
  qs('grocery-total-cost').textContent = '₱' + formatMoney(totalCost);
  qs('grocery-bought-cost').textContent = '₱' + formatMoney(boughtCost);
  qs('grocery-remaining-cost').textContent = '₱' + formatMoney(remainingCost);

  const wrap = qs('grocery-list');
  if (rows.length === 0){
    wrap.innerHTML = '<p class="empty-msg">Nothing to buy yet. Plan a meal first, or add an item below.</p>';
    return;
  }
  wrap.innerHTML = rows.map(r => {
    const toggleCall = r.extra ? `toggleExtraBought('${r.ing.id}')` : `toggleIngredientBought('${r.mealId}','${r.ing.id}')`;
    const deleteBtn = r.extra
      ? `<button class="icon-btn" onclick="deleteExtraGroceryItem('${r.ing.id}')" title="Remove">${ICON_TRASH}</button>`
      : '';
    return `
    <div class="grocery-item ${r.ing.bought ? 'bought' : ''}">
      <input type="checkbox" ${r.ing.bought ? 'checked' : ''} onchange="${toggleCall}" />
      <div class="grocery-item-info">
        <div class="grocery-item-name">${esc(r.ing.name)}</div>
        <div class="grocery-item-meal">${esc(r.mealName)}</div>
      </div>
      <div class="grocery-item-cost">${r.ing.cost != null ? '₱' + formatMoney(r.ing.cost) : '-'}</div>
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
  extraGroceryItems[currentWeekStart].push({ id: uid(), name, cost, bought: false });
  saveExtraGroceryItems();
  qs('grocery-extra-name').value = '';
  qs('grocery-extra-cost').value = '';
  renderGroceryList();
  renderIngredientLibraryDropdown();
}

function deleteExtraGroceryItem(id){
  const list = extraGroceryItems[currentWeekStart] || [];
  extraGroceryItems[currentWeekStart] = list.filter(i => i.id !== id);
  saveExtraGroceryItems();
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
    <button type="button" class="icon-btn" onclick="this.closest('.ingredient-row').remove()" title="Remove">${ICON_CLOSE}</button>
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
  qs('meal-ingredient-list').innerHTML = '';
  refreshIngredientSuggestions();
  if (meal.ingredients.length === 0) addIngredientRow();
  else meal.ingredients.forEach(ing => addIngredientRow(ing.name, ing.cost, ing.id));
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
  const collected = collectIngredientsFromModal();

  collected.forEach(ing => {
    if (ing.cost != null){
      ingredientLibrary[ing.name.trim().toLowerCase()] = { name: ing.name.trim(), cost: ing.cost };
    }
  });
  saveIngredientLibrary();

  const editingId = qs('editing-meal-id').value;
  if (editingId){
    const meal = meals.find(m => m.id === editingId);
    if (meal){
      const oldIngredients = meal.ingredients;
      meal.name = name;
      meal.day = day;
      meal.ingredients = collected.map(ni => {
        const old = oldIngredients.find(oi => oi.id === ni.id);
        return { id: ni.id, name: ni.name, cost: ni.cost, bought: old ? !!old.bought : false };
      });
    }
  } else {
    const ingredients = collected.map(ing => Object.assign({ bought: false }, ing));
    meals.push({ id: uid(), weekStart: currentWeekStart, day, name, ingredients });
  }
  saveMeals();
  closeMealModal();
  renderPlanner();
}

function deleteMeal(){
  const id = qs('editing-meal-id').value;
  if (!id) return;
  if (!confirm('Delete this meal?')) return;
  meals = meals.filter(m => m.id !== id);
  saveMeals();
  closeMealModal();
  renderPlanner();
}

function deleteMealInline(id){
  if (!confirm('Delete this meal?')) return;
  meals = meals.filter(m => m.id !== id);
  saveMeals();
  renderPlanner();
}

/* ─── REUSE A PAST MEAL ─── */
function renderPastMealsDropdown(){
  const wrap = qs('past-meals-list');
  if (!wrap) return;
  const search = (qs('past-meal-search').value || '').trim().toLowerCase();
  const pastMeals = meals
    .filter(m => m.weekStart < currentWeekStart)
    .filter(m => !search || m.name.toLowerCase().includes(search))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  if (pastMeals.length === 0){
    wrap.innerHTML = '<p class="empty-msg">No past meals yet.</p>';
    return;
  }
  wrap.innerHTML = pastMeals.map(m => `
    <div class="reuse-item">
      <div class="reuse-item-info">
        <div class="reuse-item-name">${esc(m.name)}</div>
        <div class="reuse-item-meta">${formatWeekRange(m.weekStart)} · ${m.ingredients.length} ingredient${m.ingredients.length === 1 ? '' : 's'}</div>
      </div>
      <button class="btn-sm btn-edit" onclick="reuseMeal('${m.id}')">Add to This Week</button>
    </div>
  `).join('');
}

function reuseMeal(id){
  const meal = meals.find(m => m.id === id);
  if (!meal) return;
  const ingredients = meal.ingredients.map(ing => ({ id: uid(), name: ing.name, cost: ing.cost, bought: false }));
  meals.push({ id: uid(), weekStart: currentWeekStart, day: meal.day, name: meal.name, ingredients });
  saveMeals();
  renderPlanner();
}

/* ─── ALL INGREDIENTS (LIBRARY) ─── */
function renderIngredientLibraryDropdown(){
  const wrap = qs('ingredient-library-list');
  if (!wrap) return;
  const search = (qs('ingredient-library-search').value || '').trim().toLowerCase();
  const entries = Object.values(ingredientLibrary)
    .filter(e => !search || e.name.toLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (entries.length === 0){
    wrap.innerHTML = '<p class="empty-msg">No ingredients saved yet.</p>';
    return;
  }
  wrap.innerHTML = entries.map(e => `
    <div class="library-item">
      <div class="library-item-info">
        <div class="library-item-name">${esc(e.name)}</div>
        <div class="library-item-meta">${e.cost != null ? '₱' + formatMoney(e.cost) : 'No saved price'}</div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="btn-sm btn-edit" onclick="addLibraryIngredientToGrocery('${esc(e.name).replace(/'/g, "\\'")}')">Add to List</button>
        <button class="icon-btn" onclick="deleteLibraryIngredient('${esc(e.name).replace(/'/g, "\\'")}')" title="Delete">${ICON_TRASH}</button>
      </div>
    </div>
  `).join('');
}

function deleteLibraryIngredient(name){
  const key = name.toLowerCase();
  if (!confirm(`Delete "${name}" from your saved ingredient list?`)) return;
  const deleteEverywhere = confirm(
    `Also remove "${name}" from every meal and week where it was already added?\n\n` +
    `OK = delete it everywhere\n` +
    `Cancel = just remove it from this saved list (existing meals keep it)`
  );
  delete ingredientLibrary[key];
  saveIngredientLibrary();
  if (deleteEverywhere){
    meals.forEach(m => { m.ingredients = m.ingredients.filter(ing => ing.name.toLowerCase() !== key); });
    saveMeals();
    Object.keys(extraGroceryItems).forEach(w => {
      extraGroceryItems[w] = (extraGroceryItems[w] || []).filter(ing => ing.name.toLowerCase() !== key);
    });
    saveExtraGroceryItems();
    renderMealWeekList();
    renderGroceryList();
  }
  renderIngredientLibraryDropdown();
  refreshIngredientSuggestions();
}

function addLibraryIngredientToGrocery(name){
  const entry = ingredientLibrary[name.toLowerCase()];
  const cost = entry ? entry.cost : null;
  if (!extraGroceryItems[currentWeekStart]) extraGroceryItems[currentWeekStart] = [];
  extraGroceryItems[currentWeekStart].push({ id: uid(), name, cost, bought: false });
  saveExtraGroceryItems();
  renderGroceryList();
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
  const weeksWithData = new Set(meals.map(m => m.weekStart));

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
    if (weeksWithData.has(dayMonday)) classes.push('has-data');
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
  const payload = { items, types, meals, ingredientLibrary, extraGroceryItems, exportedAt: new Date().toISOString(), version: 'stashimo-v0.3' };
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
      ingredientLibrary = data.ingredientLibrary || {};
      extraGroceryItems = data.extraGroceryItems || {};
      saveItems(); saveTypes(); saveMeals(); saveIngredientLibrary(); saveExtraGroceryItems();
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
  ingredientLibrary = {};
  extraGroceryItems = {};
  types = [{ id: uid(), name: 'Food', color: COLOR_PALETTE[0] }];
  saveItems(); saveTypes(); saveMeals(); saveIngredientLibrary(); saveExtraGroceryItems();
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