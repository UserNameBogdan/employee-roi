const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  
  // License
  checkLicense: () => ipcRenderer.invoke('license:check'),
  activateLicense: (data) => ipcRenderer.invoke('license:activate', data),
  deactivateLicense: () => ipcRenderer.invoke('license:deactivate'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (updates) => ipcRenderer.invoke('settings:update', updates),
  
  // Employees (BD1)
  getEmployees: () => ipcRenderer.invoke('employees:getAll'),
  addEmployee: (employee) => ipcRenderer.invoke('employees:add', employee),
  updateEmployee: (employee) => ipcRenderer.invoke('employees:update', employee),
  deleteEmployee: (id) => ipcRenderer.invoke('employees:delete', id),
  calculateEmployeeCost: (employee) => ipcRenderer.invoke('employees:calculateCost', employee),
  getEmployeeAvailability: (params) => ipcRenderer.invoke('employees:getAvailability', params),
  getEmployeeJobHistory: (employeeId) => ipcRenderer.invoke('employees:getJobHistory', employeeId),
  getAllJobHistory: () => ipcRenderer.invoke('employees:getAllJobHistory'),
  
  // Timesheet (BD2)
  getTimesheet: (params) => ipcRenderer.invoke('timesheet:get', params),
  getAllTimesheets: () => ipcRenderer.invoke('timesheet:getAll'),
  
  // Scenarios
  generateScenarios: (params) => ipcRenderer.invoke('scenarios:generate', params),
  saveScenario: (data) => ipcRenderer.invoke('scenarios:save', data),
  getScenarios: () => ipcRenderer.invoke('scenarios:getAll'),
  deleteScenario: (id) => ipcRenderer.invoke('scenarios:delete', id),
  
  // Jobs
  activateJob: (scenarioId) => ipcRenderer.invoke('jobs:activate', scenarioId),
  getActiveJobs: () => ipcRenderer.invoke('jobs:getActive'),
  addTeamMember: (params) => ipcRenderer.invoke('jobs:addTeamMember', params),
  removeTeamMember: (params) => ipcRenderer.invoke('jobs:removeTeamMember', params),
  completeJob: (params) => ipcRenderer.invoke('jobs:complete', params),
  getCompletedJobs: () => ipcRenderer.invoke('jobs:getCompleted'),
  saveJobReport: (params) => ipcRenderer.invoke('jobs:saveReport', params),
  
  // Dashboard
  getDashboardData: (selectedMonth) => ipcRenderer.invoke('dashboard:getData', selectedMonth),
  getAvailableMonths: () => ipcRenderer.invoke('dashboard:getAvailableMonths'),
  
  // Reports
  getReportsData: (params) => ipcRenderer.invoke('reports:getData', params || {}),
  exportCSV: (params) => ipcRenderer.invoke('reports:exportCSV', params),
  
  // Data export/import
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import')
});
