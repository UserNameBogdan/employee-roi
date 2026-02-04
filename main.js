// ============================================
// EMPLOYEE ROI v4.0 - Main Process
// Flow: exact conform discuției cu Bogdan
// ============================================

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');

const pkg = require('./package.json');
const APP_VERSION = pkg.version;
const APP_TITLE = `Employee ROI v${APP_VERSION} - KISS Platform`;

// ============================================
// STORE STRUCTURE - 2 BD-uri principale
// ============================================
const store = new Store({
  name: `employee-roi-v${APP_VERSION.replace(/\./g, '')}-data`,
  defaults: {
    license: null,
    settings: {
      companyName: '',
      country: '',
      currency: 'RON',
      symbol: 'lei',
      employerTax: 42.5,
      dividendTax: 8,
      caTax: 3,
      formula: { owner: 30, admin: 20, production: 50 }
    },
    // BD1 - Employee profile (static, manual input)
    employees: [],
    // BD2 - Monthly timesheet per employee
    // Format: { odateKey]: { days: { "1": {standard, worked, produced}, ...}, totals: {...} } }
    timesheets: {},
    // Planning saved scenarios
    scenarios: [],
    // Jobs active și completate
    activeJobs: [],
    completedJobs: []
  }
});

const MASTER_KEYS = [
  'KISS-ROI-MASTER-BOGDAN-2026',
  'KISS-ROI-DEMO-YOUTUBE-2026',
  'KISS-ROI-REVIEW-PRESS-2026'
];

// ============================================
// SUPABASE CONFIG
// ============================================
const SUPABASE_URL = 'https://cpkuzhiekxgrukhkqguh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_61o6mTc5fRQd9L0MQpf_1g_8bQXwIZB';
const GRACE_PERIOD_DAYS = 7; // Offline grace period

let mainWindow;

// ============================================
// HARDWARE ID - Unique per machine
// ============================================
function getHardwareId() {
  const os = require('os');
  const crypto = require('crypto');
  const cpus = os.cpus();
  const networkInterfaces = os.networkInterfaces();
  
  // Combine CPU model, hostname, and first MAC address
  let data = os.hostname() + (cpus[0]?.model || '');
  
  for (const name in networkInterfaces) {
    for (const net of networkInterfaces[name]) {
      if (!net.internal && net.mac !== '00:00:00:00:00:00') {
        data += net.mac;
        break;
      }
    }
    break;
  }
  
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 64);
}

// ============================================
// SUPABASE LICENSE VERIFICATION
// ============================================
async function verifyLicenseOnline(licenseKey) {
  try {
    const https = require('https');
    const url = `${SUPABASE_URL}/rest/v1/employee_roi_licenses?key=eq.${encodeURIComponent(licenseKey)}&select=*`;
    
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const licenses = JSON.parse(data);
            if (licenses && licenses.length > 0) {
              const license = licenses[0];
              resolve({
                found: true,
                status: license.status,
                plan: license.plan,
                expiresAt: license.expires_at,
                hardwareId: license.hardware_id,
                email: license.email
              });
            } else {
              resolve({ found: false });
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  } catch (error) {
    console.error('Online verification failed:', error);
    return null; // Network error - will use local
  }
}

async function activateLicenseOnline(licenseKey, hardwareId) {
  try {
    const https = require('https');
    const url = `${SUPABASE_URL}/rest/v1/employee_roi_licenses?key=eq.${encodeURIComponent(licenseKey)}`;
    
    const updateData = JSON.stringify({
      hardware_id: hardwareId,
      activated_at: new Date().toISOString(),
      status: 'active'
    });
    
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(updateData),
          'Prefer': 'return=representation'
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      
      req.write(updateData);
      req.end();
    });
  } catch (error) {
    console.error('Online activation failed:', error);
    return false;
  }
}

// ============================================
// LICENSE VALIDITY CHECK (Hybrid: Online + Local)
// ============================================
async function checkLicenseValidity() {
  const license = store.get('license');
  
  // No license at all
  if (!license || !license.key) {
    return { status: 'missing', license: null };
  }
  
  // Master keys never expire
  if (MASTER_KEYS.includes(license.key)) {
    return { status: 'valid', license: { ...license, expiresAt: 'Never' } };
  }
  
  const now = new Date();
  const lastOnlineCheck = license.lastOnlineCheck ? new Date(license.lastOnlineCheck) : null;
  const daysSinceCheck = lastOnlineCheck ? (now - lastOnlineCheck) / (1000 * 60 * 60 * 24) : GRACE_PERIOD_DAYS + 1;
  
  // Try online verification if due (every 7 days or never checked)
  if (daysSinceCheck >= GRACE_PERIOD_DAYS) {
    const onlineResult = await verifyLicenseOnline(license.key);
    
    if (onlineResult) {
      // Online check successful
      if (!onlineResult.found) {
        return { status: 'invalid', license, reason: 'License not found in database' };
      }
      
      if (onlineResult.status !== 'active') {
        return { status: 'revoked', license, reason: 'License has been revoked' };
      }
      
      // Check hardware ID
      const currentHwId = getHardwareId();
      if (onlineResult.hardwareId && onlineResult.hardwareId !== currentHwId) {
        return { status: 'invalid', license, reason: 'License is registered to another device' };
      }
      
      // Check expiration
      const expiresAt = new Date(onlineResult.expiresAt);
      if (expiresAt < now) {
        // Update local
        store.set('license.status', 'expired');
        store.set('license.expiresAt', onlineResult.expiresAt);
        return { status: 'expired', license: store.get('license'), reason: 'License has expired' };
      }
      
      // All good - update local cache
      store.set('license.lastOnlineCheck', now.toISOString());
      store.set('license.expiresAt', onlineResult.expiresAt);
      store.set('license.plan', onlineResult.plan);
      store.set('license.status', 'active');
      
      return { status: 'valid', license: store.get('license') };
    }
    
    // Online check failed (network error) - use local with grace period
    console.log('Online check failed, using local data with grace period');
  }
  
  // Local check (offline or within grace period)
  if (license.expiresAt && license.expiresAt !== 'Never') {
    const expiresAt = new Date(license.expiresAt);
    if (expiresAt < now) {
      return { status: 'expired', license, reason: 'License has expired' };
    }
  }
  
  // Check grace period for offline
  if (lastOnlineCheck) {
    const gracePeriodEnd = new Date(lastOnlineCheck);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);
    
    if (now > gracePeriodEnd) {
      return { status: 'offline_expired', license, reason: 'Please connect to internet to verify license' };
    }
  }
  
  return { status: 'valid', license };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    title: APP_TITLE
  });
  mainWindow.loadFile('src/index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ============================================
// LICENSE HANDLERS
// ============================================
ipcMain.handle('license:check', async () => {
  const result = await checkLicenseValidity();
  return result;
});

ipcMain.handle('license:getLegacy', () => store.get('license'));

ipcMain.handle('app:getInfo', () => ({ version: APP_VERSION, title: APP_TITLE }));

// Quit app - used after license change
ipcMain.handle('app:quit', () => {
  app.quit();
});

// Reset focus - fixes Electron input blocking after modals
ipcMain.handle('app:resetFocus', async () => {
  if (mainWindow) {
    mainWindow.blur();
    mainWindow.focus();
    mainWindow.webContents.focus();
    
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['OK'],
      title: 'Job Completed',
      message: 'Job has been completed successfully!',
      defaultId: 0
    });
  }
  return { success: true };
});

