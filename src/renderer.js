// ============================================
// EMPLOYEE ROI v4.0 - Renderer
// Flow exact conform discuției
// ============================================

const app = {
  license: null,
  settings: null,
  employees: [],
  scenarios: [],
  activeJobs: [],
  completedJobs: [],
  countries: [],
  currentPage: 'dashboard',
  currentScenarioResult: null,
  version: null
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const appInfo = await window.api.getAppInfo();
    app.version = appInfo.version;
    document.getElementById('app-version').textContent = `v${appInfo.version}`;
    document.title = appInfo.title;
  } catch (e) {
    console.error('Failed to load app info:', e);
  }
  
  await loadCountries();
  await checkLicense();
  setupEventListeners();
});

async function loadCountries() {
  try {
    const response = await fetch('./data/countries.json');
    const data = await response.json();
    app.countries = data.countries;
    populateCountrySelect();
  } catch (error) {
    console.error('Failed to load countries:', error);
  }
}

function populateCountrySelect() {
  const select = document.getElementById('country-select');
  select.innerHTML = '<option value="">Select country...</option>';
  app.countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.code;
    option.textContent = `${country.name} (${country.currency})`;
    option.dataset.currency = country.currency;
    option.dataset.symbol = country.symbol;
    option.dataset.employerTax = country.employerTax;
    option.dataset.dividendTax = country.dividendTax;
    option.dataset.caTax = country.caTax || 0;
    select.appendChild(option);
  });
}

async function checkLicense() {
  const result = await window.api.checkLicense();
  
  if (!result || result.status === 'missing') {
    // No license - show license screen
    showLicenseScreen();
    return;
  }
  
  app.license = result.license;
  app.licenseStatus = result.status;
  app.settings = await window.api.getSettings();
  
  if (result.status === 'valid') {
    // License valid - full access
    showMainApp();
    await loadAllData();
    renderCurrentPage();
  } else {
    // License expired/invalid/offline - limited access (Settings only)
    showMainApp();
    await loadAllData();
    showLicenseExpiredOverlay(result.status, result.reason);
    navigateTo('settings'); // Force to Settings
  }
}

function showLicenseExpiredOverlay(status, reason) {
  // Create overlay if doesn't exist
  let overlay = document.getElementById('license-expired-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'license-expired-overlay';
    overlay.innerHTML = `
      <div class="overlay-content">
        <div class="overlay-icon">⚠️</div>
        <h2 class="overlay-title">License Issue</h2>
        <p class="overlay-reason"></p>
        <p class="overlay-message">Your data is safe. Go to Settings to renew your license or export your data.</p>
        <div class="overlay-actions">
          <button class="btn btn-primary" onclick="navigateTo('settings'); hideLicenseOverlay();">Go to Settings</button>
        </div>
        <p class="overlay-link">Purchase license: <a href="https://bogdanskissmethod.com/employee-roi" target="_blank">bogdanskissmethod.com</a></p>
      </div>
    `;
    document.body.appendChild(overlay);
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #license-expired-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      #license-expired-overlay .overlay-content {
        background: #1e293b;
        border-radius: 16px;
        padding: 40px;
        text-align: center;
        max-width: 450px;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
      }
      #license-expired-overlay .overlay-icon {
        font-size: 64px;
        margin-bottom: 20px;
      }
      #license-expired-overlay .overlay-title {
        color: #f59e0b;
        font-size: 24px;
        margin-bottom: 10px;
      }
      #license-expired-overlay .overlay-reason {
        color: #ef4444;
        font-size: 16px;
        margin-bottom: 15px;
      }
      #license-expired-overlay .overlay-message {
        color: #94a3b8;
        font-size: 14px;
        margin-bottom: 25px;
        line-height: 1.6;
      }
      #license-expired-overlay .overlay-actions {
        margin-bottom: 20px;
      }
      #license-expired-overlay .overlay-link {
        color: #64748b;
        font-size: 12px;
      }
      #license-expired-overlay .overlay-link a {
        color: #3b82f6;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Set reason text
  const reasonEl = overlay.querySelector('.overlay-reason');
  const statusMessages = {
    'expired': 'Your license has expired.',
    'revoked': 'Your license has been revoked.',
    'invalid': reason || 'Invalid license.',
    'offline_expired': 'Please connect to the internet to verify your license.'
  };
  reasonEl.textContent = statusMessages[status] || 'License verification failed.';
  
  overlay.style.display = 'flex';
}

function hideLicenseOverlay() {
  const overlay = document.getElementById('license-expired-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Check if navigation is allowed (license valid OR going to settings)
function canNavigateTo(page) {
  if (!app.licenseStatus || app.licenseStatus === 'valid') {
    return true;
  }
  // Expired/invalid license - only Settings allowed
  return page === 'settings';
}

function showLicenseScreen() {
  document.getElementById('license-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

function showMainApp() {
  document.getElementById('license-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
}

async function loadAllData() {
  app.employees = await window.api.getEmployees();
  app.scenarios = await window.api.getScenarios();
  app.activeJobs = await window.api.getActiveJobs();
  app.completedJobs = await window.api.getCompletedJobs();
  app.settings = await window.api.getSettings();
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // License form
  document.getElementById('license-form').addEventListener('submit', handleLicenseSubmit);
  document.getElementById('country-select').addEventListener('change', handleCountryChange);
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });
  
  // Employees
  document.getElementById('btn-add-employee').addEventListener('click', () => openEmployeeModal(null));
  document.getElementById('employee-form').addEventListener('submit', handleEmployeeSave);
  document.getElementById('emp-contract').addEventListener('change', updateEmployeeFormFields);
  document.getElementById('emp-payment').addEventListener('change', updateEmployeeFormFields);
  document.getElementById('emp-amount').addEventListener('input', updateEmployeeCostPreview);
  document.getElementById('emp-hours').addEventListener('input', updateEmployeeCostPreview);
  
  // Planning Hub Modal
  document.getElementById('btn-open-planning-modal').addEventListener('click', openPlanningModal);
  document.getElementById('plan-start-date').addEventListener('change', updateDaysInfo);
  document.getElementById('plan-end-date').addEventListener('change', updateDaysInfo);
  document.getElementById('plan-revenue').addEventListener('input', updateLaborBudget);
  document.getElementById('plan-owner').addEventListener('input', updateLaborBudget);
  document.getElementById('plan-admin').addEventListener('input', updateLaborBudget);
  document.getElementById('plan-production').addEventListener('input', updateLaborBudget);
  document.getElementById('plan-include-offbooks').addEventListener('change', toggleOffbooksOption);
  document.getElementById('btn-generate-scenarios').addEventListener('click', generateScenarios);
  document.getElementById('btn-select-employees').addEventListener('click', showEmployeeSelection);
  document.getElementById('btn-save-manual-selection').addEventListener('click', saveManualSelection);
  document.getElementById('btn-cancel-selection').addEventListener('click', cancelEmployeeSelection);
  
  // Jobs tabs
  document.querySelectorAll('#page-jobs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#page-jobs .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#page-jobs .tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
  
  // Team modal
  document.getElementById('btn-add-team-member').addEventListener('click', addTeamMember);
  
  // Complete job
  document.getElementById('btn-confirm-complete').addEventListener('click', confirmCompleteJob);
  
  // Settings
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('btn-save-formula').addEventListener('click', saveFormula);
  document.getElementById('btn-export-data').addEventListener('click', exportData);
  document.getElementById('btn-import-data').addEventListener('click', importData);
  document.getElementById('btn-deactivate-license').addEventListener('click', deactivateLicense);
  
  // Reports
  document.getElementById('btn-export-employees-csv').addEventListener('click', () => exportCSV('employees'));
  document.getElementById('btn-export-jobs-csv').addEventListener('click', () => exportCSV('jobs'));
  
  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
  
  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAllModals();
    });
  });
  
  // Set default dates
  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  document.getElementById('plan-start-date').value = today.toISOString().split('T')[0];
  document.getElementById('plan-end-date').value = nextWeek.toISOString().split('T')[0];
}

