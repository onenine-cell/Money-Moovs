const $ = selector => document.querySelector(selector);
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const defaultData = {
  settings: { nextPayday: '2026-07-24', frequency: 'biweekly', allocations: { Savings: 35, 'Down Payment': 20, Insurance: 9 }, categories: ['Food', 'Gas', 'Shopping', 'Entertainment', 'Bills', 'Other'] },
  paychecks: [], transactions: [], goals: [], subscriptions: []
};
let data = JSON.parse(localStorage.getItem('moneyMoves') || 'null') || JSON.parse(JSON.stringify(defaultData));
data.settings ||= JSON.parse(JSON.stringify(defaultData.settings));
data.settings.allocations ||= { ...defaultData.settings.allocations };
data.settings.categories ||= [...defaultData.settings.categories];
data.paychecks ||= []; data.transactions ||= []; data.goals ||= []; data.subscriptions ||= [];
if ('Gas' in data.settings.allocations) {
  delete data.settings.allocations.Gas;
  data.paychecks.forEach(paycheck => delete paycheck.allocations?.Gas);
}
const save = () => localStorage.setItem('moneyMoves', JSON.stringify(data));
save();

const money = value => fmt.format(Number(value || 0));
const today = () => new Date().toISOString().slice(0, 10);
const escape = value => String(value).replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const currentPaycheck = () => data.paychecks.at(-1);
const income = () => currentPaycheck()?.amount || 0;
const allocated = () => currentPaycheck() ? Object.values(currentPaycheck().allocations || {}).reduce((sum, amount) => sum + Number(amount || 0), 0) : 0;
const transactionsTotal = () => data.transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
const goalsTotal = () => data.goals.reduce((sum, goal) => sum + Number(goal.saved || 0), 0);
const daysUntil = () => Math.max(0, Math.ceil((new Date(data.settings.nextPayday + 'T00:00') - new Date()) / 86400000));
const PAYCHECK_RESET_WINDOW = 30 * 60 * 1000;
const resetWindowRemaining = () => {
  const loggedAt = currentPaycheck()?.loggedAt;
  return loggedAt ? Math.max(0, PAYCHECK_RESET_WINDOW - (Date.now() - loggedAt)) : 0;
};
const paycheckResetIsOpen = () => resetWindowRemaining() > 0;
const payInterval = () => data.settings.frequency === 'weekly' ? 7 : 14;

const monthDate = (year, month, day) => new Date(year, month, Math.min(Math.max(1, Number(day) || 1), new Date(year, month + 1, 0).getDate()));
const currentSubscriptionDue = sub => { const now = new Date(); return monthDate(now.getFullYear(), now.getMonth(), sub.dueDay); };
const subscriptionPeriod = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; };
const subscriptionDate = sub => { const now = new Date(); const current = currentSubscriptionDue(sub); return current < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? monthDate(now.getFullYear(), now.getMonth() + 1, sub.dueDay) : current; };
const subscriptionStatus = sub => {
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const due = currentSubscriptionDue(sub); const days = Math.ceil((due - start) / 86400000);
  if (sub.paidFor === subscriptionPeriod()) return { label: 'Paid', color: '#36d890', due };
  if (days < 0) return { label: 'Overdue', color: '#ff7a7a', due };
  if (days === 0) return { label: 'Due today', color: '#ff7a7a', due };
  if (days === 1) return { label: 'Due tomorrow', color: '#ff7a7a', due };
  if (days <= 7) return { label: 'Due soon', color: '#e3bd6d', due };
  return { label: '', color: '', due };
};
const upcomingSubscriptions = () => {
  const payday = new Date(data.settings.nextPayday + 'T23:59:59');
  return data.subscriptions.filter(sub => sub.paidFor !== subscriptionPeriod()).map(sub => ({ ...sub, due: subscriptionStatus(sub).label === 'Overdue' ? currentSubscriptionDue(sub) : subscriptionDate(sub) })).filter(sub => sub.due <= payday).sort((a, b) => a.due - b.due);
};
const subscriptionsReserved = () => upcomingSubscriptions().reduce((sum, sub) => sum + Number(sub.amount || 0), 0);
const available = () => income() - allocated() - transactionsTotal() - goalsTotal() - subscriptionsReserved();
const activity = () => [...data.transactions.map(item => ({ ...item, type: 'spend' })), ...data.paychecks.map(item => ({ name: 'Paycheck', amount: item.amount, date: item.date, type: 'pay' }))].sort((a, b) => b.date.localeCompare(a.date));