ipcMain.handle('license:activate', async (event, data) => {
  const { key, country, currency, symbol, companyName, employerTax, dividendTax, caTax } = data;
  if (!key || !key.startsWith('KISS-ROI-')) return { success: false, error: 'Invalid license key' };
  
  const isMaster = MASTER_KEYS.includes(key);
  const hardwareId = getHardwareId();
  
  if (!isMaster) {
    // Verify online for non-master keys
    const onlineResult = await verifyLicenseOnline(key);
    
    if (!onlineResult) {
      return { success: false, error: 'Cannot verify license. Please check your internet connection.' };
    }
    
    if (!onlineResult.found) {
      return { success: false, error: 'License key not found' };
    }
    
    if (onlineResult.status !== 'active') {
      return { success: false, error: 'License is not active' };
    }
    
    // Check if already activated on another device
    if (onlineResult.hardwareId && onlineResult.hardwareId !== hardwareId) {
      return { success: false, error: 'License is already activated on another device' };
    }
    
    // Check expiration
    if (new Date(onlineResult.expiresAt) < new Date()) {
      return { success: false, error: 'License has expired' };
    }
    
    // Activate online
    await activateLicenseOnline(key, hardwareId);
    
    // Save locally
    const licenseData = {
      key,
      plan: onlineResult.plan,
      email: onlineResult.email,
      hardwareId,
      activatedAt: new Date().toISOString(),
      expiresAt: onlineResult.expiresAt,
      lastOnlineCheck: new Date().toISOString(),
      status: 'active'
    };
    
    store.set('license', licenseData);
  } else {
    // Master key - no online check
    const licenseData = {
      key,
      plan: 'Master',
      hardwareId,
      activatedAt: new Date().toISOString(),
      expiresAt: 'Never',
      lastOnlineCheck: new Date().toISOString(),
      status: 'active'
    };
    
    store.set('license', licenseData);
  }
  
  // Save settings
  store.set('settings.country', country);
  store.set('settings.currency', currency);
  store.set('settings.symbol', symbol);
  store.set('settings.companyName', companyName);
  store.set('settings.employerTax', employerTax || 42.5);
  store.set('settings.dividendTax', dividendTax || 8);
  store.set('settings.caTax', caTax || 3);
  
  return { success: true, license: store.get('license') };
});

// FIX: Deactivate only removes license, NOT all data
ipcMain.handle('license:deactivate', () => {
  store.delete('license');
  return { success: true };
});

// ============================================
// SETTINGS HANDLERS
// ============================================
ipcMain.handle('settings:get', () => store.get('settings'));

ipcMain.handle('settings:update', (event, updates) => {
  const current = store.get('settings');
  const newSettings = { ...current, ...updates };
  store.set('settings', newSettings);
  return { success: true, settings: newSettings };
});

// ============================================
// BD1 - EMPLOYEE HANDLERS (input manual)
// ============================================
ipcMain.handle('employees:getAll', () => store.get('employees') || []);

ipcMain.handle('employees:add', (event, employee) => {
  const employees = store.get('employees') || [];
  const settings = store.get('settings');
  
  const costs = calculateEmployeeCost(employee, settings);
  
  const newEmployee = {
    ...employee,
    id: `emp_${Date.now()}`,
    createdAt: new Date().toISOString(),
    acceptsOvertime: employee.acceptsOvertime || false,
    costPerHour: costs.costPerHour,
    costPerDay: costs.costPerDay,
    totalMonthlyCost: costs.totalMonthlyCost
  };
  
  employees.push(newEmployee);
  store.set('employees', employees);
  return { success: true, employee: newEmployee };
});

ipcMain.handle('employees:update', (event, employee) => {
  const employees = store.get('employees') || [];
  const settings = store.get('settings');
  const index = employees.findIndex(e => e.id === employee.id);
  
  if (index === -1) return { success: false, error: 'Employee not found' };
  
  const costs = calculateEmployeeCost(employee, settings);
  employees[index] = { 
    ...employees[index], 
    ...employee,
    costPerHour: costs.costPerHour,
    costPerDay: costs.costPerDay,
    totalMonthlyCost: costs.totalMonthlyCost
  };
  
  store.set('employees', employees);
  return { success: true, employee: employees[index] };
});

ipcMain.handle('employees:delete', (event, id) => {
  let employees = store.get('employees') || [];
  employees = employees.filter(e => e.id !== id);
  store.set('employees', employees);
  return { success: true };
});

// ============================================
// EMPLOYEE COST CALCULATION
// ============================================
function calculateEmployeeCost(employee, settings) {
  const { contractType, paymentModel, netAmount, hoursPerMonth } = employee;
  const { employerTax, dividendTax, caTax } = settings;
  
  let costPerHour = 0, costPerDay = 0, totalMonthlyCost = 0;
  const amount = parseFloat(netAmount) || 0;
  const hours = parseFloat(hoursPerMonth) || 168;
  
  if (contractType === 'offbooks') {
    // Off-books: Net × (1 + CA%) × (1 + Dividend%)
    const caMultiplier = 1 + (caTax || 3) / 100;
    const divMultiplier = 1 + (dividendTax || 8) / 100;
    costPerDay = amount * caMultiplier * divMultiplier;
    costPerHour = costPerDay / 8;
    totalMonthlyCost = costPerDay * 22;
  } else if (contractType === 'daily') {
    // Daily worker: Gross = Net / 0.65 (CAS 25% + Tax 10%)
    const brut = amount / 0.65;
    costPerDay = brut;
    costPerHour = brut / 8;
    totalMonthlyCost = brut * 22;
  } else if (paymentModel === 'daily') {
    // Permanent/Temporary with daily pay: same as daily worker
    const brut = amount / 0.65;
    costPerDay = brut;
    costPerHour = brut / 8;
    totalMonthlyCost = brut * 22;
  } else if (paymentModel === 'monthly') {
    // Permanent lunar: Net × (1 + Employer Tax%)
    totalMonthlyCost = amount * (1 + (employerTax || 0) / 100);
    costPerHour = totalMonthlyCost / hours;
    costPerDay = costPerHour * 8;
  } else if (paymentModel === 'hourly') {
    // Permanent pe oră: Hourly × (1 + Employer Tax%)
    costPerHour = amount * (1 + (employerTax || 0) / 100);
    costPerDay = costPerHour * 8;
    totalMonthlyCost = costPerHour * hours;
  }
  
  return {
    costPerHour: isNaN(costPerHour) ? 0 : Math.round(costPerHour * 100) / 100,
    costPerDay: isNaN(costPerDay) ? 0 : Math.round(costPerDay * 100) / 100,
    totalMonthlyCost: isNaN(totalMonthlyCost) ? 0 : Math.round(totalMonthlyCost * 100) / 100
  };
}

ipcMain.handle('employees:calculateCost', (event, employee) => {
  const settings = store.get('settings');
  return calculateEmployeeCost(employee, settings);
});

// ============================================
// BD2 - TIMESHEET (Condică lunară)
// ============================================
function getTimesheetKey(employeeId, year, month) {
  return `${employeeId}_${year}_${month}`;
}

function createTimesheetForMonth(employeeId, year, month) {
  const days = {};
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    days[d] = {
      standard: isWeekend ? 0 : 8,  // 8h Mon-Fri, 0 Sat-Sun
      worked: 0,
      produced: 0
    };
  }
  
  return {
    employeeId,
    year,
    month,
    days,
    totals: {
      standardHours: Object.values(days).reduce((sum, d) => sum + d.standard, 0),
      workedHours: 0,
      producedHours: 0,
      normalSalary: 0,
      overtimeSalary: 0,
      totalCost: 0,
      revenueGenerated: 0,
      difference: 0
    }
  };
}

function initializeTimesheet(employeeId, year, month) {
  const key = getTimesheetKey(employeeId, year, month);
  const timesheets = store.get('timesheets') || {};
  
  if (!timesheets[key]) {
    timesheets[key] = createTimesheetForMonth(employeeId, year, month);
    store.set('timesheets', timesheets);
  }
  
  return timesheets[key];
}

ipcMain.handle('timesheet:get', (event, { employeeId, year, month }) => {
  return initializeTimesheet(employeeId, year, month);
});