// ============================================
// LICENSE
// ============================================
async function handleLicenseSubmit(e) {
  e.preventDefault();
  
  const select = document.getElementById('country-select');
  const option = select.selectedOptions[0];
  const submitBtn = document.querySelector('#license-form button[type="submit"]');
  
  // Disable button during activation
  submitBtn.disabled = true;
  submitBtn.textContent = 'Activating...';
  
  const data = {
    key: document.getElementById('license-key').value.trim(),
    companyName: document.getElementById('company-name').value.trim(),
    country: select.value,
    currency: option?.dataset.currency || 'RON',
    symbol: option?.dataset.symbol || 'lei',
    employerTax: parseFloat(document.getElementById('employer-tax').value) || 42.5,
    dividendTax: parseFloat(document.getElementById('dividend-tax').value) || 8,
    caTax: parseFloat(document.getElementById('ca-tax').value) || 3
  };
  
  const result = await window.api.activateLicense(data);
  
  submitBtn.disabled = false;
  submitBtn.textContent = 'Activate License';
  
  if (result.success) {
    app.license = result.license;
    app.licenseStatus = 'valid';
    app.settings = await window.api.getSettings();
    hideLicenseOverlay();
    showMainApp();
    await loadAllData();
    renderCurrentPage();
  } else {
    alert(result.error || 'Invalid license key');
  }
}

function handleCountryChange() {
  const select = document.getElementById('country-select');
  const option = select.selectedOptions[0];
  
  if (option && option.value) {
    document.getElementById('employer-tax').value = option.dataset.employerTax || 0;
    document.getElementById('dividend-tax').value = option.dataset.dividendTax || 0;
    document.getElementById('ca-tax').value = option.dataset.caTax || 0;
  }
}

async function deactivateLicense() {
  if (!confirm('Change license?\n\nYour data (employees, jobs, settings) will be preserved.\nThe application will close. Please reopen to enter a new license key.')) return;
  await window.api.deactivateLicense();
  await window.api.quitApp();
}

// ============================================
// NAVIGATION
// ============================================
function navigateTo(page) {
  // Check if navigation is allowed
  if (!canNavigateTo(page)) {
    showLicenseExpiredOverlay(app.licenseStatus, 'Please renew your license to access this section.');
    return;
  }
  
  app.currentPage = page;
  
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
  });
  
  renderCurrentPage();
}

async function renderCurrentPage() {
  switch (app.currentPage) {
    case 'dashboard':
      await renderDashboard();
      break;
    case 'employees':
      renderEmployees();
      break;
    case 'planning':
      renderPlanningPage();
      break;
    case 'jobs':
      renderJobs();
      break;
    case 'reports':
      await renderReports();
      break;
    case 'settings':
      renderSettings();
      break;
  }
}

// ============================================
// DASHBOARD
// ============================================
let currentDashboardMonth = null;

async function renderDashboard() {
  // Populate month selector if not already done
  const monthSelector = document.getElementById('dash-month-selector');
  if (monthSelector.options.length === 0) {
    await populateMonthSelector();
  }
  
  // Get selected month (or use current)
  const selectedMonth = currentDashboardMonth || monthSelector.value;
  const data = await window.api.getDashboardData(selectedMonth);
  const symbol = app.settings?.symbol || 'lei';
  
  document.getElementById('dash-budget-completed').textContent = formatCurrency(data.budgetFromCompleted, symbol);
  document.getElementById('dash-budget-active').textContent = formatCurrency(data.budgetFromActive, symbol);
  document.getElementById('dash-salaries').textContent = formatCurrency(data.salariesToPay, symbol);
  
  const balance = data.balance;
  const balanceEl = document.getElementById('dash-balance');
  balanceEl.textContent = formatCurrency(balance, symbol);
  balanceEl.style.color = balance >= 0 ? 'var(--success)' : 'var(--danger)';
  
  document.getElementById('dash-completed-count').textContent = data.completedThisMonthCount;
  document.getElementById('dash-active-count').textContent = data.activeJobsCount;
  document.getElementById('dash-employees-count').textContent = data.productionEmployeesCount;
  document.getElementById('dash-revenue').textContent = formatCurrency(data.monthRevenue, symbol);
}

async function populateMonthSelector() {
  const months = await window.api.getAvailableMonths();
  const monthSelector = document.getElementById('dash-month-selector');
  
  // Get current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Clear and populate
  monthSelector.innerHTML = '';
  
  // Add current month if not in list
  if (!months.includes(currentMonth)) {
    months.unshift(currentMonth);
  }
  
  months.forEach(month => {
    const option = document.createElement('option');
    option.value = month;
    
    // Format: "Feb 2026" from "2026-02"
    const [year, monthNum] = month.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    option.textContent = `${monthNames[parseInt(monthNum) - 1]} ${year}`;
    
    if (month === currentMonth) {
      option.selected = true;
      currentDashboardMonth = currentMonth;
    }
    
    monthSelector.appendChild(option);
  });
  
  // Add event listener
  monthSelector.addEventListener('change', async () => {
    currentDashboardMonth = monthSelector.value;
    await renderDashboard();
  });
  
  // Current month button
  document.getElementById('dash-current-month').addEventListener('click', async () => {
    currentDashboardMonth = currentMonth;
    monthSelector.value = currentMonth;
    await renderDashboard();
  });
}

