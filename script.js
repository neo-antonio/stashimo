/* ══════════════════════════════════════════════════════
   STASHIMO v0.1 — Pantry Tracker & Meal Planner
   All data stored locally on-device via localStorage.
   ══════════════════════════════════════════════════════ */

/* ─── CONSTANTS ─── */
const COLOR_PALETTE = [
  '#b98bd6', '#8bb6d6', '#8bd6b0', '#d6c48b', '#d68b9e',
  '#a3d68b', '#d6a08b', '#8ba3d6', '#c78bd6', '#8bd6c9'
];
const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const LS_KEYS = {
  items: 'stashimo_items',
  tags: 'stashimo_tags',
  meals: 'stashimo_meals',
  price: 'stashimo_price_memory',
  week: 'stashimo_current_week',
  tut: 'stashimo_tutorial_seen'
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
let tags = loadJSON(LS_KEYS.tags, []);
let meals = loadJSON(LS_KEYS.meals, []);
let priceMemory = loadJSON(LS_KEYS.price, {});
let currentWeekStart = localStorage.getItem(LS_KEYS.week) || toISODate(getMonday(new Date()));
let pantryFilter = 'all';
let calViewDate = fromISODate(currentWeekStart);
let tutStep = 0;

if (tags.length === 0){
  tags.push({ id: uid(), name: 'General', color: COLOR_PALETTE[0] });
}

function saveItems(){ localStorage.setItem(LS_KEYS.items, JSON.stringify(items)); }
function saveTags(){ localStorage.setItem(LS_KEYS.tags, JSON.stringify(tags)); }
function saveMeals(){ localStorage.setItem(LS_KEYS.meals, JSON.stringify(meals)); }
function savePriceMemory(){ localStorage.setItem(LS_KEYS.price, JSON.stringify(priceMemory)); }
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

/* ═══════════════════════════ TAGS ═══════════════════════════ */
function refreshTagSelects(){
  const opts = tags.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  qs('item-tag').innerHTML = opts;
  qs('edit-item-tag').innerHTML = opts;
}

function openTagModal(){
  qs('new-tag-name').value = '';
  qs('editing-tag-id').value = '';
  qs('tag-save-btn').textContent = 'Add Tag';
  renderColorGrid('new-tag-color-grid', COLOR_PALETTE[0]);
  renderTagList();
  qs('tag-modal-overlay').classList.remove('hidden');
}
function closeTagModal(){
  qs('tag-modal-overlay').classList.add('hidden');
  refreshTagSelects();
  renderPantry();
}

function renderTagList(){
  const wrap = qs('tag-list');
  if (tags.length === 0){
    wrap.innerHTML = '<p class="empty-msg">No tags yet.</p>';
    return;
  }
  wrap.innerHTML = tags.map(t => `
    <div class="settings-row">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="group-dot" style="background:${t.color};"></span>
        <span class="settings-row-label">${esc(t.name)}</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn-sm btn-edit" onclick="editTagInline('${t.id}')">Edit</button>
        <button class="btn-sm btn-delete" onclick="deleteTagConfirm('${t.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function editTagInline(id){
  const t = tags.find(x => x.id === id);
  if (!t) return;
  qs('new-tag-name').value = t.name;
  qs('editing-tag-id').value = t.id;
  qs('tag-save-btn').textContent = 'Update Tag';
  renderColorGrid('new-tag-color-grid', t.color);
}

function saveTag(){
  const name = qs('new-tag-name').value.trim();
  if (!name){ alert('Please enter a tag name.'); return; }
  const color = qs('new-tag-color-grid').dataset.selected || COLOR_PALETTE[0];
  const editingId = qs('editing-tag-id').value;
  if (editingId){
    const t = tags.find(x => x.id === editingId);
    if (t){ t.name = name; t.color = color; }
  } else {
    tags.push({ id: uid(), name, color });
  }
  saveTags();
  qs('new-tag-name').value = '';
  qs('editing-tag-id').value = '';
  qs('tag-save-btn').textContent = 'Add Tag';
  renderColorGrid('new-tag-color-grid', COLOR_PALETTE[0]);
  renderTagList();
  refreshTagSelects();
  renderPantry();
}

function deleteTagConfirm(id){
  if (!confirm('Delete this tag? Items using it will move to "Other".')) return;
  items.forEach(i => { if (i.tagId === id) i.tagId = null; });
  tags = tags.filter(t => t.id !== id);
  saveTags(); saveItems();
  renderTagList();
  refreshTagSelects();
  renderPantry();
}

/* ═══════════════════════════ PANTRY ═══════════════════════════ */
function recomputeStatus(item){
  if (item.currentCount != null){
    if (item.currentCount <= 0) item.status = 'out';
    else if (item.targetCount != null && item.currentCount < item.targetCount) item.status = 'low';
    else item.status = 'ok';
  }
}

function saveItem(){
  const name = qs('item-name').value.trim();
  if (!name){ alert('Please enter an item name.'); return; }
  const type = qs('item-type').value;
  const tagId = qs('item-tag').value || null;
  const currentRaw = qs('item-current').value;
  const targetRaw = qs('item-target').value;
  const currentCount = currentRaw === '' ? null : Math.max(0, parseInt(currentRaw, 10));
  const targetCount = targetRaw === '' ? null : Math.max(0, parseInt(targetRaw, 10));
  const item = { id: uid(), name, type, tagId, currentCount, targetCount, status: 'ok' };
  recomputeStatus(item);
  items.push(item);
  saveItems();
  qs('item-name').value = '';
  qs('item-current').value = '';
  qs('item-target').value = '';
  renderPantry();
}

function adjustCount(id, delta){
  const item = items.find(i => i.id === id);
  if (!item || item.currentCount == null) return;
  item.currentCount = Math.max(0, item.currentCount + delta);
  recomputeStatus(item);
  saveItems();
  renderPantry();
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
  refreshTagSelects();
  qs('edit-item-id').value = item.id;
  qs('edit-item-name').value = item.name;
  qs('edit-item-type').value = item.type;
  qs('edit-item-tag').value = item.tagId || '';
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
  item.type = qs('edit-item-type').value;
  item.tagId = qs('edit-item-tag').value || null;
  const currentRaw = qs('edit-item-current').value;
  const targetRaw = qs('edit-item-target').value;
  item.currentCount = currentRaw === '' ? null : Math.max(0, parseInt(currentRaw, 10));
  item.targetCount = targetRaw === '' ? null : Math.max(0, parseInt(targetRaw, 10));
  recomputeStatus(item);
  saveItems();
  closeItemModal();
  renderPantry();
}

function deleteItem(){
  const id = qs('edit-item-id').value;
  if (!confirm('Delete this item?')) return;
  items = items.filter(i => i.id !== id);
  saveItems();
  closeItemModal();
  renderPantry();
}

function deleteItemInline(id){
  if (!confirm('Delete this item?')) return;
  items = items.filter(i => i.id !== id);
  saveItems();
  renderPantry();
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
    const key = (i.tagId && tags.find(t => t.id === i.tagId)) ? i.tagId : 'none';
    if (!groups[key]) groups[key] = [];
    groups[key].push(i);
  });
  let html = '';
  tags.forEach(t => {
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

function renderItemCardHtml(item, tagColor){
  const statusLabelMap = { ok:'In Stock', low:'Needs Refill', out:'Out of Stock' };
  const chipBg = tagColor || 'var(--text-dim)';
  const countHtml = (item.currentCount != null)
    ? `<span class="pantry-count"><strong>${item.currentCount}</strong>${item.targetCount != null ? ' / ' + item.targetCount : ''} in stock</span>`
    : '';
  const trackedActions = (item.currentCount != null)
    ? `<button class="btn-pantry-action" onclick="adjustCount('${item.id}', -1)">− Used</button>
       <button class="btn-pantry-action" onclick="adjustCount('${item.id}', 1)">+ Restock</button>`
    : '';
  return `
    <div class="pantry-item status-${item.status}" style="--tag-color:${tagColor || 'var(--border)'}">
      <div class="pantry-item-top">
        <div>
          <div class="pantry-item-name">${esc(item.name)}</div>
          <div class="pantry-item-meta">
            <span class="tag-chip" style="background:${chipBg};">${item.type === 'food' ? 'Food' : 'Supply'}</span>
            ${countHtml}
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

function computeMealStats(meal){
  const total = meal.ingredients.length;
  const bought = meal.ingredients.filter(i => i.bought).length;
  let status, label;
  if (total === 0){ status = 'none'; label = 'No Ingredients'; }
  else if (bought === total){ status = 'complete'; label = 'Complete'; }
  else if (bought === 0){ status = 'missing'; label = 'Missing'; }
  else { status = 'partial'; label = 'Partial'; }
  return { total, bought, status, label };
}

function renderMealWeekList(){
  const wrap = qs('meal-week-list');
  const weekMeals = meals.filter(m => m.weekStart === currentWeekStart);
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
  const chips = meal.ingredients.map(ing => `
    <label class="ing-chip ${ing.bought ? 'bought' : ''}">
      <input type="checkbox" ${ing.bought ? 'checked' : ''} onchange="toggleIngredientBought('${meal.id}','${ing.id}')" />
      ${esc(ing.name)}${ing.cost != null ? ` <span class="ing-cost">₱${formatMoney(ing.cost)}</span>` : ''}
    </label>`).join('');
  return `
    <div class="meal-card" style="--meal-color:${meal.color}">
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

function renderGroceryList(){
  const weekMeals = meals.filter(m => m.weekStart === currentWeekStart).slice().sort((a,b) => a.day - b.day);
  const rows = [];
  weekMeals.forEach(m => {
    m.ingredients.forEach(ing => rows.push({ mealId: m.id, mealName: m.name, mealColor: m.color, ing }));
  });
  rows.sort((a, b) => (a.ing.bought ? 1 : 0) - (b.ing.bought ? 1 : 0));

  const totalCost = rows.reduce((s, r) => s + (r.ing.cost || 0), 0);
  const boughtCost = rows.filter(r => r.ing.bought).reduce((s, r) => s + (r.ing.cost || 0), 0);
  const remainingCost = totalCost - boughtCost;
  qs('grocery-total-cost').textContent = '₱' + formatMoney(totalCost);
  qs('grocery-bought-cost').textContent = '₱' + formatMoney(boughtCost);
  qs('grocery-remaining-cost').textContent = '₱' + formatMoney(remainingCost);

  const wrap = qs('grocery-list');
  if (rows.length === 0){
    wrap.innerHTML = '<p class="empty-msg">Nothing to buy yet — plan a meal first.</p>';
    return;
  }
  wrap.innerHTML = rows.map(r => `
    <div class="grocery-item ${r.ing.bought ? 'bought' : ''}">
      <input type="checkbox" ${r.ing.bought ? 'checked' : ''} onchange="toggleIngredientBought('${r.mealId}','${r.ing.id}')" />
      <div class="grocery-item-info">
        <div class="grocery-item-name">${esc(r.ing.name)}</div>
        <div class="grocery-item-meal"><span class="group-dot" style="width:7px;height:7px;background:${r.mealColor};"></span>${esc(r.mealName)}</div>
      </div>
      <div class="grocery-item-cost">${r.ing.cost != null ? '₱' + formatMoney(r.ing.cost) : '—'}</div>
    </div>
  `).join('');
}

/* ─── MEAL MODAL ─── */
function pickNextMealColor(){ return COLOR_PALETTE[meals.length % COLOR_PALETTE.length]; }

function openMealModal(){
  qs('meal-modal-title').textContent = 'Add Meal';
  qs('editing-meal-id').value = '';
  qs('meal-name').value = '';
  qs('meal-day').value = '0';
  renderColorGrid('meal-color-grid', pickNextMealColor());
  qs('meal-ingredient-list').innerHTML = '';
  addIngredientRow();
  qs('meal-delete-btn').style.display = 'none';
  qs('meal-modal-overlay').classList.remove('hidden');
}
function closeMealModal(){ qs('meal-modal-overlay').classList.add('hidden'); }

function addIngredientRow(name = '', cost = null, bought = false, ingId = null){
  const list = qs('meal-ingredient-list');
  const rowId = ingId || uid();
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.dataset.rowId = rowId;
  row.innerHTML = `
    <input type="text" class="ing-name-input" placeholder="e.g. Chicken thighs" value="${esc(name)}" oninput="onIngredientNameInput(this)" />
    <input type="number" class="ing-cost-input" placeholder="₱ cost" min="0" step="0.01" value="${cost != null ? cost : ''}" />
    <input type="checkbox" class="ing-bought-input" ${bought ? 'checked' : ''} title="Already bought" />
    <button type="button" class="icon-btn" onclick="this.closest('.ingredient-row').remove()" title="Remove">✕</button>
  `;
  list.appendChild(row);
}

function onIngredientNameInput(inputEl){
  const row = inputEl.closest('.ingredient-row');
  const costInput = row.querySelector('.ing-cost-input');
  const key = inputEl.value.trim().toLowerCase();
  if (key && priceMemory[key] != null && costInput.value === ''){
    costInput.value = priceMemory[key];
  }
}

function editMeal(id){
  const meal = meals.find(m => m.id === id);
  if (!meal) return;
  qs('meal-modal-title').textContent = 'Edit Meal';
  qs('editing-meal-id').value = meal.id;
  qs('meal-name').value = meal.name;
  qs('meal-day').value = String(meal.day);
  renderColorGrid('meal-color-grid', meal.color);
  qs('meal-ingredient-list').innerHTML = '';
  if (meal.ingredients.length === 0) addIngredientRow();
  else meal.ingredients.forEach(ing => addIngredientRow(ing.name, ing.cost, ing.bought, ing.id));
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
    const bought = row.querySelector('.ing-bought-input').checked;
    return { id: row.dataset.rowId, name, cost, bought };
  }).filter(Boolean);
}

function saveMeal(){
  const name = qs('meal-name').value.trim();
  if (!name){ alert('Please enter a meal name.'); return; }
  const day = parseInt(qs('meal-day').value, 10);
  const color = qs('meal-color-grid').dataset.selected || COLOR_PALETTE[0];
  const ingredients = collectIngredientsFromModal();

  ingredients.forEach(ing => {
    if (ing.cost != null) priceMemory[ing.name.trim().toLowerCase()] = ing.cost;
  });
  savePriceMemory();

  const editingId = qs('editing-meal-id').value;
  if (editingId){
    const meal = meals.find(m => m.id === editingId);
    if (meal){ meal.name = name; meal.day = day; meal.color = color; meal.ingredients = ingredients; }
  } else {
    meals.push({ id: uid(), weekStart: currentWeekStart, day, name, color, ingredients });
  }
  saveMeals();
  closeMealModal();
  renderPlanner();
}

function deleteMeal(){
  const id = qs('editing-meal-id').value;
  if (!id) return;
  if (!confirm('Delete this meal and its ingredients?')) return;
  meals = meals.filter(m => m.id !== id);
  saveMeals();
  closeMealModal();
  renderPlanner();
}

function deleteMealInline(id){
  if (!confirm('Delete this meal and its ingredients?')) return;
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
function openSettings(){ qs('settings-overlay').classList.remove('hidden'); }
function closeSettings(){ qs('settings-overlay').classList.add('hidden'); }

function exportData(){
  const payload = { items, tags, meals, priceMemory, exportedAt: new Date().toISOString(), version: 'stashimo-v0.1' };
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
      if (!data || !Array.isArray(data.items) || !Array.isArray(data.tags) || !Array.isArray(data.meals)){
        alert('This file doesn\'t look like a valid Stashimo backup.');
        return;
      }
      if (!confirm('Importing will replace all current data. Continue?')) return;
      items = data.items;
      tags = data.tags;
      meals = data.meals;
      priceMemory = data.priceMemory || {};
      saveItems(); saveTags(); saveMeals(); savePriceMemory();
      refreshTagSelects();
      renderPantry();
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
  if (!confirm('This will permanently erase all pantry items, tags, and meal plans. Continue?')) return;
  items = [];
  meals = [];
  priceMemory = {};
  tags = [{ id: uid(), name: 'General', color: COLOR_PALETTE[0] }];
  saveItems(); saveTags(); saveMeals(); savePriceMemory();
  refreshTagSelects();
  renderPantry();
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
refreshTagSelects();
renderPantry();
renderPlanner();

if (!localStorage.getItem(LS_KEYS.tut)){
  openTutorial();
  localStorage.setItem(LS_KEYS.tut, '1');
}