function dashboard() {
  const balance = available(), days = daysUntil(), daily = days ? Math.max(0, balance / days) : balance, paycheck = currentPaycheck();
  const downPayment = data.paychecks.reduce((sum, item) => sum + Number(item.allocations?.['Down Payment'] || 0), 0);
  const downPaymentProgress = Math.min(100, downPayment / 5000 * 100);
  $('#dashboard').innerHTML = `<div class="hero"><p class="hero-label">AVAILABLE TO SPEND</p><div class="balance ${balance < 0 ? 'negative' : ''}">${money(balance)}</div><p class="safe">Safe today: ${money(daily)}</p></div><div class="grid"><div class="stat"><p>Current paycheck</p><strong>${money(income())}</strong></div><div class="stat"><p>Spent</p><strong>${money(transactionsTotal())}</strong></div><div class="stat"><p>Allocated</p><strong>${money(allocated())}</strong></div><div class="stat"><p>Next payday</p><strong>${days ? `${days} day${days === 1 ? '' : 's'}` : 'Today'}</strong></div></div><div class="section-title"><h2>Down payment goal</h2></div><article class="card"><div class="row"><div><strong>Down Payment</strong><p>${money(downPayment)} of ${money(5000)}</p></div><strong>${Math.round(downPaymentProgress)}%</strong></div><div class="progress"><i style="width:${downPaymentProgress}%"></i></div></article><div class="section-title"><h2>Allocated this paycheck</h2></div><div class="allocation-list">${paycheck ? Object.entries(paycheck.allocations || {}).map(([name, amount]) => `<article class="card"><div class="row"><div><strong>${escape(name)}</strong><p>${data.settings.allocations[name] || 0}% of paycheck</p></div><strong>${money(amount)}</strong></div><div class="progress"><i style="width:${data.settings.allocations[name] || 0}%"></i></div></article>`).join('') : '<div class="empty">Your allocation cards will appear after you log your first paycheck.</div>'}</div><div class="section-title"><h2>Recent activity</h2><button class="link-btn" data-go="transactions">See all</button></div><div class="card activity">${activity().slice(0, 4).map(item => `<div class="activity-item"><div class="activity-icon">${item.type === 'pay' ? '$' : '-'}</div><div class="activity-main"><strong>${escape(item.name)}</strong><p>${item.date}</p></div><strong class="${item.type === 'pay' ? 'amount-in' : 'amount-out'}">${item.type === 'pay' ? '+' : '-'}${money(item.amount)}</strong></div>`).join('') || '<div class="empty">No activity yet. Your money timeline will show up here.</div>'}</div><div class="section-title"><h2>Smart insight</h2></div><div class="insight">${!paycheck ? 'Log your first paycheck on payday to start tracking your money.' : balance < 0 ? 'You are over your available balance. Review recent spending before making another purchase.' : `You can spend about <b>${money(daily)}</b> a day and stay on track until payday.`}</div>`;
}

function payday() {
  const due = daysUntil() === 0, undoOpen = paycheckResetIsOpen(), recent = currentPaycheck(), remaining = Math.ceil(resetWindowRemaining() / 60000);
  if (undoOpen) setTimeout(() => { if (active === 'payday') render(); }, resetWindowRemaining() + 100);
  $('#payday').innerHTML = undoOpen ? `<div class="payday-box"><p>PAYCHECK LOGGED</p><h2>${money(recent.amount)}</h2><p>Need to fix it? Reset is available for ${remaining} more minute${remaining === 1 ? '' : 's'}.</p><button class="secondary" id="resetRecentPaycheck">Reset this paycheck</button></div>` : `<div class="payday-box"><p>${due ? 'IT\'S PAYDAY' : 'NEXT PAYDAY'}</p><h2>${due ? 'Ready to log it' : new Date(data.settings.nextPayday + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2><p>${due ? 'Enter your paycheck and your plan will update immediately.' : `${daysUntil()} day${daysUntil() === 1 ? '' : 's'} to go`}</p>${due ? '<button class="primary" id="openPayday">Log paycheck</button>' : '<p class="muted">Paycheck entry is locked until payday.</p>'}</div><div class="section-title"><h2>How it works</h2></div><div class="insight">Your paycheck is divided using your Settings. After you log it, you have 30 minutes to reset only that paycheck if you made a mistake.</div>`;
}