// ============================================
// EMPLOYEES
// ============================================
function renderEmployees() {
  const tbody = document.getElementById('employees-table-body');
  const symbol = app.settings?.symbol || 'lei';
  
  if (app.employees.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No employees. Click "Add Employee" to start.</td></tr>';
    return;
  }
  
  tbody.innerHTML = app.employees.map(emp => `
    <tr>
      <td>
        <strong>${emp.firstName} ${emp.lastName}</strong>
        ${emp.trade ? `<br><small class="text-muted">${emp.trade}</small>` : ''}
      </td>
      <td><span class="badge badge-${getDepartmentBadge(emp.department)}">${emp.department}</span></td>
      <td><span class="badge badge-${getContractBadge(emp.contractType)}">${formatContractType(emp.contractType)}</span></td>
      <td>${emp.acceptsOvertime ? '✅' : '❌'}</td>
      <td class="text-right">${formatCurrency(emp.costPerHour, symbol)}</td>
      <td class="text-right">${formatCurrency(emp.totalMonthlyCost, symbol)}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-secondary" onclick="viewEmployeeHistory('${emp.id}')" title="History">📊</button>
        <button class="btn btn-sm btn-primary" onclick="openEmployeeModal('${emp.id}')" title="Edit">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEmployee('${emp.id}')" title="Delete">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function openEmployeeModal(employeeId) {
  const modal = document.getElementById('employee-modal');
  const form = document.getElementById('employee-form');
  const title = document.getElementById('employee-modal-title');
  
  form.reset();
  
  if (employeeId) {
    const emp = app.employees.find(e => e.id === employeeId);
    if (!emp) return;
    
    title.textContent = 'Edit Employee';
    document.getElementById('emp-id').value = emp.id;
    document.getElementById('emp-first-name').value = emp.firstName;
    document.getElementById('emp-last-name').value = emp.lastName;
    document.getElementById('emp-department').value = emp.department;
    document.getElementById('emp-trade').value = emp.trade || '';
    document.getElementById('emp-contract').value = emp.contractType;
    document.getElementById('emp-payment').value = emp.paymentModel;
    document.getElementById('emp-amount').value = emp.netAmount;
    document.getElementById('emp-hours').value = emp.hoursPerMonth || 168;
    document.getElementById('emp-accepts-overtime').checked = emp.acceptsOvertime || false;
    
    updateEmployeeCostPreview();
  } else {
    title.textContent = 'Add Employee';
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-hours').value = 168;
  }
  
  updateEmployeeFormFields();
  modal.classList.add('active');
}

function updateEmployeeFormFields() {
  const contract = document.getElementById('emp-contract').value;
  const paymentGroup = document.getElementById('emp-payment').parentElement;
  
  if (contract === 'offbooks' || contract === 'daily') {
    document.getElementById('emp-payment').value = 'daily';
    paymentGroup.style.display = 'none';
  } else {
    paymentGroup.style.display = 'block';
  }
  
  updateEmployeeCostPreview();
}

async function updateEmployeeCostPreview() {
  const employee = {
    contractType: document.getElementById('emp-contract').value,
    paymentModel: document.getElementById('emp-payment').value,
    netAmount: parseFloat(document.getElementById('emp-amount').value) || 0,
    hoursPerMonth: parseFloat(document.getElementById('emp-hours').value) || 168
  };
  
  const costs = await window.api.calculateEmployeeCost(employee);
  const symbol = app.settings?.symbol || 'lei';
  
  document.getElementById('emp-cost-hour').textContent = formatCurrency(costs.costPerHour, symbol);
  document.getElementById('emp-cost-day').textContent = formatCurrency(costs.costPerDay, symbol);
  document.getElementById('emp-cost-month').textContent = formatCurrency(costs.totalMonthlyCost, symbol);
}

async function handleEmployeeSave(e) {
  e.preventDefault();
  
  const employee = {
    firstName: document.getElementById('emp-first-name').value.trim(),
    lastName: document.getElementById('emp-last-name').value.trim(),
    department: document.getElementById('emp-department').value,
    trade: document.getElementById('emp-trade').value.trim(),
    contractType: document.getElementById('emp-contract').value,
    paymentModel: document.getElementById('emp-payment').value,
    netAmount: parseFloat(document.getElementById('emp-amount').value) || 0,
    hoursPerMonth: parseFloat(document.getElementById('emp-hours').value) || 168,
    acceptsOvertime: document.getElementById('emp-accepts-overtime').checked
  };
  
  const empId = document.getElementById('emp-id').value;
  
  let result;
  if (empId) {
    employee.id = empId;
    result = await window.api.updateEmployee(employee);
  } else {
    result = await window.api.addEmployee(employee);
  }
  
  if (result.success) {
    closeAllModals();
    await loadAllData();
    renderEmployees();
  } else {
    alert(result.error || 'Failed to save employee');
  }
}

async function deleteEmployee(id) {
  if (!confirm('Delete this employee?')) return;
  
  const result = await window.api.deleteEmployee(id);
  if (result.success) {
    await loadAllData();
    renderEmployees();
  }
}

async function viewEmployeeHistory(employeeId) {
  const emp = app.employees.find(e => e.id === employeeId);
  if (!emp) return;
  
  const symbol = app.settings?.symbol || 'lei';
  const timesheets = await window.api.getAllTimesheets();
  const jobHistory = await window.api.getEmployeeJobHistory(employeeId);
  
  // Get hours from timesheets (for display)
  let totalWorked = 0, totalProduced = 0, revenueGenerated = 0;
  
  Object.values(timesheets).forEach(ts => {
    if (ts.employeeId === employeeId) {
      totalWorked += ts.totals?.workedHours || 0;
      totalProduced += ts.totals?.producedHours || 0;
      revenueGenerated += ts.totals?.revenueGenerated || 0;
    }
  });
  
  // Get salary data from jobHistory (correct values per job)
  let totalNormalHours = 0, totalOTHours = 0;
  let totalNormalSalary = 0, totalOTSalary = 0;
  let totalBonus = 0;
  let totalSalary = 0;
  
  jobHistory.forEach(job => {
    totalNormalHours += job.normalHours || 0;
    totalOTHours += job.overtimeHours || 0;
    totalNormalSalary += job.salaryNormal || 0;
    totalOTSalary += job.salaryOT || 0;
    totalSalary += job.totalSalary || 0;
    totalBonus += job.bonus || 0;
  });
  
  const efficiency = totalWorked > 0 ? Math.round((totalProduced / totalWorked) * 100) : 100;
  const difference = revenueGenerated - totalSalary;
  
  document.getElementById('history-employee-name').textContent = `${emp.firstName} ${emp.lastName}`;
  document.getElementById('history-employee-info').textContent = `${emp.trade || '-'} | ${emp.department} | ${formatContractType(emp.contractType)}`;
  
  document.getElementById('history-worked-hours').textContent = `${Math.round(totalWorked)}h`;
  document.getElementById('history-produced-hours').textContent = `${Math.round(totalProduced)}h`;
  document.getElementById('history-efficiency').textContent = `${efficiency}%`;
  
  const diffEl = document.getElementById('history-difference');
  diffEl.textContent = formatCurrency(difference, symbol);
  diffEl.style.color = difference >= 0 ? 'var(--success)' : 'var(--danger)';
  
  // Render salary summary from jobHistory
  const salarySummary = document.getElementById('history-salary-summary');
  if (salarySummary) {
    salarySummary.innerHTML = `
      <div class="salary-row"><span>Normal Salary (${Math.round(totalNormalHours)}h):</span> <strong>${formatCurrency(totalNormalSalary, symbol)}</strong></div>
      <div class="salary-row"><span>OT Salary (${Math.round(totalOTHours)}h × 1.5):</span> <strong>${formatCurrency(totalOTSalary, symbol)}</strong></div>
      <div class="salary-row"><span>Total Salary:</span> <strong>${formatCurrency(totalSalary, symbol)}</strong></div>
      <div class="salary-row bonus"><span>Production Bonus:</span> <strong style="color: var(--success)">${formatCurrency(totalBonus, symbol)}</strong></div>
    `;
  }
  
  // Render job history
  const jobHistoryContainer = document.getElementById('history-job-list');
  if (jobHistoryContainer) {
    if (jobHistory.length === 0) {
      jobHistoryContainer.innerHTML = '<p class="text-muted">No completed jobs yet</p>';
    } else {
      jobHistoryContainer.innerHTML = jobHistory.map(job => {
        const eff = job.hoursWorked > 0 ? Math.round((job.hoursProduced / job.hoursWorked) * 100) : 100;
        return `
          <div class="job-history-item">
            <div class="job-header">
              <strong>${job.jobName}</strong>
              <span class="text-muted">${job.client || '-'}</span>
            </div>
            <div class="job-details">
              <span>Period: ${job.startDate} - ${job.endDate}</span>
              <span>Hours: ${job.hoursWorked}h worked / ${job.hoursProduced}h produced (${eff}%)</span>
            </div>
            <div class="job-financials">
              <span>Normal: ${formatCurrency(job.salaryNormal, symbol)} (${job.normalHours}h)</span>
              <span>OT: ${formatCurrency(job.salaryOT, symbol)} (${job.overtimeHours}h)</span>
              <span class="bonus">Bonus: ${formatCurrency(job.bonus, symbol)}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }
  
  // Render timesheet pentru luna curentă
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const ts = await window.api.getTimesheet({ employeeId, year, month });
  
  renderTimesheetCalendar(ts);
  
  document.getElementById('employee-history-modal').classList.add('active');
}