ipcMain.handle('timesheet:getAll', () => store.get('timesheets') || {});

// Update timesheet from Complete Job - corrected logic
// 1. Fill 8h/day on weekdays FIRST for everyone
// 2. Then OT (over 8h or weekend) for those who accept
// 3. Produced hours = proportional to worked hours per day
function updateTimesheetFromJob(employeeId, startDate, endDate, workedHours, producedHours, revenueShare, jobDetails) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const timesheets = store.get('timesheets') || {};
  const employees = store.get('employees') || [];
  const employee = employees.find(e => e.id === employeeId);
  const settings = store.get('settings');
  
  if (!employee) return null;
  
  const acceptsOT = employee.acceptsOvertime === true;
  const canWorkOT = acceptsOT;  // ONLY acceptsOvertime flag matters
  const canWorkWeekends = acceptsOT;  // Same - only if OT is checked
  
  // Collect all days in period with their properties
  const allDays = [];
  let workingDaysCount = 0;
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    if (!isWeekend) {
      workingDaysCount++;
    }
    
    allDays.push({ 
      date: new Date(d), 
      isWeekend,
      isWorkingDay: !isWeekend
    });
  }
  
  if (allDays.length === 0) return null;
  
  // Track which months are affected
  const monthsAffected = new Set();
  
  // Ensure all timesheets exist
  allDays.forEach(({ date }) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = getTimesheetKey(employeeId, year, month);
    
    if (!timesheets[key]) {
      timesheets[key] = createTimesheetForMonth(employeeId, year, month);
    }
    monthsAffected.add(key);
  });
  
  // VESSEL PRINCIPLE - Two passes:
  // Pass 1: Fill normal hours (8h/day on weekdays)
  // Pass 2: Fill OT hours (extra hours or weekend) - only if canWorkOT
  
  let remainingHours = workedHours;
  const hoursToAddPerDay = [];
  
  // PASS 1: Fill normal hours (8h/day on Mon-Fri)
  for (const dayInfo of allDays) {
    if (remainingHours <= 0) break;
    if (dayInfo.isWeekend) continue; // Skip weekends in pass 1
    
    const { date } = dayInfo;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = String(date.getDate()); // Convert to string for JSON compatibility
    const key = getTimesheetKey(employeeId, year, month);
    
    const currentHours = timesheets[key]?.days[day]?.worked || 0;
    const normalSpace = Math.max(0, 8 - currentHours); // Up to 8h normal
    const hoursToAdd = Math.min(remainingHours, normalSpace);
    
    if (hoursToAdd > 0) {
      // Check if this day already exists in our list
      const existing = hoursToAddPerDay.find(d => d.date.getTime() === date.getTime());
      if (existing) {
        existing.hoursToAdd += hoursToAdd;
      } else {
        hoursToAddPerDay.push({ date: new Date(date), hoursToAdd, isWeekend: false });
      }
      remainingHours -= hoursToAdd;
    }
  }
  
  // PASS 2: Fill OT hours (only if employee can work OT)
  if (canWorkOT && remainingHours > 0) {
    for (const dayInfo of allDays) {
      if (remainingHours <= 0) break;
      
      const { date, isWeekend } = dayInfo;
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = String(date.getDate()); // Convert to string for JSON compatibility
      const key = getTimesheetKey(employeeId, year, month);
      
      const currentHours = timesheets[key]?.days[day]?.worked || 0;
      // Add hours we're already planning to add from pass 1
      const plannedHours = hoursToAddPerDay.find(d => d.date.getTime() === date.getTime())?.hoursToAdd || 0;
      const totalAfterPass1 = currentHours + plannedHours;
      
      // Available OT space (up to 12h total per day)
      const otSpace = Math.max(0, 12 - totalAfterPass1);
      const hoursToAdd = Math.min(remainingHours, otSpace);
      
      if (hoursToAdd > 0) {
        const existing = hoursToAddPerDay.find(d => d.date.getTime() === date.getTime());
        if (existing) {
          existing.hoursToAdd += hoursToAdd;
        } else {
          hoursToAddPerDay.push({ date: new Date(date), hoursToAdd, isWeekend });
        }
        remainingHours -= hoursToAdd;
      }
    }
  }
  
  // Calculate total hours actually added (for proportional produced hours)
  const totalHoursAdded = hoursToAddPerDay.reduce((sum, d) => sum + d.hoursToAdd, 0);
  
  // Apply hours to timesheet with PROPORTIONAL produced hours
  hoursToAddPerDay.forEach(({ date, hoursToAdd }) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = String(date.getDate()); // Convert to string for JSON compatibility
    const key = getTimesheetKey(employeeId, year, month);
    
    // Produced hours proportional to worked hours
    const producedForDay = totalHoursAdded > 0 
      ? producedHours * (hoursToAdd / totalHoursAdded) 
      : 0;
    
    if (timesheets[key] && timesheets[key].days[day]) {
      timesheets[key].days[day].worked += hoursToAdd;
      timesheets[key].days[day].produced += producedForDay;
    }
  });
  
  // SALARY CALCULATION - v4.1.0 FIX
  // Logic:
  // - Without OT flag: all hours = normal rate (max 8h/day weekdays only)
  // - With OT flag: weekday first 8h = normal, weekday >8h = OT×1.5, weekend ALL = OT×1.5
  const costs = calculateEmployeeCost(employee, settings);
  
  let normalHoursForJob = 0;
  let overtimeHoursForJob = 0;
  
  // Calculate based on actual hours distributed per day
  hoursToAddPerDay.forEach(({ date, hoursToAdd }) => {
    // Check isWeekend from actual date, not from stored flag
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    if (!canWorkOT) {
      // No OT flag: all hours are normal (weekends already excluded in pass 1)
      normalHoursForJob += hoursToAdd;
    } else {
      // Has OT flag
      if (isWeekend) {
        // Weekend: ALL hours are OT
        overtimeHoursForJob += hoursToAdd;
      } else {
        // Weekday: need to check how many hours on THIS specific day
        // First 8h = normal, rest = OT
        // But we need to consider hours already on this day from OTHER jobs
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = String(date.getDate()); // Convert to string for JSON compatibility
        const key = getTimesheetKey(employeeId, year, month);
        
        // Hours on this day BEFORE this job's hours were added
        const hoursBeforeThisJob = (timesheets[key]?.days[day]?.worked || 0) - hoursToAdd;
        
        // How much of the 8h normal capacity was already used?
        const normalUsedBefore = Math.min(Math.max(hoursBeforeThisJob, 0), 8);
        const normalSpaceLeft = 8 - normalUsedBefore;
        
        // This job's hours: split into normal and OT
        const normalFromThisJob = Math.min(hoursToAdd, normalSpaceLeft);
        const otFromThisJob = hoursToAdd - normalFromThisJob;
        
        normalHoursForJob += normalFromThisJob;
        overtimeHoursForJob += otFromThisJob;
      }
    }
  });
  
  const salaryNormal = normalHoursForJob * costs.costPerHour;
  const salaryOT = overtimeHoursForJob * costs.costPerHour * 1.5;
  const totalSalary = salaryNormal + salaryOT;
  
  // Value produced = hours produced * (job revenue * production%) / total job hours
  const productionPercent = jobDetails?.productionPercent || 50;
  const jobRevenue = jobDetails?.revenue || 0;
  const totalJobHours = jobDetails?.totalJobHours || workedHours;
  const ratePerHour = totalJobHours > 0 ? (jobRevenue * productionPercent / 100) / totalJobHours : 0;
  const valueProduced = producedHours * ratePerHour;
  const bonus = Math.max(0, valueProduced - totalSalary);
  
  // ============================================
  // SPLIT JOB INTO MONTHS - v4.3.0
  // ============================================
  function splitIntoMonths(startDate, endDate, totalHours, employee, costs, jobRevenue, productionPercent) {
    const months = [];
    let hoursRemaining = totalHours;
    let currentDate = new Date(startDate);
    const finalDate = new Date(endDate);
    
    while (currentDate <= finalDate && hoursRemaining > 0) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      
      // Calculate last day of this iteration (either end of month or job end date)
      const lastDayOfMonth = new Date(year, month + 1, 0);
      const endOfPeriod = finalDate < lastDayOfMonth ? finalDate : lastDayOfMonth;
      
      // Count working days and weekend days in this period
      let workingDays = 0;
      let weekendDays = 0;
      let iterDate = new Date(currentDate);
      
      while (iterDate <= endOfPeriod) {
        const dayOfWeek = iterDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          weekendDays++;
        } else {
          workingDays++;
        }
        iterDate.setDate(iterDate.getDate() + 1);
      }
      
      // Calculate max capacity for this month
      let maxCapacity;
      if (employee.acceptsOvertime) {
        maxCapacity = (workingDays * 12) + (weekendDays * 12);
      } else {
        maxCapacity = workingDays * 8;
      }
      
      // Allocate hours for this month
      const hoursThisMonth = Math.min(hoursRemaining, maxCapacity);
      
      // Calculate normal vs OT hours
      const maxNormalHours = workingDays * 8;
      const normalHours = Math.min(hoursThisMonth, maxNormalHours);
      const overtimeHours = hoursThisMonth - normalHours;
      
      // Calculate salaries
      const salaryNormal = normalHours * costs.costPerHour;
      const salaryOT = overtimeHours * costs.costPerHour * 1.5;
      const totalSalaryMonth = salaryNormal + salaryOT;
      
      // Calculate proportional revenue for this month
      const revenueShare = totalHours > 0 ? (hoursThisMonth / totalHours) * jobRevenue : 0;
      
      // Calculate produced hours proportionally
      const hoursProducedMonth = totalHours > 0 ? (hoursThisMonth / totalHours) * producedHours : 0;
      
      // Calculate value produced and bonus
      const ratePerHour = totalHours > 0 ? (jobRevenue * productionPercent / 100) / totalHours : 0;
      const valueProducedMonth = hoursProducedMonth * ratePerHour;
      const bonusMonth = valueProducedMonth - totalSalaryMonth;
      
      months.push({
        month: monthKey,
        workingDays: workingDays,
        weekendDays: weekendDays,
        hoursWorked: Math.round(hoursThisMonth * 100) / 100,
        hoursProduced: Math.round(hoursProducedMonth * 100) / 100,
        normalHours: Math.round(normalHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        salaryNormal: Math.round(salaryNormal * 100) / 100,
        salaryOT: Math.round(salaryOT * 100) / 100,
        totalSalary: Math.round(totalSalaryMonth * 100) / 100,
        revenueShare: Math.round(revenueShare * 100) / 100,
        valueProduced: Math.round(valueProducedMonth * 100) / 100,
        bonus: Math.round(bonusMonth * 100) / 100,
        completedAt: currentDate >= finalDate ? new Date().toISOString() : new Date(endOfPeriod).toISOString()
      });
      
      hoursRemaining -= hoursThisMonth;
      
      // Move to next month
      currentDate = new Date(year, month + 1, 1);
    }
    
    return months;
  }
  
  // Generate monthly breakdown
  const monthlyBreakdown = splitIntoMonths(
    startDate,
    endDate,
    workedHours,
    employee,
    costs,
    jobRevenue,
    productionPercent
  );
  
  // Store job history entry with monthly breakdown
  const jobHistoryEntry = {
    jobId: jobDetails?.jobId || 'unknown',
    jobName: jobDetails?.jobName || 'Unknown Job',
    client: jobDetails?.client || '',
    startDate: startDate,
    endDate: endDate,
    revenue: jobRevenue,
    productionPercent: productionPercent,
    totalJobHours: totalJobHours,
    hoursWorked: workedHours,
    hoursProduced: producedHours,
    normalHours: Math.round(normalHoursForJob * 100) / 100,
    overtimeHours: Math.round(overtimeHoursForJob * 100) / 100,
    salaryNormal: Math.round(salaryNormal * 100) / 100,
    salaryOT: Math.round(salaryOT * 100) / 100,
    totalSalary: Math.round(totalSalary * 100) / 100,
    valueProduced: Math.round(valueProduced * 100) / 100,
    bonus: Math.round(bonus * 100) / 100,
    monthlyBreakdown: monthlyBreakdown, // NEW: Monthly split
    completedAt: new Date().toISOString()
  };
  
  // Add to employee job history (stored separately)
  const jobHistory = store.get('jobHistory') || {};
  if (!jobHistory[employeeId]) {
    jobHistory[employeeId] = [];
  }
  jobHistory[employeeId].push(jobHistoryEntry);
  store.set('jobHistory', jobHistory);
  
  // Recalculate totals for each affected month - v4.1.0 FIX
  monthsAffected.forEach(key => {
    if (timesheets[key]) {
      const ts = timesheets[key];
      const [, yearStr, monthStr] = key.split('_');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      
      let standardHours = 0, totalWorkedHours = 0, totalProducedHours = 0;
      let normalHours = 0, overtimeHours = 0;
      
      Object.entries(ts.days).forEach(([dayNum, dayData]) => {
        standardHours += dayData.standard || 0;
        totalWorkedHours += dayData.worked || 0;
        totalProducedHours += dayData.produced || 0;
        
        const worked = dayData.worked || 0;
        if (worked > 0) {
          // Check if this day is weekend
          const dayDate = new Date(year, month - 1, parseInt(dayNum));
          const dayOfWeek = dayDate.getDay();
          const isDayWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          if (!canWorkOT) {
            // No OT: all hours are normal
            normalHours += worked;
          } else if (isDayWeekend) {
            // Weekend: all hours OT
            overtimeHours += worked;
          } else {
            // Weekday with OT: first 8h normal, rest OT
            normalHours += Math.min(worked, 8);
            overtimeHours += Math.max(0, worked - 8);
          }
        }
      });
      
      const normalSalary = normalHours * costs.costPerHour;
      const overtimeSalary = overtimeHours * costs.costPerHour * 1.5;
      const totalCost = normalSalary + overtimeSalary;
      const newRevenue = (ts.totals.revenueGenerated || 0) + (revenueShare || 0);
      
      ts.totals = {
        standardHours: Math.round(standardHours * 100) / 100,
        workedHours: Math.round(totalWorkedHours * 100) / 100,
        producedHours: Math.round(totalProducedHours * 100) / 100,
        normalHours: Math.round(normalHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        normalSalary: Math.round(normalSalary * 100) / 100,
        overtimeSalary: Math.round(overtimeSalary * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        revenueGenerated: Math.round(newRevenue * 100) / 100,
        difference: Math.round((newRevenue - totalCost) * 100) / 100
      };
    }
  });
  
  store.set('timesheets', timesheets);
  
  return jobHistoryEntry;
}

// ============================================
// AVAILABILITY CHECK - reads from BD2
// ============================================
function getEmployeeAvailability(employeeId, startDate, endDate) {
  const employees = store.get('employees') || [];
  const employee = employees.find(e => e.id === employeeId);
  
  if (!employee) return { maxHours: 0, workedHours: 0, availableHours: 0 };
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const timesheets = store.get('timesheets') || {};
  
  const acceptsOT = employee.acceptsOvertime === true;
  
  // Calculate max hours for period
  let maxHours = 0;
  let workedHours = 0;
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    
    // Maxim ore pe această zi - ONLY acceptsOT matters
    if (acceptsOT) {
      // OT+: 12h/zi, L-D (including weekends)
      maxHours += 12;
    } else {
      // OT-: 8h/zi, doar L-V (no weekends)
      if (!isWeekend) {
        maxHours += 8;
      }
    }
    
    // Ore deja lucrate în această zi (din BD2)
    const key = getTimesheetKey(employeeId, year, month);
    if (timesheets[key] && timesheets[key].days[day]) {
      workedHours += timesheets[key].days[day].worked || 0;
    }
  }
  
  const availableHours = Math.max(0, maxHours - workedHours);
  
  return {
    maxHours,
    workedHours,
    availableHours,
    acceptsOvertime: acceptsOT
  };
}

