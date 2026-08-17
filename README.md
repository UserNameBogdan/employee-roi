# KISS Employee ROI

**Professional desktop application for team cost optimization and ROI tracking**

[![Version](https://img.shields.io/badge/version-4.3.0-blue.svg)](https://github.com/bogdanindigo/employee-roi/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/bogdanindigo/employee-roi/releases)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)

## 📊 Overview

KISS Employee ROI is a powerful desktop application that helps businesses track employee costs, optimize team allocation, and maximize return on investment. Built with Electron, it provides a native desktop experience across all major platforms.

## ✨ Features

- **Job Planning** - Generate optimal team scenarios based on cost and availability
- **Employee Management** - Track contracts, salaries, and overtime policies
- **ROI Tracking** - Calculate profit per employee and per project
- **Monthly Timesheet** - Monitor hours worked vs produced
- **Comprehensive Reports** - Export data to CSV and TXT formats
- **Monthly Split** - Automatic job breakdown across calendar months
- **Licensing System** - Secure online license verification with Supabase

## 🚀 Download

### Windows
[Download for Windows](https://github.com/bogdanindigo/employee-roi/releases/latest/download/KISS-Employee-ROI-Setup-4.3.0.exe) (64-bit / 32-bit)

### macOS
[Download for macOS](https://github.com/bogdanindigo/employee-roi/releases/latest/download/KISS-Employee-ROI-4.3.0.dmg) (Intel / Apple Silicon)

### Linux
[Download for Linux](https://github.com/bogdanindigo/employee-roi/releases/latest/download/KISS-Employee-ROI-4.3.0.AppImage) (64-bit)

## 💻 Installation

### Windows
1. Download `KISS-Employee-ROI-Setup-4.3.0.exe`
2. Double-click the installer
3. Follow the installation wizard
4. Launch from Start Menu or Desktop shortcut

### macOS
1. Download `KISS-Employee-ROI-4.3.0.dmg`
2. Open the DMG file
3. Drag "KISS Employee ROI" to Applications folder
4. Launch from Applications

### Linux
1. Download `KISS-Employee-ROI-4.3.0.AppImage`
2. Make it executable: `chmod +x KISS-Employee-ROI-4.3.0.AppImage`
3. Run: `./KISS-Employee-ROI-4.3.0.AppImage`

## 🔑 Licensing

KISS Employee ROI requires a valid license to use. Licenses are available at:

**€50/month** or **€500/year**

Purchase at: [bogdanskissmethod.com/employee-roi](https://bogdanskissmethod.com/employee-roi)



## 📸 Screenshots

![Dashboard](screenshots/dashboard.png)
*Monthly dashboard with revenue tracking*

![Job Planning](screenshots/planning.png)
*Intelligent team allocation scenarios*

![Reports](screenshots/reports.png)
*Comprehensive employee performance reports*

## 🛠️ Development

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Build from source

```bash
# Clone repository
git clone https://github.com/bogdanindigo/employee-roi.git
cd employee-roi

# Install dependencies
npm install

# Run in development
npm start

# Build for your platform
npm run build

# Build for all platforms
npm run build:all
```

### Build commands
- `npm run build:win` - Windows installer
- `npm run build:mac` - macOS DMG
- `npm run build:linux` - Linux AppImage
- `npm run build:all` - All platforms

## 🏗️ Tech Stack

- **Electron** - Desktop framework
- **Node.js** - Backend runtime
- **Electron Store** - Persistent data storage
- **Supabase** - License verification
- **Vanilla JS** - Frontend (no framework overhead)

## 📝 Changelog

### v4.3.0 (2026-02-04)
- ✨ Added monthly split for cross-month jobs
- ✨ Dashboard month selector
- 🐛 Fixed salary calculations for overtime
- 🎨 Improved UI consistency

### v4.2.1 (2026-02-03)
- ✨ Integrated Supabase licensing system
- ✨ Hardware ID binding
- ✨ 7-day offline grace period
- 🐛 Fixed monthly timesheet display

[View full changelog](CHANGELOG.md)

## 🤝 Support

For support, feature requests, or bug reports:

- **Email**: support@bogdanskissmethod.com
- **Website**: [bogdanskissmethod.com](https://bogdanskissmethod.com)
- **Issues**: [GitHub Issues](https://github.com/bogdanindigo/employee-roi/issues)

## 📄 License

Copyright © 2026 KISS Platform. All rights reserved.

This software is proprietary and requires a valid license for use.

---

**Made with ❤️ by KISS Platform**

*Keep It Simple, Smart.*
