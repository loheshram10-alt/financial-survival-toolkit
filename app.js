/**
 * Financial Survival Toolkit - Standalone & Backend-Connected Client
 * Ready for GitHub Pages and local Spring Boot Backend.
 * Features:
 * - Automatically connects to Spring Boot REST API when backend is running.
 * - Gracefully falls back to browser-managed engine when deployed on GitHub Pages static hosting.
 */

// Application State
const state = {
    isBackendConnected: false,
    profiles: [],
    currentProfileId: null,
    currentProfile: null,
    expenses: [],
    filteredExpenses: [],
    recurringRules: [],
    bills: [],
    goal: null,
    savings: [],
    challenge: null,
    dashboard: null,
    chartInstance: null,
    editingExpenseId: null,
    categories: ['Food', 'Travel', 'Shopping']
};

const CHART_COLORS = ["#2b67f6", "#1f9d6b", "#e88922", "#c84a73", "#6e59d9", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

// Formatters
const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

function formatRupees(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) {
        return '₹0.00';
    }
    return currencyFormatter.format(amount);
}

function formatDateHuman(dateStr) {
    if (!dateStr) return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            return new Intl.DateTimeFormat('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }).format(date);
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
}

function getTodayISO() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getCurrentPeriodKey() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}

function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const confirmBtn = document.getElementById('confirmModalConfirmBtn');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.classList.remove('hidden');

    function cleanup() {
        modal.classList.add('hidden');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    }

    confirmBtn.onclick = () => {
        cleanup();
        onConfirm();
    };

    cancelBtn.onclick = () => {
        cleanup();
    };
}

// ===================================================================
// Initialization & Backend Detection
// ===================================================================
document.addEventListener('DOMContentLoaded', async () => {
    initFormDefaults();
    bindEventListeners();
    await detectEnvironmentAndLoad();
});

function initFormDefaults() {
    const todayISO = getTodayISO();
    const expDate = document.getElementById('expenseDate');
    if (expDate) expDate.value = todayISO;

    const savDate = document.getElementById('savingsDate');
    if (savDate) savDate.value = todayISO;
}

async function detectEnvironmentAndLoad() {
    const pill = document.getElementById('backendIndicator');
    const label = document.getElementById('backendStatusLabel');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch('/api/profiles', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            state.isBackendConnected = true;
            if (pill) pill.className = 'backend-status-pill connected';
            if (label) label.textContent = 'Spring Boot Backend Connected';
            await loadProfilesFromBackend();
            return;
        }
    } catch (e) {
        // Backend not found / static hosting
    }

    state.isBackendConnected = false;
    if (pill) pill.className = 'backend-status-pill offline';
    if (label) label.textContent = 'GitHub Pages / Standalone Mode';
    loadFromLocalStorage();
}

function bindEventListeners() {
    // Profile Switcher
    const profileSelect = document.getElementById('profileSelect');
    profileSelect.addEventListener('change', (e) => {
        const id = e.target.value ? (isNaN(e.target.value) ? e.target.value : parseInt(e.target.value)) : null;
        switchProfile(id);
    });

    // Profile Actions
    document.getElementById('btnOpenCreateProfile').addEventListener('click', () => {
        const formBox = document.getElementById('createProfileFormContainer');
        formBox.classList.toggle('hidden');
        if (!formBox.classList.contains('hidden')) {
            document.getElementById('newProfileName').focus();
        }
    });

    document.getElementById('btnCancelProfile').addEventListener('click', () => {
        document.getElementById('createProfileFormContainer').classList.add('hidden');
        document.getElementById('newProfileName').value = '';
        document.getElementById('newProfileError').classList.remove('visible');
    });

    document.getElementById('createProfileForm').addEventListener('submit', handleCreateProfile);

    document.getElementById('btnRefreshMonth').addEventListener('click', () => {
        if (!state.currentProfileId) {
            showToast('Please select a profile first.', 'error');
            return;
        }
        showConfirm(
            'Refresh Month',
            'This will clear ALL expenses of this profile and reset recurring schedules. Your budget, goal, and rules will be kept.',
            handleRefreshMonth
        );
    });

    document.getElementById('btnRemoveProfile').addEventListener('click', () => {
        if (!state.currentProfileId) {
            showToast('Please select a profile first.', 'error');
            return;
        }
        showConfirm(
            'Remove Profile',
            'This cannot be undone. All expenses, rules, goals, and savings for this profile will be permanently deleted.',
            handleDeleteProfile
        );
    });

    // Expense Form
    const expenseCategorySelect = document.getElementById('expenseCategorySelect');
    expenseCategorySelect.addEventListener('change', () => {
        const customGroup = document.getElementById('customCategoryGroup');
        if (expenseCategorySelect.value === 'Other') {
            customGroup.classList.remove('hidden');
            document.getElementById('expenseCustomCategory').focus();
        } else {
            customGroup.classList.add('hidden');
            document.getElementById('expenseCustomCategory').value = '';
        }
    });

    document.getElementById('expenseForm').addEventListener('submit', handleSaveExpense);
    document.getElementById('btnCancelExpenseEdit').addEventListener('click', resetExpenseForm);

    // Recurring Form
    document.getElementById('recurringForm').addEventListener('submit', handleSaveRecurringRule);

    // Budget Form
    document.getElementById('budgetForm').addEventListener('submit', handleSaveBudget);

    // Goal Form
    document.getElementById('goalForm').addEventListener('submit', handleSaveGoal);

    // Savings Form
    document.getElementById('addSavingsForm').addEventListener('submit', handleAddSavings);

    // Edit Savings Modal
    document.getElementById('editSavingsForm').addEventListener('submit', handleSaveEditedSavings);
    document.getElementById('btnCancelEditSavings').addEventListener('click', () => {
        document.getElementById('editSavingsModal').classList.add('hidden');
    });

    // Challenge Form
    document.getElementById('btnStartChallenge').addEventListener('click', handleStartChallenge);
    document.getElementById('btnStopChallenge').addEventListener('click', handleStopChallenge);

    // Filters
    document.getElementById('filterSearch').addEventListener('input', debounce(applyExpenseFilters, 250));
    document.getElementById('filterCategory').addEventListener('change', applyExpenseFilters);
    document.getElementById('filterStartDate').addEventListener('change', applyExpenseFilters);
    document.getElementById('filterEndDate').addEventListener('change', applyExpenseFilters);
    document.getElementById('btnClearFilters').addEventListener('click', clearExpenseFilters);
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ===================================================================
// Standalone In-Memory / LocalStorage Engine
// ===================================================================
const STORAGE_KEY = 'FST_STANDALONE_DATA_V1';

function getStorageData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
        profiles: [],
        expenses: {},
        recurringRules: {},
        goals: {},
        savings: {},
        challenges: {}
    };
}

function saveStorageData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
}

function loadFromLocalStorage() {
    const data = getStorageData();
    state.profiles = data.profiles || [];

    renderProfileDropdown();

    if (state.profiles.length > 0) {
        switchProfile(state.profiles[0].id);
    } else {
        renderAllPanelsEmpty();
    }
}