function renderTimesheetCalendar(ts) {
  const container = document.getElementById('history-timesheet');
  
  if (!ts || !ts.days) {
    container.innerHTML = '<p class="text-muted">No timesheet data</p>';
    return;
  }
  
  const daysInMonth = Object.keys(ts.days).length;
  
  let html = '<table class="timesheet-table"><thead><tr><th class="row-label">Type</th>';
  
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(ts.year, ts.month - 1, d);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    html += `<th class="day-header ${isWeekend ? 'weekend' : ''}">${d}</th>`;
  }
  html += '<th>Total</th></tr></thead><tbody>';
  
  // Ore standard
  html += '<tr><td class="row-label">Standard</td>';
  let totalStandard = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = ts.days[d];
    const isWeekend = new Date(ts.year, ts.month - 1, d).getDay() % 6 === 0;
    html += `<td class="${isWeekend ? 'weekend' : ''}">${day?.standard || 0}</td>`;
    totalStandard += day?.standard || 0;
  }
  html += `<td><strong>${totalStandard}</strong></td></tr>`;
  
  // Ore lucrate
  html += '<tr><td class="row-label">Worked</td>';
  let totalWorked = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = ts.days[d];
    const isWeekend = new Date(ts.year, ts.month - 1, d).getDay() % 6 === 0;
    const worked = Math.round(day?.worked || 0);
    html += `<td class="${isWeekend ? 'weekend' : ''}">${worked || '-'}</td>`;
    totalWorked += day?.worked || 0;
  }
  html += `<td><strong>${Math.round(totalWorked)}</strong></td></tr>`;
  
  // Ore produse
  html += '<tr><td class="row-label">Produced</td>';
  let totalProduced = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = ts.days[d];
    const isWeekend = new Date(ts.year, ts.month - 1, d).getDay() % 6 === 0;
    const produced = Math.round(day?.produced || 0);
    html += `<td class="${isWeekend ? 'weekend' : ''}">${produced || '-'}</td>`;
    totalProduced += day?.produced || 0;
  }
  html += `<td><strong>${Math.round(totalProduced)}</strong></td></tr>`;
  
  html += '</tbody></table>';
  
  container.innerHTML = html;
}

// ============================================
// PLANNING HUB - Modal
// ============================================
function openPlanningModal() {
  // Reset form
  document.getElementById('plan-job-name').value = '';
  document.getElementById('plan-client').value = '';
  document.getElementById('plan-start-date').value = '';
  document.getElementById('plan-end-date').value = '';
  document.getElementById('plan-hours').value = '';
  document.getElementById('plan-revenue').value = '';
  document.getElementById('plan-effective-days').value = '';
  document.getElementById('plan-include-offbooks').checked = false;
  document.getElementById('plan-offbooks-cost').value = '';
  document.getElementById('offbooks-cost-group').style.display = 'none';
  document.getElementById('effective-days-group').style.display = 'none';
  document.getElementById('days-info').classList.add('hidden');
  document.getElementById('scenarios-container').classList.add('hidden');
  document.getElementById('scenarios-grid').innerHTML = '';
  
  // Set default formula values from settings
  const defaultOwner = app.settings?.formula?.owner || 30;
  const defaultAdmin = app.settings?.formula?.admin || 20;
  const defaultProduction = app.settings?.formula?.production || 50;
  document.getElementById('plan-owner').value = defaultOwner;
  document.getElementById('plan-admin').value = defaultAdmin;
  document.getElementById('plan-production').value = defaultProduction;
  document.getElementById('plan-labor-budget').textContent = '0 ' + (app.settings?.symbol || 'lei');
  
  // Clear scenario result
  app.currentScenarioResult = null;
  
  // Open modal
  document.getElementById('planning-modal').classList.add('active');
}

function renderPlanningPage() {
  // Render saved scenarios (not activated yet)
  const container = document.getElementById('planning-saved-scenarios');
  const symbol = app.settings?.symbol || 'lei';
  
  const planningScenarios = app.scenarios.filter(s => s.status === 'planning');
  
  if (planningScenarios.length === 0) {
    container.innerHTML = '<p class="text-muted">No saved scenarios. Click "Plan New Job" to create one.</p>';
    return;
  }
  
  container.innerHTML = planningScenarios.map(scenario => `
    <div class="card mb-10">
      <div class="card-header">
        <h4>${scenario.jobDetails.jobName}</h4>
        <div>
          <button class="btn btn-sm btn-success" onclick="activateScenario('${scenario.id}')">▶️ Activate</button>
          <button class="btn btn-sm btn-danger" onclick="deleteScenario('${scenario.id}')">🗑️</button>
        </div>
      </div>
      <p class="text-muted">Client: ${scenario.jobDetails.client || '-'} | ${scenario.jobDetails.startDate} to ${scenario.jobDetails.endDate}</p>
      <p><strong>Revenue:</strong> ${formatCurrency(scenario.jobDetails.revenue, symbol)} | 
         <strong>Labor Budget:</strong> ${formatCurrency(scenario.laborBudget, symbol)} |
         <strong>Hours:</strong> ${scenario.jobDetails.hoursNeeded}h</p>
      <p><strong>Scenario:</strong> ${scenario.selectedScenario.name} - ${formatCurrency(scenario.selectedScenario.totalCost, symbol)}</p>
    </div>
  `).join('');
}

function updateDaysInfo() {
  const startDate = document.getElementById('plan-start-date').value;
  const endDate = document.getElementById('plan-end-date').value;
  
  if (!startDate || !endDate) {
    document.getElementById('days-info').classList.add('hidden');
    document.getElementById('effective-days-group').style.display = 'none';
    return;
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let totalDays = 0, workingDays = 0, weekendDays = 0;
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    totalDays++;
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendDays++;
    } else {
      workingDays++;
    }
  }
  
  document.getElementById('period-days').textContent = totalDays;
  document.getElementById('period-working').textContent = workingDays;
  document.getElementById('period-weekend').textContent = weekendDays;
  document.getElementById('days-info').classList.remove('hidden');
  document.getElementById('effective-days-group').style.display = 'block';
  
  // Set default effective days to calendar days (user can reduce)
  const effectiveInput = document.getElementById('plan-effective-days');
  if (!effectiveInput.value) {
    effectiveInput.placeholder = `Auto: ${totalDays} (max)`;
    effectiveInput.max = totalDays;
  }
}

function updateLaborBudget() {
  const revenue = parseFloat(document.getElementById('plan-revenue').value) || 0;
  const production = parseFloat(document.getElementById('plan-production').value) || 50;
  const laborBudget = (revenue * production) / 100;
  
  const symbol = app.settings?.symbol || 'lei';
  document.getElementById('plan-labor-budget').textContent = formatCurrency(laborBudget, symbol);
}