function goals() {
  $('#goals').innerHTML = `<div class="section-title"><h2>Your goals</h2></div>${data.goals.map((goal, index) => { const progress = Math.min(100, goal.saved / goal.target * 100); return `<article class="goal-card"><div class="row"><h3>${escape(goal.name)}</h3><button class="link-btn" data-deposit="${index}">Add money</button></div><p>${money(goal.saved)} of ${money(goal.target)}${goal.date ? ` · target ${goal.date}` : ''}</p><div class="progress"><i style="width:${progress}%"></i></div></article>`; }).join('') || '<div class="empty">No goals yet.<br>Create one and move money toward something important.</div>'}<button class="primary" id="addGoal">Create a goal</button>`;
}

function settings() {
  const allocations = data.settings.allocations;
  $('#settings').innerHTML = `<div class="settings"><section class="card setting-group"><h3>Payday schedule</h3><div class="setting-row"><label>Next payday</label><input id="nextPayday" type="date" value="${data.settings.nextPayday}"></div><div class="setting-row"><label>Schedule</label><select id="frequency"><option value="biweekly" ${data.settings.frequency === 'biweekly' ? 'selected' : ''}>Every 2 weeks</option><option value="weekly" ${data.settings.frequency === 'weekly' ? 'selected' : ''}>Weekly</option></select></div></section><section class="card setting-group"><h3>Automatic allocations</h3>${Object.entries(allocations).map(([name, value]) => `<div class="setting-row"><label>${escape(name)}</label><input class="allocation-input" data-name="${escape(name)}" type="number" min="0" max="100" value="${value}"><span>%</span></div>`).join('')}</section><section class="card setting-group"><h3>Data</h3><div class="setting-row"><label>Stored only on this device</label><button class="link-btn" id="exportData">Export backup</button></div><div class="setting-row"><label>Delete every app record</label><button class="link-btn danger-link" id="resetData">Delete all data</button></div></section></div>`;
}

function transactions() {
  const purchases = activity().filter(item => item.type === 'spend');
  const subscriptionItems = data.subscriptions.map(sub => ({ ...sub, due: subscriptionDate(sub), status: subscriptionStatus(sub) })).sort((a, b) => a.due - b.due);
  $('#transactions').innerHTML = `<div class="section-title"><h2>My subscriptions</h2></div><section class="card activity"><div class="row"><div><strong>Reserved before payday</strong><p>This only includes unpaid subscriptions due before payday.</p></div><strong class="amount-out">${money(subscriptionsReserved())}</strong></div>${subscriptionItems.map(sub => `<div class="activity-item"><div class="activity-icon">$</div><div class="activity-main"><strong>${escape(sub.name)}</strong><p>Next charge ${sub.due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${money(sub.amount)} monthly${sub.status.label ? ` · <span style="color:${sub.status.color};font-weight:800">● ${sub.status.label}</span>` : ''}</p></div><div class="subscription-actions">${sub.status.label === 'Paid' ? '' : `<button class="link-btn" data-mark-subscription-paid="${sub.id}">Mark paid</button>`}<button class="link-btn danger-link" data-delete-subscription="${sub.id}">Cancel subscription</button></div></div>`).join('') || '<div class="empty">No subscriptions yet.<br>Add the subscriptions you pay each month.</div>'}<button class="primary" id="addSubscription">Add subscription</button></section><div class="section-title"><h2>Every purchase</h2><button class="link-btn" id="addTransaction">+ Add</button></div><div class="card activity">${purchases.map(item => `<div class="activity-item"><div class="activity-icon">-</div><div class="activity-main"><strong>${escape(item.name)}</strong><p>${escape(item.category)} · ${item.date}${item.notes ? ` · ${escape(item.notes)}` : ''}</p><div class="transaction-actions"><button class="link-btn" data-edit-transaction="${item.id}">Edit</button><button class="link-btn danger-link" data-delete-transaction="${item.id}">Delete</button></div></div><strong class="amount-out">-${money(item.amount)}</strong></div>`).join('') || '<div class="empty">No transactions yet.<br>Tap + to log your first purchase.</div>'}</div><button class="fab" id="addTransactionFab">+ Add transaction</button>`;
}

let active = 'dashboard';
let editingTransactionId = null;
function render() {
  const screens = ['dashboard', 'transactions', 'payday', 'goals', 'settings'];
  screens.forEach(id => { document.getElementById(id).classList.toggle('active', id === active); if (id === active) ({ dashboard, transactions, payday, goals, settings })[id](); });
  $('.topbar h1').textContent = active[0].toUpperCase() + active.slice(1);
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.screen === active));
}