ipcMain.handle('employees:getAvailability', (event, { employeeId, startDate, endDate }) => {
  return getEmployeeAvailability(employeeId, startDate, endDate);
});

// ============================================
// SCENARIO GENERATION - 2 scenarii
// ============================================
ipcMain.handle('scenarios:generate', (event, params) => {
  const { jobName, client, revenue, startDate, endDate, hoursNeeded, formula, offbooksCostPerDay, effectiveDays } = params;
  
  const settings = store.get('settings');
  const employees = store.get('employees') || [];
  
  const productionPercent = formula?.production || 50;
  const laborBudget = (revenue * productionPercent) / 100;
  
  // Calculate days
  const start = new Date(startDate);
  const end = new Date(endDate);
  let totalCalendarDays = 0;
  let workingDays = 0;
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    totalCalendarDays++;
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
  }
  
  // Use effectiveDays if provided (user override), otherwise use calculated
  const totalDays = effectiveDays ? parseInt(effectiveDays) : totalCalendarDays;
  const weekendDays = totalCalendarDays - workingDays;
  
  // Angajații Production cu disponibilitate
  const productionEmps = employees
    .filter(e => e.department === 'Production')
    .map(emp => {
      const availability = getEmployeeAvailability(emp.id, startDate, endDate);
      const costs = calculateEmployeeCost(emp, settings);
      
      // Calculate efficiency from timesheets
      const timesheets = store.get('timesheets') || {};
      let totalWorked = 0, totalProduced = 0;
      
      Object.values(timesheets).forEach(ts => {
        if (ts.employeeId === emp.id) {
          totalWorked += ts.totals?.workedHours || 0;
          totalProduced += ts.totals?.producedHours || 0;
        }
      });
      
      const efficiency = totalWorked > 0 ? Math.round((totalProduced / totalWorked) * 100) : 100;
      
      return {
        ...emp,
        costs,
        efficiency,
        ...availability
      };
    })
    .filter(e => e.availableHours > 0);
  
  // PRIORITY: Cost minim - fără OT primul (sunt mai ieftini), apoi cu OT
  // În cadrul fiecărei categorii: cost ASC, eficiență DESC
  const sortedEmps = [...productionEmps].sort((a, b) => {
    // 1. Fără OT vine primul (cost mai mic total)
    const aHasOT = a.acceptsOvertime === true;
    const bHasOT = b.acceptsOvertime === true;
    if (!aHasOT && bHasOT) return -1;  // a (fără OT) vine primul
    if (aHasOT && !bHasOT) return 1;   // b (fără OT) vine primul
    
    // 2. Cost per oră ASC
    if (a.costs.costPerHour !== b.costs.costPerHour) {
      return a.costs.costPerHour - b.costs.costPerHour;
    }
    
    // 3. Eficiență DESC
    return b.efficiency - a.efficiency;
  });
  
  const scenarios = [];
  
  // SCENARIO 1: Without off-books (employees with OT if needed)
  scenarios.push(generateScenarioWithoutOffbooks(
    sortedEmps.filter(e => e.contractType !== 'offbooks'),
    hoursNeeded, totalDays, workingDays, laborBudget, settings
  ));
  
  // SCENARIO 2: With off-books (declared employees only 8h + existing off-books + placeholder off-books)
  if (offbooksCostPerDay > 0) {
    const existingOffbooks = sortedEmps.filter(e => e.contractType === 'offbooks');
    scenarios.push(generateScenarioWithOffbooks(
      sortedEmps.filter(e => e.contractType !== 'offbooks'),
      existingOffbooks,
      hoursNeeded, totalDays, workingDays, laborBudget, offbooksCostPerDay, settings
    ));
  }
  
  return {
    jobDetails: { jobName, client, revenue, startDate, endDate, hoursNeeded, formula },
    laborBudget,
    totalDays,
    totalCalendarDays,
    workingDays,
    weekendDays,
    scenarios
  };
});