function toggleOffbooksOption() {
  const checked = document.getElementById('plan-include-offbooks').checked;
  document.getElementById('offbooks-cost-group').style.display = checked ? 'block' : 'none';
}

async function generateScenarios() {
  const jobName = document.getElementById('plan-job-name').value.trim();
  const client = document.getElementById('plan-client').value.trim();
  const revenue = parseFloat(document.getElementById('plan-revenue').value) || 0;
  const hoursNeeded = parseFloat(document.getElementById('plan-hours').value) || 0;
  const startDate = document.getElementById('plan-start-date').value;
  const endDate = document.getElementById('plan-end-date').value;
  const effectiveDays = document.getElementById('plan-effective-days').value || null;
  
  if (!jobName) { alert('Enter job name'); return; }
  if (!revenue) { alert('Enter revenue'); return; }
  if (!hoursNeeded) { alert('Enter hours needed'); return; }
  if (!startDate || !endDate) { alert('Select dates'); return; }
  
  const formula = {
    owner: parseFloat(document.getElementById('plan-owner').value) || 30,
    admin: parseFloat(document.getElementById('plan-admin').value) || 20,
    production: parseFloat(document.getElementById('plan-production').value) || 50
  };
  
  const includeOffbooks = document.getElementById('plan-include-offbooks').checked;
  const offbooksCostPerDay = includeOffbooks 
    ? (parseFloat(document.getElementById('plan-offbooks-cost').value) || 0)
    : 0;
  
  const result = await window.api.generateScenarios({
    jobName, client, revenue, startDate, endDate, hoursNeeded, formula, offbooksCostPerDay, effectiveDays
  });
  
  app.currentScenarioResult = result;
  renderScenarios(result);
}

function renderScenarios(result) {
  const container = document.getElementById('scenarios-container');
  const grid = document.getElementById('scenarios-grid');
  const symbol = app.settings?.symbol || 'lei';
  
  if (!result.scenarios || result.scenarios.length === 0) {
    grid.innerHTML = '<p class="alert alert-warning">No scenarios available. Add production employees first.</p>';
    container.classList.remove('hidden');
    return;
  }
  
  grid.innerHTML = result.scenarios.map((scenario, idx) => `
    <div class="scenario-card" data-index="${idx}">
      <div class="scenario-header">
        <h4>${scenario.name}</h4>
        ${scenario.withinBudget 
          ? '<span class="badge badge-success">✅ Within budget</span>' 
          : '<span class="badge badge-danger">⚠️ Over budget</span>'}
      </div>
      <div class="scenario-body">
        ${scenario.team.map(m => `
          <div class="scenario-team-item">
            <span>${m.name} (${m.hoursPerDay}h/day)${m.acceptsOvertime ? ' +OT' : ''}</span>
            <span>${m.hoursAllocated}h = ${formatCurrency(m.cost, symbol)}</span>
          </div>
        `).join('')}
        ${scenario.shortageMessage ? `<div class="alert alert-warning mt-10">${scenario.shortageMessage}</div>` : ''}
      </div>
      <div class="scenario-footer">
        <div>
          <strong>Total:</strong> ${formatCurrency(scenario.totalCost, symbol)}<br>
          <strong>Hours:</strong> ${scenario.totalHours}h / ${result.jobDetails.hoursNeeded}h (${Math.round(scenario.coveragePercent)}%)
        </div>
        <button class="btn btn-primary btn-sm" onclick="selectScenario(${idx})">📋 Save</button>
      </div>
    </div>
  `).join('');
  
  container.classList.remove('hidden');
}

async function selectScenario(index) {
  if (!app.currentScenarioResult) return;
  
  const scenario = app.currentScenarioResult.scenarios[index];
  const result = app.currentScenarioResult;
  
  const saveResult = await window.api.saveScenario({
    jobDetails: result.jobDetails,
    laborBudget: result.laborBudget,
    totalDays: result.totalDays,
    workingDays: result.workingDays,
    selectedScenario: scenario
  });
  
  if (saveResult.success) {
    alert('Saved! Go to Jobs → Planning to activate.');
    
    // Clear and close modal
    app.currentScenarioResult = null;
    closeAllModals();
    
    await loadAllData();
    renderPlanningPage();
    navigateTo('jobs');
  }
}
window.selectScenario = selectScenario;

// ============================================
// MANUAL EMPLOYEE SELECTION
// ============================================
async function showEmployeeSelection() {
  // Validate inputs
  const startDate = document.getElementById('plan-start-date').value;
  const endDate = document.getElementById('plan-end-date').value;
  const hoursNeeded = parseFloat(document.getElementById('plan-hours').value) || 0;
  const revenue = parseFloat(document.getElementById('plan-revenue').value) || 0;
  
  if (!startDate || !endDate) {
    alert('Please select start and end dates first');
    return;
  }
  
  if (!hoursNeeded) {
    alert('Please enter hours needed');
    return;
  }
  
  // Get Production employees and their availability
  const productionEmployees = app.employees.filter(e => e.department === 'Production');
  const symbol = app.settings?.symbol || 'lei';
  
  const listContainer = document.getElementById('employee-selection-list');
  
  let html = '';
  for (const emp of productionEmployees) {
    const availability = await window.api.getEmployeeAvailability({
      employeeId: emp.id,
      startDate,
      endDate
    });
    
    const availableHours = availability.availableHours || 0;
    const isFull = availableHours <= 0;
    const costs = await window.api.calculateEmployeeCost(emp);
    
    html += `
      <div class="employee-selection-item" data-employee-id="${emp.id}" data-hours="${availableHours}" data-cost="${costs.costPerHour}">
        <input type="checkbox" class="emp-checkbox" ${isFull ? 'disabled' : ''}>
        <div class="emp-info">
          <div class="emp-name">${emp.firstName} ${emp.lastName}</div>
          <div class="emp-details">${emp.trade || '-'} | ${formatContractType(emp.contractType)} | ${formatCurrency(costs.costPerHour, symbol)}/h</div>
        </div>
        <div class="emp-availability ${isFull ? 'full' : 'available'}">
          ${isFull ? 'Not Available' : `${availableHours}h available`}
        </div>
      </div>
    `;
  }
  
  if (productionEmployees.length === 0) {
    html = '<p class="text-muted">No Production employees found. Add employees first.</p>';
  }
  
  listContainer.innerHTML = html;
  
  // Add change listeners for checkboxes
  listContainer.querySelectorAll('.emp-checkbox').forEach(cb => {
    cb.addEventListener('change', updateSelectionSummary);
  });
  
  // Show container, hide scenarios
  document.getElementById('employee-selection-container').classList.remove('hidden');
  document.getElementById('scenarios-container').classList.add('hidden');
  document.getElementById('summary-needed').textContent = `${hoursNeeded}h`;
  
  updateSelectionSummary();
}

function updateSelectionSummary() {
  const symbol = app.settings?.symbol || 'lei';
  const checkboxes = document.querySelectorAll('#employee-selection-list .emp-checkbox:checked');
  
  let totalHours = 0;
  let totalCost = 0;
  let count = 0;
  
  checkboxes.forEach(cb => {
    const item = cb.closest('.employee-selection-item');
    const hours = parseFloat(item.dataset.hours) || 0;
    const costPerHour = parseFloat(item.dataset.cost) || 0;
    
    totalHours += hours;
    totalCost += hours * costPerHour;
    count++;
  });
  
  document.getElementById('summary-count').textContent = count;
  document.getElementById('summary-hours').textContent = `${Math.round(totalHours)}h`;
  document.getElementById('summary-cost').textContent = formatCurrency(totalCost, symbol);
  
  const summaryContainer = document.getElementById('selection-summary');
  if (count > 0) {
    summaryContainer.classList.remove('hidden');
  } else {
    summaryContainer.classList.add('hidden');
  }
}