function openTransaction(id) {
  const existing = id ? data.transactions.find(item => item.id === id) : null;
  editingTransactionId = existing?.id || null;
  $('#formTitle').textContent = existing ? 'Edit transaction' : 'Add transaction';
  $('#category').innerHTML = data.settings.categories.map(category => `<option>${escape(category)}</option>`).join('');
  $('#entryForm').reset();
  $('#amount').value = existing?.amount || '';
  $('#name').value = existing?.name || '';
  $('#category').value = existing?.category || data.settings.categories[0];
  $('#entryDate').value = existing?.date || today();
  $('#notes').value = existing?.notes || '';
  $('#entryDialog').showModal();
}

function preview() {
  const amount = Number($('#paycheckAmount').value) || 0;
  const used = Object.values(data.settings.allocations).reduce((sum, value) => sum + Number(value || 0), 0);
  $('#allocationPreview').innerHTML = Object.entries(data.settings.allocations).map(([name, percentage]) => `<div><span>${escape(name)} (${percentage}%)</span><b>${money(amount * percentage / 100)}</b></div>`).join('') + `<div><span>Available to spend</span><b>${money(amount * (100 - used) / 100)}</b></div>`;
}

const SUBSCRIPTION_PRESETS = [{ name: 'ChatGPT Plus', amount: 20 }, { name: 'Xbox Game Pass Ultimate', amount: 22.99 }, { name: 'Spotify Premium Individual', amount: 12.99 }, { name: 'iCloud+ (50 GB)', amount: 0.99 }, { name: 'Uber One', amount: 9.99 }];
const refreshSubscriptionSuggestions = () => { $('#subscriptionPresetList').innerHTML = SUBSCRIPTION_PRESETS.map(sub => `<option value="${escape(sub.name)}">${money(sub.amount)}/month</option>`).join(''); };