// ===================================================================
// Profile Operations
// ===================================================================
async function loadProfilesFromBackend() {
    try {
        const res = await fetch('/api/profiles');
        if (!res.ok) throw new Error('Failed to load profiles');
        state.profiles = await res.json();
        renderProfileDropdown();

        if (state.profiles.length > 0) {
            switchProfile(state.profiles[0].id);
        } else {
            renderAllPanelsEmpty();
        }
    } catch (e) {
        state.isBackendConnected = false;
        loadFromLocalStorage();
    }
}

function renderProfileDropdown() {
    const select = document.getElementById('profileSelect');
    select.innerHTML = '';

    if (state.profiles.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- No Profiles Available --';
        select.appendChild(opt);
        return;
    }

    state.profiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + (p.budget > 0 ? ` (Budget: ${formatRupees(p.budget)})` : '');
        if (p.id === state.currentProfileId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

function switchProfile(profileId) {
    resetExpenseForm();
    state.currentProfileId = profileId;
    state.currentProfile = state.profiles.find(p => p.id === profileId) || null;

    const select = document.getElementById('profileSelect');
    if (select && profileId) select.value = profileId;

    if (!profileId) {
        renderAllPanelsEmpty();
        return;
    }

    if (state.isBackendConnected) {
        loadAllProfileDataFromBackend(profileId);
    } else {
        loadAllProfileDataFromStorage(profileId);
    }
}

async function handleCreateProfile(e) {
    e.preventDefault();
    const input = document.getElementById('newProfileName');
    const errEl = document.getElementById('newProfileError');
    const name = input.value.trim();

    errEl.classList.remove('visible');
    errEl.textContent = '';

    if (!name) {
        errEl.textContent = 'Profile name cannot be empty.';
        errEl.classList.add('visible');
        return;
    }

    if (state.isBackendConnected) {
        try {
            const res = await fetch('/api/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (res.status === 409) {
                errEl.textContent = `A profile named "${name}" already exists.`;
                errEl.classList.add('visible');
                return;
            }

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                errEl.textContent = data.message || 'Error creating profile.';
                errEl.classList.add('visible');
                return;
            }

            const newProfile = await res.json();
            showToast(`Profile "${newProfile.name}" created!`, 'success');
            input.value = '';
            document.getElementById('createProfileFormContainer').classList.add('hidden');
            state.currentProfileId = newProfile.id;
            await loadProfilesFromBackend();
            return;
        } catch (err) {
            // fallback
        }
    }

    // Standalone / Storage mode
    const data = getStorageData();
    if (data.profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        errEl.textContent = `A profile named "${name}" already exists.`;
        errEl.classList.add('visible');
        return;
    }

    const newProfile = {
        id: Date.now(),
        name: name,
        budget: 0.0
    };

    data.profiles.push(newProfile);
    saveStorageData(data);
    state.profiles = data.profiles;

    showToast(`Profile "${newProfile.name}" created!`, 'success');
    input.value = '';
    document.getElementById('createProfileFormContainer').classList.add('hidden');
    renderProfileDropdown();
    switchProfile(newProfile.id);
}

async function handleDeleteProfile() {
    if (!state.currentProfileId) return;

    if (state.isBackendConnected) {
        try {
            const res = await fetch(`/api/profiles/${state.currentProfileId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete profile');
            showToast('Profile deleted successfully.', 'success');
            state.currentProfileId = null;
            await loadProfilesFromBackend();
            return;
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }
    }

    // Storage Cascade Delete
    const data = getStorageData();
    data.profiles = data.profiles.filter(p => p.id !== state.currentProfileId);
    delete data.expenses[state.currentProfileId];
    delete data.recurringRules[state.currentProfileId];
    delete data.goals[state.currentProfileId];
    delete data.savings[state.currentProfileId];
    delete data.challenges[state.currentProfileId];
    saveStorageData(data);

    state.profiles = data.profiles;
    state.currentProfileId = null;
    showToast('Profile deleted successfully.', 'success');
    renderProfileDropdown();
    if (state.profiles.length > 0) {
        switchProfile(state.profiles[0].id);
    } else {
        renderAllPanelsEmpty();
    }
}

async function handleRefreshMonth() {
    if (!state.currentProfileId) return;

    if (state.isBackendConnected) {
        try {
            const res = await fetch(`/api/profiles/${state.currentProfileId}/refresh-month`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to refresh month');
            showToast('Month refreshed! All expenses cleared.', 'success');
            await loadAllProfileDataFromBackend(state.currentProfileId);
            return;
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }
    }

    // Storage refresh
    const data = getStorageData();
    data.expenses[state.currentProfileId] = [];
    if (data.recurringRules[state.currentProfileId]) {
        data.recurringRules[state.currentProfileId].forEach(r => r.appliedPeriods = []);
    }
    saveStorageData(data);

    showToast('Month refreshed! All expenses cleared.', 'success');
    loadAllProfileDataFromStorage(state.currentProfileId);
}

// ===================================================================
// Data Loading
// ===================================================================
async function loadAllProfileDataFromBackend(profileId) {
    try {
        const [dashRes, expRes, recRes, billRes, savRes, goalRes, chRes] = await Promise.all([
            fetch(`/api/profiles/${profileId}/dashboard`),
            fetch(`/api/profiles/${profileId}/expenses`),
            fetch(`/api/profiles/${profileId}/recurring`),
            fetch(`/api/profiles/${profileId}/bills?days=30`),
            fetch(`/api/profiles/${profileId}/savings`),
            fetch(`/api/profiles/${profileId}/goal`),
            fetch(`/api/profiles/${profileId}/challenge`)
        ]);

        if (dashRes.ok) {
            state.dashboard = await dashRes.json();
            renderDashboardCard(state.dashboard);
            renderInsights(state.dashboard.insights);
            renderSavingsProgress(state.dashboard.goalProgress);
        }

        if (expRes.ok) {
            state.expenses = await expRes.json();
            populateCategoryFilterOptions();
            applyExpenseFilters();
        }

        if (recRes.ok) {
            state.recurringRules = await recRes.json();
            renderRecurringRules(state.recurringRules);
        }

        if (billRes.ok) {
            state.bills = await billRes.json();
            renderBillCalendar(state.bills);
        }

        if (savRes.ok) {
            state.savings = await savRes.json();
            renderGroupedSavings(state.savings);
        }

        if (goalRes.ok) {
            state.goal = await goalRes.json();
            renderGoal(state.goal);
        }

        if (chRes.ok) {
            state.challenge = await chRes.json();
            renderChallenge(state.challenge);
        }
    } catch (e) {
        console.error('Error loading backend data:', e);
    }
}

function loadAllProfileDataFromStorage(profileId) {
    const data = getStorageData();
    autoApplyRecurringStorage(profileId, data);

    const expenses = data.expenses[profileId] || [];
    state.expenses = expenses.sort((a, b) => (b.date > a.date ? 1 : -1));
    state.recurringRules = (data.recurringRules[profileId] || []).sort((a, b) => a.dayOfMonth - b.dayOfMonth);
    state.goal = data.goals[profileId] || null;
    state.challenge = data.challenges[profileId] || null;

    // Build bills
    state.bills = calculateBillsStorage(state.recurringRules);

    // Grouped savings
    const rawSavings = data.savings[profileId] || [];
    state.savings = calculateGroupedSavingsStorage(rawSavings);

    // Dashboard calculations
    const dash = calculateDashboardStorage(profileId, data);
    state.dashboard = dash;

    renderDashboardCard(dash);
    renderInsights(dash.insights);
    renderSavingsProgress(dash.goalProgress);
    renderRecurringRules(state.recurringRules);
    renderBillCalendar(state.bills);
    renderGroupedSavings(state.savings);
    renderGoal(state.goal);
    renderChallenge(calculateChallengeDTOStorage(profileId, state.challenge, state.expenses));

    populateCategoryFilterOptions();
    applyExpenseFilters();
}

// ===================================================================
// Standalone Calculations & Recurring Auto-Apply
// ===================================================================
function autoApplyRecurringStorage(profileId, data) {
    const rules = data.recurringRules[profileId] || [];
    const today = new Date();
    const currentYM = getCurrentPeriodKey();
    let changed = false;

    rules.forEach(r => {
        if (!r.appliedPeriods) r.appliedPeriods = [];
        if (!r.appliedPeriods.includes(currentYM)) {
            const dueDay = Math.min(r.dayOfMonth, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate());
            if (today.getDate() >= dueDay) {
                const expDate = `${currentYM}-${String(dueDay).padStart(2, '0')}`;
                if (!data.expenses[profileId]) data.expenses[profileId] = [];
                data.expenses[profileId].push({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    profileId: profileId,
                    amount: r.amount,
                    category: 'Recurring',
                    date: expDate,
                    note: `Auto: ${r.name}`,
                    paymentMethod: r.paymentMethod || 'UPI',
                    recurringId: r.id
                });
                r.appliedPeriods.push(currentYM);
                changed = true;
            }
        }
    });

    if (changed) saveStorageData(data);
}

function calculateBillsStorage(rules) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date();
    maxDate.setDate(today.getDate() + 30);
    maxDate.setHours(23, 59, 59, 999);

    const bills = [];
    const months = [
        new Date(today.getFullYear(), today.getMonth(), 1),
        new Date(today.getFullYear(), today.getMonth() + 1, 1),
        new Date(today.getFullYear(), today.getMonth() + 2, 1)
    ];

    rules.forEach(rule => {
        months.forEach(m => {
            const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
            const day = Math.min(rule.dayOfMonth, daysInMonth);
            const dueDate = new Date(m.getFullYear(), m.getMonth(), day);

            if (dueDate >= today && dueDate <= maxDate) {
                const diffTime = dueDate.getTime() - today.getTime();
                const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const iso = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
                bills.push({
                    ruleId: rule.id,
                    name: rule.name,
                    amount: rule.amount,
                    category: rule.category || 'Recurring',
                    paymentMethod: rule.paymentMethod,
                    dueDate: iso,
                    daysUntilDue: daysUntil,
                    statusLabel: daysUntil === 0 ? 'Due today' : `Due in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`
                });
            }
        });
    });

    return bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function calculateGroupedSavingsStorage(entries) {
    const map = {};
    entries.forEach(e => {
        if (!map[e.date]) map[e.date] = { date: e.date, totalAmount: 0, entriesCount: 0 };
        map[e.date].totalAmount += e.amount;
        map[e.date].entriesCount += 1;
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

function calculateDashboardStorage(profileId, data) {
    const profile = data.profiles.find(p => p.id === profileId) || { budget: 0 };
    const expenses = data.expenses[profileId] || [];
    const rules = data.recurringRules[profileId] || [];
    const currentYM = getCurrentPeriodKey();
    const today = new Date();

    const currentMonthExpenses = expenses.filter(e => e.date && e.date.startsWith(currentYM));
    const currentMonthSpent = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

    const unappliedRecurring = rules
        .filter(r => !(r.appliedPeriods || []).includes(currentYM))
        .reduce((sum, r) => sum + r.amount, 0);

    const totalSpent = currentMonthSpent + unappliedRecurring;
    const budget = profile.budget || 0.0;

    let budgetStatus = 'No monthly budget set yet.';
    if (budget > 0) {
        budgetStatus = totalSpent > budget ? 'Budget exceeded.' : `Budget left: ${formatRupees(budget - totalSpent)}`;
    }

    const usedPercent = budget > 0 ? (totalSpent / budget * 100.0) : 0.0;
    const day = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const projectedSpend = day > 0 ? (totalSpent / day * daysInMonth) : totalSpent;
    const remainingDays = daysInMonth - day;
    const remainingBudget = budget - totalSpent;
    const dailySafeSpend = remainingDays > 0 ? Math.max(0, remainingBudget / remainingDays) : Math.max(0, remainingBudget);

    let burnRateText = 'Set budget to see burn rate';
    if (budget > 0) {
        if (totalSpent > budget) {
            burnRateText = `Projected spend: ${formatRupees(projectedSpend)}.`;
        } else {
            burnRateText = `Projected: ${formatRupees(projectedSpend)} | Daily safe spend: ${formatRupees(dailySafeSpend)}`;
        }
    }

    const categoryBreakdown = {};
    currentMonthExpenses.forEach(e => {
        categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + e.amount;
    });

    const recurringMonthlyTotal = rules.reduce((sum, r) => sum + r.amount, 0);

    // Goal progress
    const goal = data.goals[profileId] || null;
    const rawSavings = data.savings[profileId] || [];
    const totalSaved = rawSavings.reduce((sum, s) => sum + s.amount, 0);
    const monthSaved = rawSavings
        .filter(s => s.date && s.date.startsWith(currentYM))
        .reduce((sum, s) => sum + s.amount, 0);

    let goalProgress = { hasGoal: false, bannerText: 'Set a goal to see your daily target.', bannerType: 'info' };
    if (goal && goal.amount > 0) {
        const remaining = Math.max(0, goal.amount - totalSaved);
        const progPct = (totalSaved / goal.amount) * 100.0;
        const monthPct = (monthSaved / goal.amount) * 100.0;

        goalProgress = {
            hasGoal: true,
            goalAmount: goal.amount,
            targetDays: goal.days,
            dailyTarget: goal.amount / goal.days,
            totalSaved: totalSaved,
            remaining: remaining,
            progressPercent: progPct,
            bannerText: remaining === 0 ? "Goal complete! You've hit your savings target." : `Progress: ${progPct.toFixed(1)}% of goal saved.`,
            bannerType: remaining === 0 ? "success" : "warning",
            monthlySummaryText: monthSaved >= goal.amount
                ? `This month you saved ${formatRupees(monthSaved)} (${monthPct.toFixed(1)}%). Goal achieved.`
                : `This month you saved ${formatRupees(monthSaved)} (${monthPct.toFixed(1)}%). ${formatRupees(goal.amount - monthSaved)} to go.`
        };
    }

    // Insights Engine (Same 6 Priority rules)
    const insights = [];
    if (expenses.length === 0) {
        insights.push({ type: 'info', message: 'Add a few expenses to unlock trend insights.' });
    } else {
        // MoM
        const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const prevYM = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
        const prevMonthSpent = expenses.filter(e => e.date && e.date.startsWith(prevYM)).reduce((s, e) => s + e.amount, 0);

        if (prevMonthSpent > 0) {
            const mom = ((totalSpent - prevMonthSpent) / prevMonthSpent) * 100.0;
            if (mom >= 15.0) {
                insights.push({ type: 'warning', message: `Spending is up ${mom.toFixed(1)}% compared to last month.` });
            } else if (mom <= -10.0) {
                insights.push({ type: 'info', message: `Good trend: Spending is down ${Math.abs(mom).toFixed(1)}% compared to last month.` });
            }
        }

        // Category concentration
        if (totalSpent > 0) {
            const maxCat = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0];
            if (maxCat && (maxCat[1] / totalSpent) >= 0.45) {
                insights.push({ type: 'warning', message: `High concentration: ${maxCat[0]} accounts for ${((maxCat[1] / totalSpent) * 100).toFixed(1)}% of this month's spending.` });
            }
        }

        // Anomaly
        if (expenses.length >= 5) {
            const latest = expenses[0];
            const prev10 = expenses.slice(1, 11);
            const avg10 = prev10.reduce((s, e) => s + e.amount, 0) / prev10.length;
            if (latest.amount > 2.2 * avg10 && latest.amount > 500) {
                insights.push({ type: 'risk', message: `Anomaly detected: Recent ${formatRupees(latest.amount)} expense is over 2.2x higher than your previous average.` });
            }
        }

        // Budget pace
        if (budget > 0 && projectedSpend > 1.10 * budget) {
            const over = ((projectedSpend - budget) / budget) * 100.0;
            insights.push({ type: 'risk', message: `Budget pace warning: Projected spending (${formatRupees(projectedSpend)}) exceeds your budget by ${over.toFixed(1)}%.` });
        }

        // Active challenge
        const ch = data.challenges[profileId];
        if (ch && ch.active) {
            const spentToday = expenses.some(e => e.date === getTodayISO());
            if (spentToday) {
                insights.push({ type: 'warning', message: 'No-spend challenge warning: you logged spending today.' });
            } else {
                insights.push({ type: 'info', message: 'No-spend challenge on track for today.' });
            }
        }
    }

    if (insights.length === 0) {
        insights.push({ type: 'info', message: 'No critical alerts right now.' });
    }

    return {
        totalSpent,
        budget,
        budgetStatus,
        usedPercent,
        projectedSpend,
        dailySafeSpend,
        burnRateText,
        categoryBreakdown,
        recurringMonthlyTotal,
        goalProgress,
        insights: insights.slice(0, 6)
    };
}

function calculateChallengeDTOStorage(profileId, ch, expenses) {
    const todayISO = getTodayISO();
    const expDates = new Set(expenses.map(e => e.date));

    // Calculate streak
    let streak = 0;
    if (!expDates.has(todayISO)) {
        let cursor = new Date();
        for (let i = 0; i < 365; i++) {
            const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
            if (expDates.has(iso)) break;
            streak++;
            cursor.setDate(cursor.getDate() - 1);
        }
    }

    if (!ch) {
        return {
            active: false,
            streak: streak,
            streakText: `Current no-spend streak: ${streak} day(s).`,
            status: 'No active challenge.',
            progressText: '0/0 no-spend days (0.0%)'
        };
    }

    // Calculate no-spend days
    let noSpendDays = 0;
    const start = new Date(ch.startDate);
    const end = new Date(ch.endDate);
    const today = new Date();
    const limit = today < end ? today : end;

    let c = new Date(start);
    while (c <= limit) {
        const iso = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`;
        if (!expDates.has(iso)) noSpendDays++;
        c.setDate(c.getDate() + 1);
    }

    const pct = ch.targetDays > 0 ? (noSpendDays / ch.targetDays) * 100 : 0;
    let status = ch.active ? `Active until ${formatDateHuman(ch.endDate)}.` : 'Challenge paused.';
    if (getTodayISO() > ch.endDate) status = `Completed on ${formatDateHuman(ch.endDate)}.`;

    return {
        active: ch.active,
        targetDays: ch.targetDays,
        streak: streak,
        streakText: `Current no-spend streak: ${streak} day(s).`,
        status: status,
        progressText: `${noSpendDays}/${ch.targetDays} no-spend days (${pct.toFixed(1)}%)`
    };
}

// ===================================================================
// UI Rendering Functions
// ===================================================================
function renderDashboardCard(dash) {
    if (!dash) return;
    document.getElementById('totalSpentAmount').textContent = formatRupees(dash.totalSpent);
    document.getElementById('budgetStatusText').textContent = dash.budgetStatus || 'No monthly budget set yet.';
    document.getElementById('budgetTargetDisplay').textContent = `Budget: ${formatRupees(dash.budget)}`;

    const usedPercent = dash.usedPercent || 0;
    const cappedWidth = Math.min(Math.max(usedPercent, 0), 100);
    const progressFill = document.getElementById('budgetProgressBar');
    progressFill.style.width = `${cappedWidth}%`;
    document.getElementById('progressPercentLabel').textContent = `${usedPercent.toFixed(1)}% used`;

    const totalCard = document.getElementById('totalSpentCard');
    if (dash.budget > 0 && dash.totalSpent > dash.budget) {
        totalCard.classList.add('over-budget');
        progressFill.classList.add('over');
    } else {
        totalCard.classList.remove('over-budget');
        progressFill.classList.remove('over');
    }

    document.getElementById('burnRateText').textContent = dash.burnRateText || 'Set budget to see burn rate';
    const bInput = document.getElementById('monthlyBudgetInput');
    if (bInput) bInput.value = (dash.budget && dash.budget > 0) ? dash.budget : '';
}

async function handleSaveBudget(e) {
    e.preventDefault();
    if (!state.currentProfileId) {
        showToast('Please select a profile first.', 'error');
        return;
    }

    const val = parseFloat(document.getElementById('monthlyBudgetInput').value);
    const budgetVal = (!isNaN(val) && val > 0) ? val : 0;

    if (state.isBackendConnected) {
        try {
            const res = await fetch(`/api/profiles/${state.currentProfileId}/budget`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ budget: budgetVal })
            });
            if (!res.ok) throw new Error('Failed to update budget');
            showToast('Monthly budget updated!', 'success');
            await loadAllProfileDataFromBackend(state.currentProfileId);
            return;
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }
    }

    const data = getStorageData();
    const prof = data.profiles.find(p => p.id === state.currentProfileId);
    if (prof) prof.budget = budgetVal;
    saveStorageData(data);
    showToast('Monthly budget updated!', 'success');
    loadAllProfileDataFromStorage(state.currentProfileId);
}

// Expenses
function populateCategoryFilterOptions() {
    const filterCat = document.getElementById('filterCategory');
    const currentVal = filterCat.value;
    const baseCats = new Set(['Food', 'Travel', 'Shopping']);
    state.expenses.forEach(e => {
        if (e.category) baseCats.add(e.category);
    });

    state.categories = Array.from(baseCats);
    filterCat.innerHTML = '<option value="">All categories</option>';
    state.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === currentVal) opt.selected = true;
        filterCat.appendChild(opt);
    });
}

function applyExpenseFilters() {
    if (!state.currentProfileId) {
        renderExpensesList([]);
        return;
    }

    const search = (document.getElementById('filterSearch').value || '').trim().toLowerCase();
    const cat = (document.getElementById('filterCategory').value || '').trim().toLowerCase();
    const start = document.getElementById('filterStartDate').value;
    const end = document.getElementById('filterEndDate').value;

    const filtered = state.expenses.filter(e => {
        if (search) {
            const combined = `${e.category || ''} ${e.note || ''} ${e.paymentMethod || ''}`.toLowerCase();
            if (!combined.includes(search)) return false;
        }
        if (cat && cat !== 'all' && cat !== 'all categories') {
            if ((e.category || '').toLowerCase() !== cat) return false;
        }
        if (start && e.date < start) return false;
        if (end && e.date > end) return false;
        return true;
    });

    state.filteredExpenses = filtered;
    renderExpensesList(filtered);
    renderCategoryBreakdownFromFiltered(filtered);
}

function clearExpenseFilters() {
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    applyExpenseFilters();
}

function renderExpensesList(expenses) {
    const container = document.getElementById('expensesList');
    if (!state.currentProfileId) {
        container.innerHTML = '<div class="empty-state">Create a profile to start tracking</div>';
        return;
    }
    if (!expenses || expenses.length === 0) {
        container.innerHTML = '<div class="empty-state">No expenses match these filters.</div>';
        return;
    }

    container.innerHTML = expenses.map(e => `
        <div class="expense-row" data-id="${e.id}">
            <div class="expense-main">
                <div class="expense-primary-line">
                    <span class="expense-amount">${formatRupees(e.amount)}</span>
                    <span class="category-badge">${escapeHtml(e.category)}</span>
                    ${e.recurringId ? '<span class="recurring-tag">Recurring</span>' : ''}
                </div>
                <div class="expense-meta-line">
                    ${formatDateHuman(e.date)} &bull; ${escapeHtml(e.paymentMethod || 'UPI')}${e.note ? ' &bull; ' + escapeHtml(e.note) : ''}
                </div>
            </div>
            <div class="expense-actions">
                <button type="button" class="btn btn-sm btn-edit" onclick="handleEditExpenseClick(${e.id})">Edit</button>
                <button type="button" class="btn btn-sm btn-delete" onclick="handleDeleteExpenseClick(${e.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

async function handleSaveExpense(e) {
    e.preventDefault();
    if (!state.currentProfileId) {
        showToast('Please select or create a profile first.', 'error');
        return;
    }

    const amountInput = document.getElementById('expenseAmount');
    const amountError = document.getElementById('expenseAmountError');
    const dateInput = document.getElementById('expenseDate');
    const dateError = document.getElementById('expenseDateError');
    const categorySelect = document.getElementById('expenseCategorySelect');
    const customCategoryInput = document.getElementById('expenseCustomCategory');
    const customCategoryError = document.getElementById('customCategoryError');
    const paymentMethodSelect = document.getElementById('expensePaymentMethod');
    const noteInput = document.getElementById('expenseNote');

    amountError.classList.remove('visible');
    dateError.classList.remove('visible');
    customCategoryError.classList.remove('visible');

    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) {
        amountError.textContent = 'Amount must be greater than 0.';
        amountError.classList.add('visible');
        amountInput.focus();
        return;
    }

    const date = dateInput.value;
    if (!date) {
        dateError.textContent = 'Date is required.';
        dateError.classList.add('visible');
        dateInput.focus();
        return;
    }

    let category = categorySelect.value;
    if (category === 'Other') {
        const custom = customCategoryInput.value.trim();
        if (!custom) {
            customCategoryError.textContent = 'Custom category is required.';
            customCategoryError.classList.add('visible');
            customCategoryInput.focus();
            return;
        }
        category = custom;
    }

    const payload = {
        amount,
        date,
        category,
        paymentMethod: paymentMethodSelect.value,
        note: noteInput.value.trim() || null
    };

    if (state.isBackendConnected) {
        try {
            const url = state.editingExpenseId
                ? `/api/profiles/${state.currentProfileId}/expenses/${state.editingExpenseId}`
                : `/api/profiles/${state.currentProfileId}/expenses`;
            const res = await fetch(url, {
                method: state.editingExpenseId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Failed to save expense');
            showToast(state.editingExpenseId ? 'Expense updated!' : 'Expense logged!', 'success');
            resetExpenseForm();
            await loadAllProfileDataFromBackend(state.currentProfileId);
            return;
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }
    }

    // Storage mode
    const data = getStorageData();
    if (!data.expenses[state.currentProfileId]) data.expenses[state.currentProfileId] = [];

    if (state.editingExpenseId) {
        const idx = data.expenses[state.currentProfileId].findIndex(x => x.id === state.editingExpenseId);
        if (idx !== -1) {
            data.expenses[state.currentProfileId][idx] = {
                ...data.expenses[state.currentProfileId][idx],
                ...payload
            };
        }
        showToast('Expense updated!', 'success');
    } else {
        data.expenses[state.currentProfileId].unshift({
            id: Date.now(),
            profileId: state.currentProfileId,
            ...payload
        });
        showToast('Expense logged!', 'success');
    }

    saveStorageData(data);
    resetExpenseForm();
    loadAllProfileDataFromStorage(state.currentProfileId);
}

function handleEditExpenseClick(expenseId) {
    const expense = state.expenses.find(e => e.id === expenseId);
    if (!expense) return;

    state.editingExpenseId = expense.id;
    document.getElementById('editExpenseId').value = expense.id;
    document.getElementById('expenseAmount').value = expense.amount;
    document.getElementById('expenseDate').value = expense.date;
    document.getElementById('expensePaymentMethod').value = expense.paymentMethod || 'UPI';
    document.getElementById('expenseNote').value = expense.note || '';

    const categorySelect = document.getElementById('expenseCategorySelect');
    const customGroup = document.getElementById('customCategoryGroup');
    const customInput = document.getElementById('expenseCustomCategory');

    if (['Food', 'Travel', 'Shopping'].includes(expense.category)) {
        categorySelect.value = expense.category;
        customGroup.classList.add('hidden');
        customInput.value = '';
    } else {
        categorySelect.value = 'Other';
        customGroup.classList.remove('hidden');
        customInput.value = expense.category;
    }

    document.getElementById('expenseFormHeading').textContent = 'Edit Expense';
    document.getElementById('btnSubmitExpense').innerHTML = '<span class="btn-icon">💾</span> Save Changes';
    document.getElementById('btnCancelExpenseEdit').classList.remove('hidden');
    document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetExpenseForm() {
    state.editingExpenseId = null;
    document.getElementById('editExpenseId').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDate').value = getTodayISO();
    document.getElementById('expenseCategorySelect').value = 'Food';
    document.getElementById('customCategoryGroup').classList.add('hidden');
    document.getElementById('expenseCustomCategory').value = '';
    document.getElementById('expensePaymentMethod').value = 'UPI';
    document.getElementById('expenseNote').value = '';

    document.getElementById('expenseAmountError').classList.remove('visible');
    document.getElementById('expenseDateError').classList.remove('visible');
    document.getElementById('customCategoryError').classList.remove('visible');

    document.getElementById('expenseFormHeading').textContent = 'Add Expense';
    document.getElementById('btnSubmitExpense').innerHTML = '<span class="btn-icon">＋</span> Add Expense';
    document.getElementById('btnCancelExpenseEdit').classList.add('hidden');
}

function handleDeleteExpenseClick(expenseId) {
    showConfirm(
        'Delete Expense',
        'Are you sure you want to delete this expense?',
        async () => {
            if (state.isBackendConnected) {
                try {
                    const res = await fetch(`/api/profiles/${state.currentProfileId}/expenses/${expenseId}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Failed to delete expense');
                    showToast('Expense deleted.', 'success');
                    if (state.editingExpenseId === expenseId) resetExpenseForm();
                    await loadAllProfileDataFromBackend(state.currentProfileId);
                    return;
                } catch (err) {
                    showToast(err.message, 'error');
                    return;
                }
            }

            const data = getStorageData();
            if (data.expenses[state.currentProfileId]) {
                data.expenses[state.currentProfileId] = data.expenses[state.currentProfileId].filter(e => e.id !== expenseId);
                saveStorageData(data);
            }
            showToast('Expense deleted.', 'success');
            if (state.editingExpenseId === expenseId) resetExpenseForm();
            loadAllProfileDataFromStorage(state.currentProfileId);
        }
    );
}

// Recurring
function renderRecurringRules(rules) {
    const container = document.getElementById('recurringRulesList');
    const totalDisplay = document.getElementById('recurringMonthlyTotalDisplay');
    const total = rules.reduce((sum, r) => sum + (r.amount || 0), 0);
    totalDisplay.textContent = `Monthly recurring total: ${formatRupees(total)}`;

    if (!rules || rules.length === 0) {
        container.innerHTML = '<div class="empty-state">No recurring rules yet.</div>';
        return;
    }

    container.innerHTML = rules.map(r => `
        <div class="mini-item">
            <div class="mini-item-info">
                <span class="mini-item-title">${escapeHtml(r.name)} - ${formatRupees(r.amount)}</span>
                <span class="mini-item-meta">Recurring | Day ${r.dayOfMonth} | ${escapeHtml(r.paymentMethod || 'UPI')}</span>
            </div>
            <div class="mini-item-actions">
                <button type="button" class="btn btn-sm btn-delete" onclick="handleDeleteRecurringRule(${r.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

async function handleSaveRecurringRule(e) {
    e.preventDefault();
    if (!state.currentProfileId) {
        showToast('Please select a profile first.', 'error');
        return;
    }

    const nameInput = document.getElementById('recurringName');
    const nameErr = document.getElementById('recurringNameError');
    const amountInput = document.getElementById('recurringAmount');
    const amountErr = document.getElementById('recurringAmountError');
    const dayInput = document.getElementById('recurringDueDay');
    const dayErr = document.getElementById('recurringDueDayError');
    const paymentSelect = document.getElementById('recurringPaymentMethod');

    nameErr.classList.remove('visible');
    amountErr.classList.remove('visible');
    dayErr.classList.remove('visible');

    const name = nameInput.value.trim();
    if (!name) {
        nameErr.textContent = 'Rule name is required.';
        nameErr.classList.add('visible');
        return;
    }
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) {
        amountErr.textContent = 'Amount must be greater than 0.';
        amountErr.classList.add('visible');
        return;
    }
    const dayOfMonth = parseInt(dayInput.value);
    if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        dayErr.textContent = 'Day must be between 1 and 31.';
        dayErr.classList.add('visible');
        return;
    }

    const payload = { name, amount, dayOfMonth, paymentMethod: paymentSelect.value };

    if (state.isBackendConnected) {
        try {
            const res = await fetch(`/api/profiles/${state.currentProfileId}/recurring`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Failed to create recurring rule');
            showToast(`Recurring rule "${name}" added!`, 'success');
            nameInput.value = ''; amountInput.value = ''; dayInput.value = '';
            await loadAllProfileDataFromBackend(state.currentProfileId);
            return;
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }
    }

    const data = getStorageData();
    if (!data.recurringRules[state.currentProfileId]) data.recurringRules[state.currentProfileId] = [];
    data.recurringRules[state.currentProfileId].push({
        id: Date.now(),
        profileId: state.currentProfileId,
        category: 'Recurring',
        startDate: getTodayISO(),
        appliedPeriods: [],
        ...payload
    });
    saveStorageData(data);

    showToast(`Recurring rule "${name}" added!`, 'success');
    nameInput.value = ''; amountInput.value = ''; dayInput.value = '';
    loadAllProfileDataFromStorage(state.currentProfileId);
}

function handleDeleteRecurringRule(ruleId) {
    showConfirm(
        'Delete Recurring Rule',
        'Delete this recurring rule?',
        async () => {
            if (state.isBackendConnected) {
                try {
                    const res = await fetch(`/api/profiles/${state.currentProfileId}/recurring/${ruleId}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Failed to delete rule');
                    showToast('Recurring rule deleted.', 'success');
                    await loadAllProfileDataFromBackend(state.currentProfileId);
                    return;
                } catch (err) {
                    showToast(err.message, 'error');
                    return;
                }
            }

            const data = getStorageData();
            if (data.recurringRules[state.currentProfileId]) {
                data.recurringRules[state.currentProfileId] = data.recurringRules[state.currentProfileId].filter(r => r.id !== ruleId);
                saveStorageData(data);
            }
            showToast('Recurring rule deleted.', 'success');
            loadAllProfileDataFromStorage(state.currentProfileId);
        }
    );
}

function renderBillCalendar(bills) {
    const container = document.getElementById('billCalendarList');
    if (!state.currentProfileId || !bills || bills.length === 0) {
        container.innerHTML = '<div class="empty-state">No upcoming recurring bills in the next 30 days.</div>';
        return;
    }

    container.innerHTML = bills.map(b => {
        const badgeClass = b.daysUntilDue === 0 ? 'due-today' : 'due-soon';
        return `
            <div class="bill-row">
                <div class="bill-main">
                    <div class="bill-primary-line">
                        <span class="bill-amount">${escapeHtml(b.name)} - ${formatRupees(b.amount)}</span>
                        <span class="category-badge">${escapeHtml(b.category)}</span>
                    </div>
                    <div class="bill-meta-line">
                        ${escapeHtml(b.category)} &bull; ${formatDateHuman(b.dueDate)} &bull; ${escapeHtml(b.paymentMethod || 'UPI')}
                    </div>
                </div>
                <div class="bill-actions">
                    <span class="due-badge ${badgeClass}">${escapeHtml(b.statusLabel)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Goal & Savings
function renderGoal(goal) {
    const targetCallout = document.getElementById('goalDailyTargetText');
    const amountInput = document.getElementById('goalAmount');
    const daysInput = document.getElementById('goalDays');

    if (goal && goal.amount > 0 && goal.days > 0) {
        amountInput.value = goal.amount;
        daysInput.value = goal.days;
        targetCallout.textContent = `You need to save ${formatRupees(goal.dailyTarget || (goal.amount / goal.days))} per day.`;
    } else {
        targetCallout.textContent = 'Set a goal to calculate daily savings.';
    }
}

async function handleSaveGoal(e) {
    e.preventDefault();
    if (!state.currentProfileId) {
        showToast('Please select a profile first.', 'error');
        return;
    }

    const amountInput = document.getElementById('goalAmount');
    const daysInput = document.getElementById('goalDays');
    const errEl = document.getElementById('goalFormError');
    errEl.classList.remove('visible');

    const amount = parseFloat(amountInput.value);
    const days = parseInt(daysInput.value);
    if (isNaN(amount) || amount <= 0 || isNaN(days) || days <= 0) {
        errEl.textContent = 'Enter valid goal amount and days.';
        errEl.classList.add('visible');
        return;
    }

    if (state.isBackendConnected) {
        try {
            const res = await fetch(`/api/profiles/${state.currentProfileId}/goal`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, days })
            });
            if (!res.ok) throw new Error('Failed to update goal');
            showToast('Savings goal updated!', 'success');
            await loadAllProfileDataFromBackend(state.currentProfileId);
            return;
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }
    }

    const data = getStorageData();
    data.goals[state.currentProfileId] = {
        amount,
        days,
        startDate: getTodayISO(),
        dailyTarget: amount / days
    };
    saveStorageData(data);
    showToast('Savings goal updated!', 'success');
    loadAllProfileDataFromStorage(state.currentProfileId);
}

function renderGroupedSavings(savingsList) {
    const container = document.getElementById('savingsGroupedList');
    if (!state.currentProfileId) {
        container.innerHTML = '<div class="empty-state">Create a profile to track savings</div>';
        return;
    }
    if (!savingsList || savingsList.length === 0) {
        container.innerHTML = '<div class="empty-state">No saved amounts logged yet.</div>';
        return;
    }

    container.innerHTML = savingsList.map(s => `
        <div class="mini-item">
            <div class="mini-item-info">
                <span class="mini-item-title">${formatRupees(s.totalAmount)}</span>
                <span class="mini-item-meta">${formatDateHuman(s.date)} (${s.entriesCount} entr${s.entriesCount === 1 ? 'y' : 'ies'})</span>
            </div>
            <div class="mini-item-actions">
                <button type="button" class="btn btn-sm btn-edit" onclick="openEditSavingsModal('${s.date}', ${s.totalAmount})">Edit</button>
                <button type="button" class="btn btn-sm btn-delete" onclick="handleDeleteSavingsByDate('${s.date}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function handleAddSavings(e) {
    e.preventDefault();
    if (!state.currentProfileId) {
        showToast('Please select a profile first.', 'error');
        return;
    }

    const amountInput = document.getElementById('savingsAmount');
    const dateInput = document.getElementById('savingsDate');
    const errEl = document.getElementById('savingsFormError');
    errEl.classList.remove('visible');

    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) {
        errEl.textContent = 'Amount must be greater than 0.';
        errEl.classList.add('visible');
        return;
    }
    const date = dateInput.value || getTodayISO();

    if (state.isBackendConnected) {
        try {
            const res = await fetch(`/api/profiles/${state.currentProfileId}/savings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, date })
            });
            if (!res.ok) throw new Error('Failed to log savings');
            showToast('Savings entry logged!', 'success');
            amountInput.value = '';
            dateInput.value = getTodayISO();
            await loadAllProfileDataFromBackend(state.currentProfileId);
            return;
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }
    }

    const data = getStorageData();
    if (!data.savings[state.currentProfileId]) data.savings[state.currentProfileId] = [];
    data.savings[state.currentProfileId].push({
        id: Date.now(),
        profileId: state.currentProfileId,
        amount,
        date
    });
    saveStorageData(data);

    showToast('Savings entry logged!', 'success');
    amountInput.value = '';
    dateInput.value = getTodayISO();
    loadAllProfileDataFromStorage(state.currentProfileId);
}

function openEditSavingsModal(dateStr, currentTotal) {
    const modal = document.getElementById('editSavingsModal');
    document.getElementById('editSavingsDate').value = dateStr;
    document.getElementById('editSavingsDateLabel').textContent = `Editing all entries for ${formatDateHuman(dateStr)}`;
    document.getElementById('editSavingsAmount').value = currentTotal;
    document.getElementById('editSavingsError').classList.remove('visible');
    modal.classList.remove('hidden');
    document.getElementById('editSavingsAmount').focus();
}

async function handleSaveEditedSavings(e) {
    e.preventDefault();
    const date = document.getElementById('editSavingsDate').value;
    const amountInput = document.getElementById('editSavingsAmount');
    const errEl = document.getElementById('editSavingsError');
    errEl.classList.remove('visible');

    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) {
        errEl.textContent = 'Amount must be greater than 0.';
        errEl.classList.add('visible');
        return;
    }

    if (state.isBackendConnected) {
        try {
            const res = await fetch(`/api/profiles/${state.currentProfileId}/savings?date=${date}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, date })
            });
            if (!res.ok) throw new Error('Failed to update savings');
            showToast(`Savings updated for ${formatDateHuman(date)}`, 'success');
            document.getElementById('editSavingsModal').classList.add('hidden');
            await loadAllProfileDataFromBackend(state.currentProfileId);
            return;
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }
    }

    const data = getStorageData();
    if (data.savings[state.currentProfileId]) {
        data.savings[state.currentProfileId] = data.savings[state.currentProfileId].filter(s => s.date !== date);
        data.savings[state.currentProfileId].push({
            id: Date.now(),
            profileId: state.currentProfileId,
            amount,
            date
        });
        saveStorageData(data);
    }
    showToast(`Savings updated for ${formatDateHuman(date)}`, 'success');
    document.getElementById('editSavingsModal').classList.add('hidden');
    loadAllProfileDataFromStorage(state.currentProfileId);
}

function handleDeleteSavingsByDate(dateStr) {
    showConfirm(
        'Delete Savings',
        `Are you sure you want to remove all savings entries for ${formatDateHuman(dateStr)}?`,
        async () => {
            if (state.isBackendConnected) {
                try {
                    const res = await fetch(`/api/profiles/${state.currentProfileId}/savings?date=${dateStr}`, {
                        method: 'DELETE'
                    });
                    if (!res.ok) throw new Error('Failed to delete savings');
                    showToast(`Savings deleted for ${formatDateHuman(dateStr)}`, 'success');
                    await loadAllProfileDataFromBackend(state.currentProfileId);
                    return;
                } catch (err) {
                    showToast(err.message, 'error');
                    return;
                }
            }

            const data = getStorageData();
            if (data.savings[state.currentProfileId]) {
                data.savings[state.currentProfileId] = data.savings[state.currentProfileId].filter(s => s.date !== dateStr);
                saveStorageData(data);
            }
            showToast(`Savings deleted for ${formatDateHuman(dateStr)}`, 'success');
            loadAllProfileDataFromStorage(state.currentProfileId);
        }
    );
}

function renderSavingsProgress(goalProg) {
    const banner = document.getElementById('savingsProgressBanner');
    const dailyTargetEl = document.getElementById('progressDailyTarget');
    const totalSavedEl = document.getElementById('progressTotalSaved');
    const remainingEl = document.getElementById('progressRemaining');
    const monthlySummaryEl = document.getElementById('savingsMonthlySummaryText');

    if (!goalProg || !goalProg.hasGoal) {
        banner.className = 'status-banner banner-info';
        banner.textContent = 'Set a goal to see your daily target.';
        dailyTargetEl.textContent = '₹0.00';
        totalSavedEl.textContent = formatRupees(goalProg ? goalProg.totalSaved : 0);
        remainingEl.textContent = '₹0.00';
        monthlySummaryEl.textContent = 'Set a savings goal to view monthly milestones.';
        return;
    }

    banner.textContent = goalProg.bannerText || 'Set a goal to see your daily target.';
    banner.className = `status-banner banner-${goalProg.bannerType === 'success' ? 'success' : 'warning'}`;
    dailyTargetEl.textContent = formatRupees(goalProg.dailyTarget);
    totalSavedEl.textContent = formatRupees(goalProg.totalSaved);
    remainingEl.textContent = formatRupees(goalProg.remaining);
    monthlySummaryEl.textContent = goalProg.monthlySummaryText || 'Log savings to view monthly milestones.';
}

// Challenge
function renderChallenge(ch) {
    const statusText = document.getElementById('challengeStatusText');
    const streakText = document.getElementById('challengeStreakText');
    const progressText = document.getElementById('challengeProgressText');
    const daysInput = document.getElementById('challengeDaysInput');
    const startBtn = document.getElementById('btnStartChallenge');
    const stopBtn = document.getElementById('btnStopChallenge');

    if (!ch) {
        statusText.textContent = 'No active challenge.';
        streakText.textContent = 'Current no-spend streak: 0 day(s).';
        progressText.textContent = '0/0 no-spend days (0.0%)';
        return;
    }

    statusText.textContent = ch.status || 'No active challenge.';
    streakText.textContent = ch.streakText || `Current no-spend streak: ${ch.streak} day(s).`;
    progressText.textContent = ch.progressText || `0/${ch.targetDays || 0} no-spend days (0.0%)`;

    if (ch.targetDays && ch.targetDays > 0) {
        daysInput.value = ch.targetDays;
    }

    if (ch.active) {
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
    } else {
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
    }
}

async function handleStartChallenge() {
    if (!state.currentProfileId) {
        showToast('Please select a profile first.', 'error');
        return;
    }

    const days = parseInt(document.getElementById('challengeDaysInput').value);
    const err = document.getElementById('challengeError');
    err.classList.remove('visible');

    if (isNaN(days) || days <= 0) {
        err.textContent = 'Please enter a valid number of days (> 0).';
        err.classList.add('visible');
        return;
    }

    if (state.isBackendConnected) {
        try {
            const res = await fetch(`/api/profiles/${state.currentProfileId}/challenge/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days })
            });
            if (!res.ok) throw new Error('Failed to start challenge');
            showToast(`Challenge started for ${days} days! 💪`, 'success');
            await loadAllProfileDataFromBackend(state.currentProfileId);
            return;
        } catch (err) {
            err.textContent = err.message;
            err.classList.add('visible');
            return;
        }
    }

    const data = getStorageData();
    const today = new Date();
    const end = new Date();
    end.setDate(today.getDate() + days - 1);
    const endISO = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    data.challenges[state.currentProfileId] = {
        active: true,
        startDate: getTodayISO(),
        endDate: endISO,
        targetDays: days
    };
    saveStorageData(data);
    showToast(`Challenge started for ${days} days! 💪`, 'success');
    loadAllProfileDataFromStorage(state.currentProfileId);
}

async function handleStopChallenge() {
    if (!state.currentProfileId) return;

    if (state.isBackendConnected) {
        try {
            const res = await fetch(`/api/profiles/${state.currentProfileId}/challenge/stop`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to stop challenge');
            showToast('Challenge paused.', 'info');
            await loadAllProfileDataFromBackend(state.currentProfileId);
            return;
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }
    }

    const data = getStorageData();
    if (data.challenges[state.currentProfileId]) {
        data.challenges[state.currentProfileId].active = false;
        saveStorageData(data);
    }
    showToast('Challenge paused.', 'info');
    loadAllProfileDataFromStorage(state.currentProfileId);
}

// Insights & Chart
function renderInsights(insights) {
    const container = document.getElementById('insightsContainer');
    if (!state.currentProfileId) {
        container.innerHTML = '<div class="empty-state">Create a profile to generate insights</div>';
        return;
    }
    if (!insights || insights.length === 0) {
        container.innerHTML = `<div class="insight-item info"><span>ℹ️</span> No critical alerts right now.</div>`;
        return;
    }

    container.innerHTML = insights.map(item => {
        let icon = 'ℹ️';
        if (item.type === 'warning') icon = '⚠️';
        if (item.type === 'risk') icon = '🚨';
        return `
            <div class="insight-item ${escapeHtml(item.type)}">
                <span>${icon}</span> ${escapeHtml(item.message)}
            </div>
        `;
    }).join('');
}

function renderCategoryBreakdownFromFiltered(expenses) {
    const emptyEl = document.getElementById('chartEmptyState');
    if (!state.currentProfileId || !expenses || expenses.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (state.chartInstance) {
            state.chartInstance.destroy();
            state.chartInstance = null;
        }
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    const catMap = {};
    expenses.forEach(e => {
        const cat = e.category || 'Other';
        catMap[cat] = (catMap[cat] || 0) + (e.amount || 0);
    });

    drawChart(Object.keys(catMap), Object.values(catMap));
}

function drawChart(labels, data) {
    const canvas = document.getElementById('categoryPieChart');
    if (!canvas) return;
    if (state.chartInstance) state.chartInstance.destroy();

    const ctx = canvas.getContext('2d');
    state.chartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 16,
                        font: { family: "'Space Grotesk', sans-serif", size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` ${context.label}: ${formatRupees(context.raw || 0)}`;
                        }
                    }
                }
            }
        }
    });
}

function renderAllPanelsEmpty() {
    renderDashboardCard({
        totalSpent: 0,
        budget: 0,
        budgetStatus: 'No monthly budget set yet.',
        usedPercent: 0,
        projectedSpend: 0,
        dailySafeSpend: 0,
        burnRateText: 'Set budget to see burn rate'
    });

    renderExpensesList([]);
    document.getElementById('expensesList').innerHTML = '<div class="empty-state">Create a profile to start tracking</div>';

    renderInsights([]);
    document.getElementById('insightsContainer').innerHTML = '<div class="empty-state">Create a profile to generate insights</div>';

    renderGroupedSavings([]);
    document.getElementById('savingsGroupedList').innerHTML = '<div class="empty-state">Create a profile to track savings</div>';

    renderSavingsProgress(null);
    renderRecurringRules([]);
    renderBillCalendar([]);
    renderChallenge(null);

    const emptyChart = document.getElementById('chartEmptyState');
    if (emptyChart) emptyChart.classList.remove('hidden');
    if (state.chartInstance) {
        state.chartInstance.destroy();
        state.chartInstance = null;
    }
}