async function saveManualSelection() {
  const checkboxes = document.querySelectorAll('#employee-selection-list .emp-checkbox:checked');
  
  if (checkboxes.length === 0) {
    alert('Please select at least one employee');
    return;
  }
  
  const jobName = document.getElementById('plan-job-name').value || 'Unnamed Job';
  const client = document.getElementById('plan-client').value || '';
  const startDate = document.getElementById('plan-start-date').value;
  const endDate = document.getElementById('plan-end-date').value;
  const hoursNeeded = parseFloat(document.getElementById('plan-hours').value) || 0;
  const revenue = parseFloat(document.getElementById('plan-revenue').value) || 0;
  const owner = parseFloat(document.getElementById('plan-owner').value) || 30;
  const admin = parseFloat(document.getElementById('plan-admin').value) || 20;
  const production = parseFloat(document.getElementById('plan-production').value) || 50;
  
  const laborBudget = revenue * (production / 100);
  const symbol = app.settings?.symbol || 'lei';
  
  // Build team from selection
  const team = [];
  let totalHours = 0;
  let totalCost = 0;
  
  for (const cb of checkboxes) {
    const item = cb.closest('.employee-selection-item');
    const empId = item.dataset.employeeId;
    const hours = parseFloat(item.dataset.hours) || 0;
    const costPerHour = parseFloat(item.dataset.cost) || 0;
    const emp = app.employees.find(e => e.id === empId);
    
    team.push({
      employeeId: empId,
      name: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
      contractType: emp?.contractType || 'permanent',
      allocatedHours: hours,
      costPerHour: costPerHour,
      cost: hours * costPerHour
    });
    
    totalHours += hours;
    totalCost += hours * costPerHour;
  }
  
  // Calculate days
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  let workingDays = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) workingDays++;
  }
  
  // Create scenario
  const manualScenario = {
    name: 'Manual Selection',
    description: `${team.length} employees selected manually`,
    team,
    totalHours,
    totalCost,
    difference: laborBudget - totalCost
  };
  
  const saveResult = await window.api.saveScenario({
    jobDetails: {
      jobName,
      client,
      startDate,
      endDate,
      hoursNeeded,
      revenue,
      formula: { owner, admin, production }
    },
    laborBudget,
    totalDays,
    workingDays,
    selectedScenario: manualScenario
  });
  
  if (saveResult.success) {
    alert('Manual selection saved! Go to Jobs → Planning to activate.');
    
    closeAllModals();
    await loadAllData();
    renderPlanningPage();
    navigateTo('jobs');
  }
}

function cancelEmployeeSelection() {
  document.getElementById('employee-selection-container').classList.add('hidden');
  document.getElementById('selection-summary').classList.add('hidden');
}

// ============================================
// JOBS
// ============================================
function renderJobs() {
  renderPlanningScenarios();
  renderActiveJobs();
  renderCompletedJobs();
}

function renderPlanningScenarios() {
  const container = document.getElementById('planning-scenarios-list');
  const symbol = app.settings?.symbol || 'lei';
  
  const planningScenarios = app.scenarios.filter(s => s.status === 'planning');
  
  if (planningScenarios.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No saved scenarios. Go to Planning Hub to create one.</div>';
    return;
  }
  
  container.innerHTML = planningScenarios.map(scenario => `
    <div class="card">
      <div class="card-header">
        <h3>${scenario.jobDetails.jobName}</h3>
        <div>
          <button class="btn btn-sm btn-success" onclick="activateScenario('${scenario.id}')">▶️ Activate</button>
          <button class="btn btn-sm btn-danger" onclick="deleteScenario('${scenario.id}')">🗑️</button>
        </div>
      </div>
      <p class="text-muted">Client: ${scenario.jobDetails.client || '-'} | ${scenario.jobDetails.startDate} to ${scenario.jobDetails.endDate}</p>
      <p><strong>Revenue:</strong> ${formatCurrency(scenario.jobDetails.revenue, symbol)} | 
         <strong>Labor Budget:</strong> ${formatCurrency(scenario.laborBudget, symbol)} |
         <strong>Hours:</strong> ${scenario.jobDetails.hoursNeeded}h</p>
      <p><strong>Scenario:</strong> ${scenario.selectedScenario.name} - ${formatCurrency(scenario.selectedScenario.totalCost, symbol)}</p>
    </div>
  `).join('');
}

async function activateScenario(scenarioId) {
  const result = await window.api.activateJob(scenarioId);
  if (result.success) {
    await loadAllData();
    renderJobs();
    document.querySelector('#page-jobs .tab[data-tab="active"]').click();
  } else {
    alert(result.error || 'Failed to activate');
  }
}
window.activateScenario = activateScenario;

async function deleteScenario(scenarioId) {
  if (!confirm('Delete this scenario?')) return;
  await window.api.deleteScenario(scenarioId);
  await loadAllData();
  renderJobs();
}
window.deleteScenario = deleteScenario;