document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.closeDialog) { document.getElementById(button.dataset.closeDialog)?.close(); editingTransactionId = null; return; }
  if (button.dataset.screen) { active = button.dataset.screen; render(); return; }
  if (button.dataset.go) { active = button.dataset.go; render(); return; }
  if (button.id === 'addTransaction' || button.id === 'addTransactionFab') openTransaction();
  if (button.id === 'openPayday') { $('#paycheckAmount').value = ''; preview(); $('#paydayDialog').showModal(); }
  if (button.id === 'addGoal') $('#goalDialog').showModal();
  if (button.id === 'addSubscription') { $('#subscriptionForm').reset(); refreshSubscriptionSuggestions(); $('#subscriptionDialog').showModal(); }
  if (button.id === 'resetRecentPaycheck') {
    if (!paycheckResetIsOpen()) return alert('That 30-minute reset window has closed.');
    if (confirm('Reset only this paycheck? Your transactions, goals, subscriptions, and settings will stay.')) {
      data.paychecks.pop(); const date = new Date(data.settings.nextPayday + 'T00:00'); date.setDate(date.getDate() - payInterval()); data.settings.nextPayday = date.toISOString().slice(0, 10); save(); render();
    }
  }
  if (button.dataset.deposit !== undefined) { const amount = Number(prompt('How much do you want to move into this goal?')); if (amount > 0 && amount <= available()) { data.goals[Number(button.dataset.deposit)].saved += amount; save(); render(); } else if (amount > available()) alert('That is more than your available-to-spend balance.'); }
  if (button.dataset.editTransaction !== undefined) openTransaction(button.dataset.editTransaction);
  if (button.dataset.deleteTransaction !== undefined && confirm('Delete this transaction?')) { data.transactions = data.transactions.filter(item => item.id !== button.dataset.deleteTransaction); save(); render(); }
  if (button.dataset.markSubscriptionPaid !== undefined) { const sub = data.subscriptions.find(item => item.id === button.dataset.markSubscriptionPaid); if (sub) { sub.paidFor = subscriptionPeriod(); save(); render(); } }
  if (button.dataset.deleteSubscription !== undefined) { const sub = data.subscriptions.find(item => item.id === button.dataset.deleteSubscription); if (sub && confirm(`Cancel ${sub.name}?`)) { data.subscriptions = data.subscriptions.filter(item => item.id !== sub.id); save(); render(); } }
  if (button.id === 'saveSubscription') { const name = $('#subscriptionName').value.trim(), amount = Number($('#subscriptionAmount').value), dueDay = Number($('#subscriptionDay').value); if (!name || !amount || dueDay < 1 || dueDay > 31) return alert('Enter a subscription name, monthly cost, and charge day.'); data.subscriptions.push({ id: crypto.randomUUID(), name, amount, dueDay }); save(); $('#subscriptionDialog').close(); render(); }
  if (button.id === 'resetData' && confirm('Delete every Money Moves record from this device?')) { data = JSON.parse(JSON.stringify(defaultData)); save(); render(); }
  if (button.id === 'exportData') { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); link.download = 'money-moves-backup.json'; link.click(); URL.revokeObjectURL(link.href); }
});

$('#entryForm').addEventListener('submit', event => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault(); const amount = Number($('#amount').value); if (!amount) return;
  const entry = { name: $('#name').value.trim(), amount, category: $('#category').value, date: $('#entryDate').value, notes: $('#notes').value.trim() };
  if (editingTransactionId) data.transactions = data.transactions.map(item => item.id === editingTransactionId ? { ...item, ...entry } : item);
  else data.transactions.push({ id: crypto.randomUUID(), ...entry });
  editingTransactionId = null; save(); $('#entryDialog').close(); render();
});
$('#paycheckAmount').addEventListener('input', preview);
$('#paydayForm').addEventListener('submit', event => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault(); const amount = Number($('#paycheckAmount').value); if (!amount) return;
  const allocations = Object.fromEntries(Object.entries(data.settings.allocations).map(([name, percentage]) => [name, Math.round(amount * percentage) / 100]));
  data.paychecks.push({ id: crypto.randomUUID(), amount, allocations, date: today(), loggedAt: Date.now() });
  const date = new Date(data.settings.nextPayday + 'T00:00'); date.setDate(date.getDate() + payInterval()); data.settings.nextPayday = date.toISOString().slice(0, 10);
  save(); $('#paydayDialog').close(); active = 'payday'; render();
});
$('#goalForm').addEventListener('submit', event => { if (event.submitter?.value === 'cancel') return; event.preventDefault(); data.goals.push({ id: crypto.randomUUID(), name: $('#goalName').value.trim(), target: Number($('#goalTarget').value), saved: 0, date: $('#goalDate').value }); save(); $('#goalDialog').close(); render(); });
$('#subscriptionName').addEventListener('input', event => { const preset = SUBSCRIPTION_PRESETS.find(item => item.name.toLowerCase() === event.target.value.trim().toLowerCase()); if (preset) $('#subscriptionAmount').value = Number(preset.amount).toFixed(2); });
document.addEventListener('change', event => { if (event.target.id === 'nextPayday') data.settings.nextPayday = event.target.value; if (event.target.id === 'frequency') data.settings.frequency = event.target.value; if (event.target.classList.contains('allocation-input')) data.settings.allocations[event.target.dataset.name] = Number(event.target.value) || 0; save(); render(); });
document.querySelectorAll('[data-close-dialog]').forEach(button => { button.type = 'button'; });
document.querySelectorAll('dialog').forEach(dialog => { dialog.addEventListener('click', event => { const box = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close(); }); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
render();