// Scenariu 1: Without off-books
function generateScenarioWithoutOffbooks(emps, hoursNeeded, totalDays, workingDays, budget, settings) {
  const team = [];
  let remainingHours = hoursNeeded;
  let totalCost = 0;
  
  for (const emp of emps) {
    if (remainingHours <= 0) break;
    if (emp.availableHours <= 0) continue;
    
    const acceptsOT = emp.acceptsOvertime === true;
    
    // How many hours can work in period
    let maxHoursForJob;
    if (acceptsOT) {
      maxHoursForJob = Math.min(emp.availableHours, totalDays * 12);
    } else {
      maxHoursForJob = Math.min(emp.availableHours, workingDays * 8);
    }
    
    const hoursToAllocate = Math.min(remainingHours, maxHoursForJob);
    
    if (hoursToAllocate <= 0) continue;
    
    // Calculate cost (OT at 1.5x for hours over normal)
    const normalHoursCapacity = workingDays * 8;
    const normalHours = Math.min(hoursToAllocate, normalHoursCapacity);
    const overtimeHours = hoursToAllocate - normalHours;
    
    const normalCost = normalHours * emp.costs.costPerHour;
    const overtimeCost = overtimeHours * emp.costs.costPerHour * 1.5;
    const cost = normalCost + overtimeCost;
    
    // Hours per day
    const daysCanWork = acceptsOT ? totalDays : workingDays;
    const hoursPerDay = Math.ceil(hoursToAllocate / daysCanWork);
    
    team.push({
      employeeId: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      contractType: emp.contractType,
      efficiency: emp.efficiency,
      costPerHour: emp.costs.costPerHour,
      hoursAllocated: Math.round(hoursToAllocate * 100) / 100,
      hoursPerDay: Math.min(hoursPerDay, 12),
      normalHours: Math.round(normalHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      acceptsOvertime: acceptsOT
    });
    
    remainingHours -= hoursToAllocate;
    totalCost += cost;
  }
  
  const hoursShortage = Math.round(Math.max(0, remainingHours));
  
  return {
    name: 'Without Off-Books',
    team,
    totalHours: Math.round(hoursNeeded - remainingHours),
    totalCost: Math.round(totalCost * 100) / 100,
    withinBudget: totalCost <= budget,
    budgetRemaining: Math.round((budget - totalCost) * 100) / 100,
    coveragePercent: Math.round(((hoursNeeded - remainingHours) / hoursNeeded) * 100),
    hoursShortage,
    shortageMessage: hoursShortage > 0 
      ? `Missing ${hoursShortage}h - not enough employees available` 
      : null
  };
}

// Scenario 2: With off-books (declared employees only 8h/day + existing off-books + placeholder off-books)
function generateScenarioWithOffbooks(emps, existingOffbooks, hoursNeeded, totalDays, workingDays, budget, offbooksCostPerDay, settings) {
  const team = [];
  let remainingHours = hoursNeeded;
  let totalCost = 0;
  
  // Step 1: Declared employees ONLY at normal hours (8h/day, Mon-Fri)
  for (const emp of emps) {
    if (remainingHours <= 0) break;
    if (emp.availableHours <= 0) continue;
    
    // Only normal hours, no OT (even if accepts)
    const maxHoursForJob = Math.min(emp.availableHours, workingDays * 8);
    const hoursToAllocate = Math.min(remainingHours, maxHoursForJob);
    
    if (hoursToAllocate <= 0) continue;
    
    const cost = hoursToAllocate * emp.costs.costPerHour;
    const hoursPerDay = Math.ceil(hoursToAllocate / workingDays);
    
    team.push({
      employeeId: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      contractType: emp.contractType,
      efficiency: emp.efficiency,
      costPerHour: emp.costs.costPerHour,
      hoursAllocated: Math.round(hoursToAllocate * 100) / 100,
      hoursPerDay: Math.min(hoursPerDay, 8),
      normalHours: Math.round(hoursToAllocate * 100) / 100,
      overtimeHours: 0,
      cost: Math.round(cost * 100) / 100,
      acceptsOvertime: emp.acceptsOvertime
    });
    
    remainingHours -= hoursToAllocate;
    totalCost += cost;
  }
  
  // Step 2: Use EXISTING off-books employees from database
  for (const emp of existingOffbooks) {
    if (remainingHours <= 0) break;
    if (emp.availableHours <= 0) continue;
    
    // Off-books can work all days, max 12h/day
    const maxHoursForJob = Math.min(emp.availableHours, totalDays * 12);
    const hoursToAllocate = Math.min(remainingHours, maxHoursForJob);
    
    if (hoursToAllocate <= 0) continue;
    
    const cost = hoursToAllocate * emp.costs.costPerHour;
    const hoursPerDay = Math.ceil(hoursToAllocate / totalDays);
    
    team.push({
      employeeId: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      contractType: emp.contractType,
      efficiency: emp.efficiency,
      costPerHour: emp.costs.costPerHour,
      hoursAllocated: Math.round(hoursToAllocate * 100) / 100,
      hoursPerDay: Math.min(hoursPerDay, 12),
      normalHours: Math.round(hoursToAllocate * 100) / 100,
      overtimeHours: 0,
      cost: Math.round(cost * 100) / 100,
      acceptsOvertime: true
    });
    
    remainingHours -= hoursToAllocate;
    totalCost += cost;
  }
  
  // Step 3: Fill remaining with placeholder off-books workers
  if (remainingHours > 0) {
    const offbooksHourlyRate = offbooksCostPerDay / 12; // 12h/day for off-books
    const hoursPerWorkerPerDay = 12;
    const maxHoursPerWorker = totalDays * hoursPerWorkerPerDay;
    
    let workerIndex = 1;
    while (remainingHours > 0) {
      const hoursForThisWorker = Math.min(remainingHours, maxHoursPerWorker);
      const workerCost = hoursForThisWorker * offbooksHourlyRate;
      const hoursPerDay = Math.ceil(hoursForThisWorker / totalDays);
      
      team.push({
        employeeId: `offbooks_placeholder_${workerIndex}`,
        name: `Off-Books ${workerIndex}`,
        contractType: 'offbooks',
        efficiency: 100,
        costPerHour: Math.round(offbooksHourlyRate * 100) / 100,
        hoursAllocated: Math.round(hoursForThisWorker * 100) / 100,
        hoursPerDay: Math.min(hoursPerDay, 12),
        normalHours: Math.round(hoursForThisWorker * 100) / 100,
        overtimeHours: 0,
        cost: Math.round(workerCost * 100) / 100,
        isPlaceholder: true,
        workerCount: 1
      });
      
      totalCost += workerCost;
      remainingHours -= hoursForThisWorker;
      workerIndex++;
    }
  }
  
  return {
    name: 'With Off-Books',
    team,
    totalHours: Math.round(hoursNeeded),
    totalCost: Math.round(totalCost * 100) / 100,
    withinBudget: totalCost <= budget,
    budgetRemaining: Math.round((budget - totalCost) * 100) / 100,
    coveragePercent: 100,
    hoursShortage: 0,
    shortageMessage: null
  };
}

ipcMain.handle('scenarios:save', (event, scenarioData) => {
  const scenarios = store.get('scenarios') || [];
  const newScenario = {
    ...scenarioData,
    id: `scenario_${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: 'planning'
  };
  scenarios.push(newScenario);
  store.set('scenarios', scenarios);
  return { success: true, scenario: newScenario };
});

ipcMain.handle('scenarios:getAll', () => store.get('scenarios') || []);

ipcMain.handle('scenarios:delete', (event, id) => {
  let scenarios = store.get('scenarios') || [];
  scenarios = scenarios.filter(s => s.id !== id);
  store.set('scenarios', scenarios);
  return { success: true };
});

// ============================================
// JOBS HANDLERS
// ============================================
ipcMain.handle('jobs:activate', (event, scenarioId) => {
  const scenarios = store.get('scenarios') || [];
  const activeJobs = store.get('activeJobs') || [];
  
  const scenario = scenarios.find(s => s.id === scenarioId);
  if (!scenario) return { success: false, error: 'Scenario not found' };
  
  const activeJob = {
    id: `job_${Date.now()}`,
    scenarioId: scenario.id,
    name: scenario.jobDetails.jobName,
    client: scenario.jobDetails.client,
    revenue: scenario.jobDetails.revenue,
    startDate: scenario.jobDetails.startDate,
    endDate: scenario.jobDetails.endDate,
    hoursNeeded: scenario.jobDetails.hoursNeeded,
    formula: scenario.jobDetails.formula,
    laborBudget: scenario.laborBudget,
    totalDays: scenario.totalDays,
    workingDays: scenario.workingDays,
    team: scenario.selectedScenario.team,
    status: 'active',
    activatedAt: new Date().toISOString()
  };
  
  activeJobs.push(activeJob);
  store.set('activeJobs', activeJobs);
  
  // Marchează scenariul ca activat
  const scenarioIndex = scenarios.findIndex(s => s.id === scenarioId);
  scenarios[scenarioIndex].status = 'activated';
  store.set('scenarios', scenarios);
  
  return { success: true, job: activeJob };
});

ipcMain.handle('jobs:getActive', () => store.get('activeJobs') || []);

// Add employee to team
ipcMain.handle('jobs:addTeamMember', (event, { jobId, member }) => {
  const activeJobs = store.get('activeJobs') || [];
  const index = activeJobs.findIndex(j => j.id === jobId);
  
  if (index === -1) return { success: false, error: 'Job not found' };
  
  activeJobs[index].team.push(member);
  store.set('activeJobs', activeJobs);
  
  return { success: true, job: activeJobs[index] };
});

// Remove employee from team
ipcMain.handle('jobs:removeTeamMember', (event, { jobId, employeeId }) => {
  const activeJobs = store.get('activeJobs') || [];
  const index = activeJobs.findIndex(j => j.id === jobId);
  
  if (index === -1) return { success: false, error: 'Job not found' };
  
  activeJobs[index].team = activeJobs[index].team.filter(t => t.employeeId !== employeeId);
  store.set('activeJobs', activeJobs);
  
  return { success: true, job: activeJobs[index] };
});

// ============================================
// COMPLETE JOB - populează BD2
// ============================================
ipcMain.handle('jobs:complete', (event, { jobId, completionData }) => {
  const activeJobs = store.get('activeJobs') || [];
  const completedJobs = store.get('completedJobs') || [];
  
  const jobIndex = activeJobs.findIndex(j => j.id === jobId);
  if (jobIndex === -1) return { success: false, error: 'Job not found' };
  
  const job = activeJobs[jobIndex];
  let actualLaborCost = 0;
  const teamResults = [];
  
  // Calculate total hours for the job
  const totalWorkedHours = completionData.team.reduce((sum, m) => sum + (m.workedHours || 0), 0);
  const totalProducedHours = completionData.team.reduce((sum, m) => sum + (m.producedHours || 0), 0);
  
  // Job details to pass to timesheet update
  const jobDetails = {
    jobId: job.id,
    jobName: job.name,
    client: job.client,
    revenue: job.revenue,
    productionPercent: job.formula?.production || 50,
    totalJobHours: totalProducedHours > 0 ? totalProducedHours : totalWorkedHours
  };
  
  completionData.team.forEach(member => {
    const { employeeId, workedHours, producedHours } = member;
    
    // Calculate cost
    let memberCost = 0;
    if (member.isPlaceholder) {
      memberCost = member.cost || 0;
    } else {
      memberCost = workedHours * (member.costPerHour || 0);
    }
    actualLaborCost += memberCost;
    
    // Eficiența pentru acest job
    const efficiency = workedHours > 0 ? Math.round((producedHours / workedHours) * 100) : 100;
    
    // Revenue share proporțional
    const revenueShare = totalWorkedHours > 0 
      ? (job.revenue * (job.formula?.production || 50) / 100) * (workedHours / totalWorkedHours)
      : 0;
    
    teamResults.push({
      ...member,
      workedHours,
      producedHours,
      efficiency,
      cost: memberCost,
      revenueShare
    });
    
    // Populăm BD2 pentru angajații non-placeholder
    if (!member.isPlaceholder && employeeId && !employeeId.startsWith('offbooks')) {
      updateTimesheetFromJob(employeeId, job.startDate, job.endDate, workedHours, producedHours, revenueShare, jobDetails);
    }
  });
  
  const completedJob = {
    ...job,
    status: 'completed',
    completedAt: new Date().toISOString(),
    teamResults,
    actualLaborCost,
    grossProfit: job.revenue - actualLaborCost,
    laborProfit: job.laborBudget - actualLaborCost,
    marginPercent: job.revenue > 0 ? Math.round(((job.revenue - actualLaborCost) / job.revenue) * 100) : 0
  };
  
  completedJobs.push(completedJob);
  activeJobs.splice(jobIndex, 1);
  
  store.set('activeJobs', activeJobs);
  store.set('completedJobs', completedJobs);
  
  return { success: true, completedJob };
});

ipcMain.handle('jobs:getCompleted', () => store.get('completedJobs') || []);

// Get job history for an employee
ipcMain.handle('employees:getJobHistory', (event, employeeId) => {
  const jobHistory = store.get('jobHistory') || {};
  return jobHistory[employeeId] || [];
});

// Get all job history
ipcMain.handle('employees:getAllJobHistory', () => store.get('jobHistory') || {});

// Save job completion report as TXT - this also resets focus
ipcMain.handle('jobs:saveReport', async (event, { completedJob }) => {
  const settings = store.get('settings');
  const symbol = settings?.symbol || 'lei';
  const employees = store.get('employees') || [];
  
  // Generate report content
  let report = `═══════════════════════════════════════════════════════════════════
                    JOB COMPLETION REPORT
═══════════════════════════════════════════════════════════════════

JOB DETAILS
───────────────────────────────────────────────────────────────────
Job Name:        ${completedJob.name}
Client:          ${completedJob.client || '-'}
Period:          ${completedJob.startDate} to ${completedJob.endDate}
Completed:       ${new Date(completedJob.completedAt).toLocaleString()}

FINANCIAL SUMMARY
───────────────────────────────────────────────────────────────────
Revenue:         ${completedJob.revenue?.toLocaleString()} ${symbol}
Labor Budget:    ${completedJob.laborBudget?.toLocaleString()} ${symbol}
Actual Cost:     ${completedJob.actualLaborCost?.toLocaleString()} ${symbol}
Labor Profit:    ${completedJob.laborProfit?.toLocaleString()} ${symbol}
Gross Profit:    ${completedJob.grossProfit?.toLocaleString()} ${symbol}
Margin:          ${completedJob.marginPercent}%

TEAM PERFORMANCE
───────────────────────────────────────────────────────────────────
`;

  completedJob.teamResults.forEach(member => {
    const emp = employees.find(e => e.id === member.employeeId);
    const name = emp?.name || member.name || 'Off-Books Worker';
    report += `
${name}
  Contract:      ${member.contractType || '-'}
  Hours Worked:  ${member.workedHours}h
  Hours Produced: ${member.producedHours}h
  Efficiency:    ${member.efficiency}%
  Cost:          ${member.cost?.toLocaleString()} ${symbol}
  Revenue Share: ${Math.round(member.revenueShare || 0).toLocaleString()} ${symbol}
`;
  });

  report += `
═══════════════════════════════════════════════════════════════════
                    END OF REPORT
═══════════════════════════════════════════════════════════════════
`;

  // Show save dialog - this resets Electron focus
  const defaultPath = `${completedJob.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
  
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath,
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });
  
  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, report, 'utf8');
      return { success: true, saved: true, path: result.filePath };
    } catch (error) {
      return { success: true, saved: false, error: error.message };
    }
  }
  
  // Even if canceled, focus is reset
  return { success: true, saved: false };
});