function renderActiveJobs() {
  const container = document.getElementById('active-jobs-list');
  const symbol = app.settings?.symbol || 'lei';
  
  if (app.activeJobs.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No active jobs.</div>';
    return;
  }
  
  container.innerHTML = app.activeJobs.map(job => `
    <div class="card">
      <div class="card-header">
        <h3>${job.name}</h3>
        <div>
          <button class="btn btn-sm btn-secondary" onclick="openTeamModal('${job.id}')">👥 Team</button>
          <button class="btn btn-sm btn-success" onclick="openCompleteModal('${job.id}')">✅ Complete</button>
        </div>
      </div>
      <p class="text-muted">Client: ${job.client || '-'} | ${job.startDate} to ${job.endDate}</p>
      <p><strong>Revenue:</strong> ${formatCurrency(job.revenue, symbol)} | 
         <strong>Labor Budget:</strong> ${formatCurrency(job.laborBudget, symbol)}</p>
      <h4 class="mt-10">Team (${job.team.length} members)</h4>
      <table class="mt-10">
        <thead><tr><th>Name</th><th>Contract</th><th class="text-right">Hours</th><th class="text-right">Cost</th></tr></thead>
        <tbody>
          ${job.team.map(m => `
            <tr>
              <td>${m.name}</td>
              <td><span class="badge badge-${getContractBadge(m.contractType)}">${formatContractType(m.contractType)}</span></td>
              <td class="text-right">${m.hoursAllocated}h</td>
              <td class="text-right">${formatCurrency(m.cost, symbol)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');
}

function renderCompletedJobs() {
  const container = document.getElementById('completed-jobs-list');
  const symbol = app.settings?.symbol || 'lei';
  
  if (app.completedJobs.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No completed jobs.</div>';
    return;
  }
  
  container.innerHTML = app.completedJobs.map(job => `
    <div class="card">
      <div class="card-header">
        <h3>${job.name}</h3>
        <span class="badge badge-success">Completed ${new Date(job.completedAt).toLocaleDateString()}</span>
      </div>
      <p class="text-muted">Client: ${job.client || '-'}</p>
      <div class="stats-grid mt-10">
        <div class="stat-card small">
          <div class="stat-label">Revenue</div>
          <div class="stat-value">${formatCurrency(job.revenue, symbol)}</div>
        </div>
        <div class="stat-card small">
          <div class="stat-label">Actual Cost</div>
          <div class="stat-value">${formatCurrency(job.actualLaborCost, symbol)}</div>
        </div>
        <div class="stat-card small">
          <div class="stat-label">Gross Profit</div>
          <div class="stat-value" style="color: ${job.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(job.grossProfit, symbol)}</div>
        </div>
        <div class="stat-card small">
          <div class="stat-label">Margin</div>
          <div class="stat-value">${job.marginPercent}%</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ============================================
// TEAM MODAL
// ============================================
function openTeamModal(jobId) {
  const job = app.activeJobs.find(j => j.id === jobId);
  if (!job) return;
  
  const symbol = app.settings?.symbol || 'lei';
  
  document.getElementById('team-job-id').value = job.id;
  document.getElementById('team-job-name').textContent = job.name;
  
  const list = document.getElementById('team-members-list');
  list.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Contract</th><th class="text-right">Hours</th><th class="text-right">Cost/Hour</th><th class="text-center">Actions</th></tr></thead>
      <tbody>
        ${job.team.map(m => `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td><span class="badge badge-${getContractBadge(m.contractType)}">${formatContractType(m.contractType)}</span></td>
            <td class="text-right">${m.hoursAllocated}h</td>
            <td class="text-right">${formatCurrency(m.costPerHour, symbol)}</td>
            <td class="text-center">
              <button class="btn btn-sm btn-danger" onclick="removeTeamMember('${job.id}', '${m.employeeId}')">Remove</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  // Populate available employees
  const select = document.getElementById('add-team-employee');
  const existingIds = job.team.map(t => t.employeeId);
  const available = app.employees.filter(e => e.department === 'Production' && !existingIds.includes(e.id));
  
  select.innerHTML = '<option value="">Select...</option>' + 
    available.map(e => `<option value="${e.id}">${e.firstName} ${e.lastName} (${formatContractType(e.contractType)})</option>`).join('');
  
  document.getElementById('team-modal').classList.add('active');
}
window.openTeamModal = openTeamModal;

async function addTeamMember() {
  const jobId = document.getElementById('team-job-id').value;
  const select = document.getElementById('add-team-employee');
  const hoursPerDay = parseInt(document.getElementById('add-team-hours').value) || 8;
  
  if (!select.value) { alert('Select an employee'); return; }
  
  const job = app.activeJobs.find(j => j.id === jobId);
  const emp = app.employees.find(e => e.id === select.value);
  if (!job || !emp) return;
  
  const member = {
    employeeId: emp.id,
    name: `${emp.firstName} ${emp.lastName}`,
    contractType: emp.contractType,
    efficiency: 100,
    costPerHour: emp.costPerHour,
    hoursPerDay: hoursPerDay,
    hoursAllocated: hoursPerDay * job.totalDays,
    cost: hoursPerDay * job.totalDays * emp.costPerHour,
    acceptsOvertime: emp.acceptsOvertime
  };
  
  const result = await window.api.addTeamMember({ jobId, member });
  
  if (result.success) {
    await loadAllData();
    openTeamModal(jobId);
    renderActiveJobs();
  } else {
    alert(result.error || 'Failed to add');
  }
}

async function removeTeamMember(jobId, employeeId) {
  if (!confirm('Remove from team?')) return;
  
  const result = await window.api.removeTeamMember({ jobId, employeeId });
  
  if (result.success) {
    await loadAllData();
    openTeamModal(jobId);
    renderActiveJobs();
  }
}
window.removeTeamMember = removeTeamMember;

// ============================================
// COMPLETE JOB
// ============================================
function openCompleteModal(jobId) {
  const job = app.activeJobs.find(j => j.id === jobId);
  if (!job) return;
  
  document.getElementById('complete-job-id').value = job.id;
  document.getElementById('complete-job-name').textContent = job.name;
  
  const tbody = document.getElementById('complete-team-tbody');
  tbody.innerHTML = job.team.map(m => `
    <tr data-employee-id="${m.employeeId}" data-name="${m.name || ''}" data-contract-type="${m.contractType || ''}" data-is-placeholder="${m.isPlaceholder || false}" data-cost-per-hour="${m.costPerHour}" data-cost="${m.cost}">
      <td><strong>${m.name}</strong></td>
      <td><span class="badge badge-${getContractBadge(m.contractType)}">${formatContractType(m.contractType)}</span></td>
      <td class="text-right">${m.hoursAllocated}h</td>
      <td class="text-right"><input type="number" class="worked-hours" value="${m.hoursAllocated}" min="0" style="width: 80px;"></td>
      <td class="text-right"><input type="number" class="produced-hours" value="${m.hoursAllocated}" min="0" style="width: 80px;"></td>
      <td class="text-right efficiency-cell">100%</td>
    </tr>
  `).join('');
  
  // Add efficiency calculation on input change
  tbody.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
      const row = input.closest('tr');
      const worked = parseFloat(row.querySelector('.worked-hours').value) || 0;
      const produced = parseFloat(row.querySelector('.produced-hours').value) || 0;
      const efficiency = worked > 0 ? Math.round((produced / worked) * 100) : 100;
      row.querySelector('.efficiency-cell').textContent = `${efficiency}%`;
    });
  });
  
  document.getElementById('complete-modal').classList.add('active');
}
window.openCompleteModal = openCompleteModal;

async function confirmCompleteJob() {
  const jobId = document.getElementById('complete-job-id').value;
  const tbody = document.getElementById('complete-team-tbody');
  
  const team = [];
  tbody.querySelectorAll('tr').forEach(row => {
    team.push({
      employeeId: row.dataset.employeeId,
      name: row.dataset.name || '',
      contractType: row.dataset.contractType || '',
      isPlaceholder: row.dataset.isPlaceholder === 'true',
      costPerHour: parseFloat(row.dataset.costPerHour) || 0,
      cost: parseFloat(row.dataset.cost) || 0,
      workedHours: parseFloat(row.querySelector('.worked-hours').value) || 0,
      producedHours: parseFloat(row.querySelector('.produced-hours').value) || 0
    });
  });
  
  // Check realistic hours
  const job = app.activeJobs.find(j => j.id === jobId);
  const maxHoursPerDay = 12;
  const totalDays = job?.totalDays || 1;
  
  for (const m of team) {
    const hoursPerDay = m.workedHours / totalDays;
    if (hoursPerDay > maxHoursPerDay) {
      const proceed = confirm(`Warning: ${m.workedHours}h / ${totalDays} days = ${hoursPerDay.toFixed(1)}h/day exceeds ${maxHoursPerDay}h/day limit.\n\nContinue anyway?`);
      if (!proceed) return;
      break;
    }
  }
  
  const result = await window.api.completeJob({ jobId, completionData: { team } });
  
  if (result.success) {
    closeAllModals();
    
    // Save job report as TXT - this also resets Electron focus
    await window.api.saveJobReport({ completedJob: result.completedJob });
    
    await loadAllData();
    renderJobs();
    document.querySelector('#page-jobs .tab[data-tab="completed"]').click();
  } else {
    alert(result.error || 'Failed to complete job');
  }
}

// ============================================
// REPORTS
// ============================================
async function renderReports() {
  const data = await window.api.getReportsData();
  const symbol = app.settings?.symbol || 'lei';
  
  // Overview
  document.getElementById('report-total-jobs').textContent = data.overview.totalJobs;
  document.getElementById('report-total-revenue').textContent = formatCurrency(data.overview.totalRevenue, symbol);
  document.getElementById('report-labor-profit').textContent = formatCurrency(data.overview.laborProfit, symbol);
  document.getElementById('report-avg-margin').textContent = `${data.overview.avgMargin}%`;
  
  // Owner/Admin coverage
  if (data.salaryCoverage) {
    document.getElementById('owner-salary').textContent = formatCurrency(data.salaryCoverage.ownerSalary, symbol);
    document.getElementById('owner-covered').textContent = formatCurrency(data.salaryCoverage.ownerCovered, symbol);
    
    const ownerDiff = data.salaryCoverage.ownerDiff;
    const ownerDiffEl = document.getElementById('owner-diff');
    document.getElementById('owner-diff-label').textContent = ownerDiff >= 0 ? 'Extra' : 'Missing';
    ownerDiffEl.textContent = formatCurrency(Math.abs(ownerDiff), symbol);
    ownerDiffEl.style.color = ownerDiff >= 0 ? 'var(--success)' : 'var(--danger)';
    
    document.getElementById('admin-salary').textContent = formatCurrency(data.salaryCoverage.adminSalary, symbol);
    document.getElementById('admin-covered').textContent = formatCurrency(data.salaryCoverage.adminCovered, symbol);
    
    const adminDiff = data.salaryCoverage.adminDiff;
    const adminDiffEl = document.getElementById('admin-diff');
    document.getElementById('admin-diff-label').textContent = adminDiff >= 0 ? 'Extra' : 'Missing';
    adminDiffEl.textContent = formatCurrency(Math.abs(adminDiff), symbol);
    adminDiffEl.style.color = adminDiff >= 0 ? 'var(--success)' : 'var(--danger)';
  }
  
  // Employee performance table
  const empTbody = document.getElementById('report-employees-tbody');
  if (data.employeePerformance.length === 0) {
    empTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No data</td></tr>';
  } else {
    empTbody.innerHTML = data.employeePerformance.map(e => `
      <tr>
        <td>${e.name}</td>
        <td><span class="badge badge-${getContractBadge(e.contractType)}">${formatContractType(e.contractType)}</span></td>
        <td class="text-right">${Math.round(e.totalWorkedHours)}h</td>
        <td class="text-right">${Math.round(e.totalProducedHours)}h</td>
        <td class="text-right"><span class="badge badge-${getEfficiencyBadge(e.efficiency)}">${e.efficiency}%</span></td>
        <td class="text-right">${formatCurrency(e.totalCost, symbol)}</td>
        <td class="text-right">${formatCurrency(e.revenueGenerated, symbol)}</td>
        <td class="text-right" style="color: ${e.difference >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(e.difference, symbol)}</td>
      </tr>
    `).join('');
  }
  
  // Job profitability table
  const jobTbody = document.getElementById('report-jobs-tbody');
  if (data.jobProfitability.length === 0) {
    jobTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No data</td></tr>';
  } else {
    jobTbody.innerHTML = data.jobProfitability.map(j => `
      <tr>
        <td>${j.name}</td>
        <td>${j.client || '-'}</td>
        <td class="text-right">${formatCurrency(j.revenue, symbol)}</td>
        <td class="text-right">${formatCurrency(j.laborBudget, symbol)}</td>
        <td class="text-right">${formatCurrency(j.actualCost, symbol)}</td>
        <td class="text-right" style="color: ${j.laborProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(j.laborProfit, symbol)}</td>
        <td class="text-right">${j.margin}%</td>
      </tr>
    `).join('');
  }
  
  // Store data for export
  app.reportsData = data;
}

async function exportCSV(type) {
  if (!app.reportsData) {
    await renderReports();
  }
  
  const data = type === 'employees' 
    ? app.reportsData.employeePerformance 
    : app.reportsData.jobProfitability;
  
  const result = await window.api.exportCSV({ type, data });
  
  if (result.success) {
    alert(`Exported to: ${result.path}`);
  }
}

// ============================================
// SETTINGS
// ============================================
function renderSettings() {
  document.getElementById('settings-company-name').value = app.settings?.companyName || '';
  document.getElementById('settings-country').value = app.settings?.country || '';
  document.getElementById('settings-currency').value = `${app.settings?.currency || ''} (${app.settings?.symbol || ''})`;
  document.getElementById('settings-employer-tax').value = app.settings?.employerTax || 0;
  document.getElementById('settings-dividend-tax').value = app.settings?.dividendTax || 0;
  document.getElementById('settings-ca-tax').value = app.settings?.caTax || 0;
  
  document.getElementById('settings-formula-owner').value = app.settings?.formula?.owner || 30;
  document.getElementById('settings-formula-admin').value = app.settings?.formula?.admin || 20;
  document.getElementById('settings-formula-production').value = app.settings?.formula?.production || 50;
}

async function saveSettings() {
  const updates = {
    companyName: document.getElementById('settings-company-name').value.trim(),
    employerTax: parseFloat(document.getElementById('settings-employer-tax').value) || 0,
    dividendTax: parseFloat(document.getElementById('settings-dividend-tax').value) || 0,
    caTax: parseFloat(document.getElementById('settings-ca-tax').value) || 0
  };
  
  const result = await window.api.updateSettings(updates);
  if (result.success) {
    app.settings = result.settings;
    alert('Settings saved');
  }
}

async function saveFormula() {
  const formula = {
    owner: parseFloat(document.getElementById('settings-formula-owner').value) || 30,
    admin: parseFloat(document.getElementById('settings-formula-admin').value) || 20,
    production: parseFloat(document.getElementById('settings-formula-production').value) || 50
  };
  
  const result = await window.api.updateSettings({ formula });
  if (result.success) {
    app.settings = result.settings;
    document.getElementById('plan-owner').value = formula.owner;
    document.getElementById('plan-admin').value = formula.admin;
    document.getElementById('plan-production').value = formula.production;
    alert('Formula saved');
  }
}

async function exportData() {
  const result = await window.api.exportData();
  if (result.success) {
    alert(`Exported to: ${result.path}`);
  }
}

async function importData() {
  const result = await window.api.importData();
  if (result.success) {
    await loadAllData();
    renderCurrentPage();
    alert('Data imported');
  }
}

// ============================================
// UTILITIES
// ============================================
function formatCurrency(amount, symbol) {
  const num = parseFloat(amount) || 0;
  return `${num.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${symbol || 'lei'}`;
}

function formatContractType(type) {
  const types = { permanent: 'Permanent', temporary: 'Temporary', daily: 'Daily', offbooks: 'Off-Books' };
  return types[type] || type || '-';
}

function getContractBadge(type) {
  const badges = { permanent: 'success', temporary: 'info', daily: 'warning', offbooks: 'danger' };
  return badges[type] || 'gray';
}

function getDepartmentBadge(dept) {
  const badges = { Production: 'info', Admin: 'gray', TESA: 'gray', Owner: 'warning' };
  return badges[dept] || 'gray';
}

function getEfficiencyBadge(eff) {
  if (eff >= 110) return 'success';
  if (eff >= 90) return 'info';
  if (eff >= 70) return 'warning';
  return 'danger';
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  // Reset focus to prevent input blocking
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}