// ============================================
// DASHBOARD DATA
// ============================================
ipcMain.handle('dashboard:getData', (event, selectedMonth = null) => {
  const settings = store.get('settings');
  const employees = store.get('employees') || [];
  const activeJobs = store.get('activeJobs') || [];
  const completedJobs = store.get('completedJobs') || [];
  const jobHistory = store.get('jobHistory') || {};
  
  // If no month selected, use current month
  const now = new Date();
  const targetMonth = selectedMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Calculate totals from monthlyBreakdown
  let budgetFromCompleted = 0;
  let monthRevenue = 0;
  let salariesToPay = 0;
  let completedCountThisMonth = 0;
  
  // Iterate through all employees' job history
  Object.values(jobHistory).forEach(employeeJobs => {
    employeeJobs.forEach(job => {
      if (job.monthlyBreakdown && job.monthlyBreakdown.length > 0) {
        // Find this month's breakdown
        const monthData = job.monthlyBreakdown.find(m => m.month === targetMonth);
        if (monthData) {
          budgetFromCompleted += monthData.revenueShare || 0;
          monthRevenue += monthData.revenueShare || 0;
          salariesToPay += monthData.totalSalary || 0;
          completedCountThisMonth++;
        }
      } else {
        // Fallback for jobs without monthlyBreakdown (old data)
        const completedDate = new Date(job.completedAt);
        const jobMonth = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}`;
        if (jobMonth === targetMonth) {
          // Use old calculation
          const jobRevenue = job.revenue || 0;
          const jobProductionPercent = job.productionPercent || 50;
          budgetFromCompleted += (jobRevenue * jobProductionPercent / 100);
          monthRevenue += jobRevenue;
          salariesToPay += job.totalSalary || 0;
          completedCountThisMonth++;
        }
      }
    });
  });
  
  const budgetFromActive = activeJobs.reduce((sum, j) => sum + (j.laborBudget || 0), 0);
  const productionEmployees = employees.filter(e => e.department === 'Production');
  
  return {
    budgetFromCompleted,
    budgetFromActive,
    salariesToPay,
    balance: budgetFromCompleted - salariesToPay,
    completedThisMonthCount: completedCountThisMonth,
    activeJobsCount: activeJobs.length,
    productionEmployeesCount: productionEmployees.length,
    monthRevenue,
    selectedMonth: targetMonth
  };
});

// ============================================
// GET AVAILABLE MONTHS - v4.3.0
// ============================================
ipcMain.handle('dashboard:getAvailableMonths', () => {
  const jobHistory = store.get('jobHistory') || {};
  const monthsSet = new Set();
  
  // Collect all unique months from monthlyBreakdown
  Object.values(jobHistory).forEach(employeeJobs => {
    employeeJobs.forEach(job => {
      if (job.monthlyBreakdown && job.monthlyBreakdown.length > 0) {
        job.monthlyBreakdown.forEach(m => {
          monthsSet.add(m.month);
        });
      } else {
        // Fallback for old data without monthlyBreakdown
        if (job.completedAt) {
          const date = new Date(job.completedAt);
          const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthsSet.add(month);
        }
      }
    });
  });
  
  // Convert to array and sort (newest first)
  const months = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  
  return months;
});

// ============================================
// REPORTS DATA
// ============================================
ipcMain.handle('reports:getData', (event, { startDate, endDate } = {}) => {
  const settings = store.get('settings');
  const employees = store.get('employees') || [];
  const completedJobs = store.get('completedJobs') || [];
  const timesheets = store.get('timesheets') || {};
  
  // Filtrăm după perioadă dacă e specificată
  let filteredJobs = completedJobs;
  if (startDate && endDate) {
    filteredJobs = completedJobs.filter(j => {
      const completed = new Date(j.completedAt);
      return completed >= new Date(startDate) && completed <= new Date(endDate);
    });
  }
  
  // Employee performance din BD2
  const employeePerformance = employees
    .filter(e => e.department === 'Production')
    .map(emp => {
      let totalWorked = 0, totalProduced = 0, totalCost = 0, revenueGenerated = 0;
      
      Object.values(timesheets).forEach(ts => {
        if (ts.employeeId === emp.id) {
          totalWorked += ts.totals?.workedHours || 0;
          totalProduced += ts.totals?.producedHours || 0;
          totalCost += ts.totals?.totalCost || 0;
          revenueGenerated += ts.totals?.revenueGenerated || 0;
        }
      });
      
      const efficiency = totalWorked > 0 ? Math.round((totalProduced / totalWorked) * 100) : 100;
      const roi = totalCost > 0 ? Math.round(((revenueGenerated - totalCost) / totalCost) * 100) : 0;
      
      return {
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        contractType: emp.contractType,
        totalWorkedHours: totalWorked,
        totalProducedHours: totalProduced,
        efficiency,
        totalCost,
        revenueGenerated,
        roi,
        difference: revenueGenerated - totalCost
      };
    })
    .sort((a, b) => b.efficiency - a.efficiency);
  
  // Job profitability
  const jobProfitability = filteredJobs.map(job => ({
    id: job.id,
    name: job.name,
    client: job.client,
    revenue: job.revenue,
    laborBudget: job.laborBudget,
    actualCost: job.actualLaborCost,
    laborProfit: job.laborProfit,
    grossProfit: job.grossProfit,
    margin: job.marginPercent,
    completedAt: job.completedAt,
    teamSize: job.teamResults?.length || 0
  })).sort((a, b) => b.laborProfit - a.laborProfit);
  
  // Totale
  const totalRevenue = filteredJobs.reduce((sum, j) => sum + (j.revenue || 0), 0);
  const totalLaborBudget = filteredJobs.reduce((sum, j) => sum + (j.laborBudget || 0), 0);
  const totalActualCost = filteredJobs.reduce((sum, j) => sum + (j.actualLaborCost || 0), 0);
  const laborProfit = totalLaborBudget - totalActualCost;
  
  // Owner & Admin coverage
  const ownerEmployees = employees.filter(e => e.department === 'Owner');
  const adminEmployees = employees.filter(e => e.department === 'Admin' || e.department === 'TESA');
  
  const ownerSalary = ownerEmployees.reduce((sum, e) => sum + (e.totalMonthlyCost || 0), 0);
  const adminSalary = adminEmployees.reduce((sum, e) => sum + (e.totalMonthlyCost || 0), 0);
  
  let ownerCovered = 0, adminCovered = 0;
  filteredJobs.forEach(job => {
    const ownerPercent = job.formula?.owner || 30;
    const adminPercent = job.formula?.admin || 20;
    ownerCovered += (job.revenue || 0) * (ownerPercent / 100);
    adminCovered += (job.revenue || 0) * (adminPercent / 100);
  });
  
  return {
    overview: {
      totalJobs: filteredJobs.length,
      totalRevenue,
      totalLaborBudget,
      totalActualCost,
      laborProfit,
      avgMargin: totalLaborBudget > 0 ? Math.round((laborProfit / totalLaborBudget) * 100) : 0
    },
    salaryCoverage: {
      ownerSalary,
      adminSalary,
      ownerCovered,
      adminCovered,
      ownerDiff: ownerCovered - ownerSalary,
      adminDiff: adminCovered - adminSalary
    },
    employeePerformance,
    jobProfitability
  };
});

// ============================================
// EXPORT - PDF/CSV
// ============================================
ipcMain.handle('reports:exportCSV', async (event, { type, data }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `employee-roi-${type}-${new Date().toISOString().split('T')[0]}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  
  if (result.canceled || !result.filePath) return { success: false };
  
  try {
    let csv = '';
    const settings = store.get('settings');
    const symbol = settings?.symbol || 'lei';
    
    if (type === 'employees') {
      // Basic employee summary
      csv = 'Name,Contract Type,Hours Worked,Hours Produced,Efficiency,Total Cost,Revenue Generated,ROI,Difference\n';
      data.forEach(e => {
        csv += `"${e.name}",${e.contractType},${e.totalWorkedHours},${e.totalProducedHours},${e.efficiency}%,${e.totalCost},${e.revenueGenerated},${e.roi}%,${e.difference}\n`;
      });
    } else if (type === 'employees-detailed') {
      // Detailed employee report with job history
      const jobHistory = store.get('jobHistory') || {};
      
      csv = 'Employee,Contract Type,Job Name,Client,Period,Revenue,Production %,Hours Worked,Hours Produced,Efficiency,Normal Hours,OT Hours,Normal Salary,OT Salary,Total Salary,Value Produced,Bonus\n';
      
      data.forEach(e => {
        const history = jobHistory[e.id] || [];
        if (history.length === 0) {
          // Employee with no jobs yet
          csv += `"${e.name}",${e.contractType},-,-,-,-,-,-,-,-,-,-,-,-,-,-,-\n`;
        } else {
          history.forEach(job => {
            const efficiency = job.hoursWorked > 0 ? Math.round((job.hoursProduced / job.hoursWorked) * 100) : 100;
            csv += `"${e.name}",${e.contractType},"${job.jobName}","${job.client || '-'}","${job.startDate} - ${job.endDate}",${job.revenue},${job.productionPercent}%,${job.hoursWorked},${job.hoursProduced},${efficiency}%,${job.normalHours},${job.overtimeHours},${job.salaryNormal},${job.salaryOT},${job.totalSalary},${job.valueProduced},${job.bonus}\n`;
          });
        }
      });
    } else if (type === 'jobs') {
      csv = 'Job,Client,Revenue,Labor Budget,Actual Cost,Labor Profit,Gross Profit,Margin\n';
      data.forEach(j => {
        csv += `"${j.name}","${j.client}",${j.revenue},${j.laborBudget},${j.actualCost},${j.laborProfit},${j.grossProfit},${j.margin}%\n`;
      });
    }
    
    fs.writeFileSync(result.filePath, csv, 'utf8');
    return { success: true, path: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// DATA EXPORT/IMPORT
// ============================================
ipcMain.handle('data:export', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `employee-roi-backup-${new Date().toISOString().split('T')[0]}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  
  if (result.canceled || !result.filePath) return { success: false };
  
  try {
    const data = {
      settings: store.get('settings'),
      employees: store.get('employees'),
      timesheets: store.get('timesheets'),
      jobHistory: store.get('jobHistory'),
      scenarios: store.get('scenarios'),
      activeJobs: store.get('activeJobs'),
      completedJobs: store.get('completedJobs'),
      exportedAt: new Date().toISOString()
    };
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    return { success: true, path: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('data:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  
  if (result.canceled || !result.filePaths[0]) return { success: false };
  
  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf8');
    const data = JSON.parse(content);
    
    if (data.settings) store.set('settings', data.settings);
    if (data.employees) store.set('employees', data.employees);
    if (data.timesheets) store.set('timesheets', data.timesheets);
    if (data.jobHistory) store.set('jobHistory', data.jobHistory);
    if (data.scenarios) store.set('scenarios', data.scenarios);
    if (data.activeJobs) store.set('activeJobs', data.activeJobs);
    if (data.completedJobs) store.set('completedJobs', data.completedJobs);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
