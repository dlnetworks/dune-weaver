## 🚀 Enhanced Fork - Standalone & UI Improvements

> **Note:** This is a fork of the original [Dune Weaver](https://github.com/tuanchris/dune-weaver) project with enhancements focused on standalone operation (no Raspberry Pi), improved performance, and additional features.

---

# Dune Weaver

[![Patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/cw/DuneWeaver)

![Dune Weaver](./static/og-image.jpg)

**An open-source kinetic sand art table that creates mesmerizing patterns using a ball controlled by precision motors.**

### Major Enhancements

#### 🖥️ Standalone Simple Control Interface
- **New `simple_control.py`** - A lightweight, standalone web interface for controlling your sand table
  - Single-file Python server that can run independently
  - Replicates the main Browse page functionality in a minimal package
  - Auto-detects backend API configuration from `main.py`
  - Command-line arguments for custom IP/port binding (`--ip`, `--port`)
  - Perfect for headless setups or dedicated control panels
  - Can be monitored, started, stopped, and restarted directly from the Settings page

#### 📡 WebSocket Support for Wireless Operation
- **FluidNC WebSocket Integration**
  - Eliminates the need for USB cable tethering to the FluidNC ESP32
  - Connect to your sand table wirelessly over your network
  - Choose between Serial or WebSocket as the default connection method in Settings
  - Requires WiFi-enabled FluidNC firmware
  - Full bidirectional communication for real-time control and status updates

#### ⚙️ Enhanced Server Management
- **API Server Control** - Monitor, start, stop, and restart the API server directly from Settings
- **Simple Control Server Management** - Control the standalone interface server from Settings
- **Configurable API Settings** - Set custom API IP address and port in Settings
- **Server Status Monitoring** - Real-time status indicators for all running services

#### 🎨 UI & Workflow Improvements
- **List View** - Added list view option to Browse and Playlist pages for easier navigation
- **History Page** - Comprehensive history tracking of all executed patterns
- **Dune Weaver Studio Integration** - Integrated pattern editing and conversion tools
  - Adjust pattern zoom and orientation
  - Convert G-code files to THR format
  - Convert STL files to THR format
  - Fine-tune pattern positioning and scale
- **Enhanced Playlist Management**
  - Insert patterns anywhere in the playlist, not just append to the end
  - Start playback from any position by selecting a pattern and pressing play
  - Add multiple instances of the same pattern to a playlist
  - Remove individual pattern instances (not all instances) when duplicates exist

#### 🧹 Pre-Execution Shell Commands
- **Clear Pattern Automation** - Execute custom shell commands before any pattern starting with "clear" runs

#### ⚡ Performance & Caching
- **Multi-threaded Preview Generation**
  - Defaults to using all available CPU threads for maximum performance
  - User-configurable thread count in Settings for fine-tuning based on system resources
  - Parallel processing of pattern previews
  - Significant speedup for large pattern libraries
- **Pattern Duration Cache** (`modules/core/pattern_duration_cache.py`)
  - Pre-calculates estimated pattern run times based on configured ball movement speed
  - Persistent cache eliminates need to recalculate durations on every load
  - Faster pattern list loading and playlist duration estimates
- **Preview Cache Management UI**
  - View cache statistics (size, file count)
  - One-click cache invalidation from Settings
  - Automatic cleanup of orphaned cache files

#### 🎯 LED & State Management
- **Improved LED Integration**
  - Better state synchronization with LED controller
  - Enhanced idle timeout management
  - Thread-safe LED operations
  - More reliable LED state tracking

#### 🔧 Technical Improvements
- **Connection Management** - Improved serial connection handling and error recovery
- **State Management** - Enhanced playlist and pattern state tracking
- **API Enhancements** - Additional endpoints for queue management and cache operations

### New Files Added
- `simple_control.py` - Standalone control interface
- `modules/core/pattern_duration_cache.py` - Duration caching system
- `frontend/src/pages/HistoryPage.tsx` - Pattern history tracking
- `frontend/src/pages/StudioPage.tsx` - Dune Weaver Studio integration

### Modified Components
- Enhanced `BrowsePage` with list view and improved layout options
- Enhanced `PlaylistsPage` with list view and advanced insertion controls
- Updated `SettingsPage` with server management, cache management, and worker configuration
- Optimized `cache_manager`, `preview`, and `pattern_manager` modules
- Enhanced LED controller and interface for better reliability
- Improved `connection_manager` with WebSocket support

### Usage

#### Running the Standalone Control Interface
```bash
# Basic usage (binds to 0.0.0.0:9090, auto-detects backend)
python simple_control.py

# Custom IP and port
python simple_control.py --ip 192.168.1.100 --port 8888

# The interface auto-detects the backend API from main.py
# or falls back to 127.0.0.1:8080
```

#### Configuration
- Connection method (Serial/WebSocket) can be selected in Settings → Table Control
- API IP and port can be configured in Settings
- Worker count can be adjusted in Settings → Preview Cache section
- Preview cache can be managed/cleared from Settings
- Server status and controls available in Settings → System
- All original Dune Weaver configuration options remain available

### ⚠️ Development Status

This fork is in **active development** and may contain bugs or incomplete features. Please report any issues you encounter.

### 🔮 Upcoming Features

The following enhancements are planned for future releases:

- **HTTP Authentication** - Basic HTTP auth to password protect the Dune Weaver web UI and API
- **SSL/TLS Support** - HTTPS support for secure connections

---

**Original Dune Weaver README follows below:**

---

## Features

- **Modern React UI** — A responsive, touch-friendly web interface that installs as a PWA on any device
- **Pattern Library** — Browse, upload, and manage hundreds of sand patterns with auto-generated previews
- **Live Preview** — Watch your pattern come to life in real time with progress tracking
- **Playlists** — Queue up multiple patterns with configurable pause times and automatic clearing between drawings
- **LED Integration** — Synchronized lighting via native DW LEDs or WLED, with separate idle, playing, and scheduled modes
- **Still Sands Scheduling** — Set quiet hours so the table pauses automatically on your schedule
- **Multi-Table Support** — Control several sand tables from a single interface
- **Home Assistant Integration** — Connect to Home Assistant or other home automation systems using MQTT
- **Auto-Updates** — One-click software updates right from the settings page
- **Add-Ons** — Optional [Desert Compass](https://duneweaver.com/docs) for auto-homing and [DW Touch](https://duneweaver.com/docs) for dedicated touchscreen control

## How It Works

The system is split across two devices connected via USB:

```
┌─────────────────┐         USB          ┌─────────────────┐
│  Raspberry Pi   │ ◄──────────────────► │  DLC32 / ESP32  │
│  (Dune Weaver   │                      │  (FluidNC)      │
│   Backend)      │                      │                 │
└─────────────────┘                      └─────────────────┘
        │                                        │
        │ Wi-Fi                                  │ Motor signals
        ▼                                        ▼
   Web Browser                            Stepper Motors
   (Control UI)                           (Theta & Rho)
```

The **Raspberry Pi** runs the web UI, manages pattern files and playlists, and converts patterns into G-code. The **DLC32/ESP32** running [FluidNC](https://github.com/bdring/FluidNC) firmware receives that G-code and drives the stepper motors in real time.

## Hardware

Dune Weaver comes in three premium models:

| | [DW Pro](https://duneweaver.com/products/dwp) | [DW Mini Pro](https://duneweaver.com/products/dwmp) | [DW Gold](https://duneweaver.com/products/dwg) |
|---|---|---|---|
| **Size** | 75 cm (29.5") | 25 cm (10") | 45 cm (17") |
| **Enclosure** | IKEA VITTSJÖ table | IKEA BLANDA bowl | IKEA TORSJÖ side table |
| **Motors** | 2 × NEMA 17 | 2 × NEMA 17 | 2 × NEMA 17 |
| **Controller** | DLC32 | DLC32 | DLC32 |
| **Best for** | Living rooms | Desktops | Side-table accent piece |

All models run the same software with [FluidNC](https://github.com/bdring/FluidNC) firmware — only the mechanical parts differ.

Free 3D-printable models on MakerWorld: [DW OG](https://makerworld.com/en/models/841332-dune-weaver-a-3d-printed-kinetic-sand-table#profileId-787553) · [DW Mini](https://makerworld.com/en/models/896314-mini-dune-weaver-not-your-typical-marble-run#profileId-854412)

> **Build guides, BOMs, and wiring diagrams** are in the [Dune Weaver Docs](https://duneweaver.com/docs).

## Quick Start

The fastest way to get running on a Raspberry Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/tuanchris/dune-weaver/main/setup-pi.sh | bash
```

This installs Docker, clones the repo, and starts the application. Once it finishes, open **http://\<hostname\>.local** in your browser.

For full deployment options (Docker, manual install, development setup, Windows, and more), see the **[Deploying Backend](https://duneweaver.com/docs/deploying-backend)** guide.

### Polar coordinates

The sand table uses **polar coordinates** instead of the typical X-Y grid:

- **Theta (θ)** — the angle in radians (2π = one full revolution)
- **Rho (ρ)** — the distance from the center (0.0 = center, 1.0 = edge)

Patterns are stored as `.thr` text files — one coordinate pair per line:

```
# A simple four-point star
0.000 0.5
1.571 0.7
3.142 0.5
4.712 0.7
```

The same pattern file works on any table size thanks to the normalized coordinate system. You can create patterns by hand, generate them with code, or browse the built-in library.

## Documentation

Full setup instructions, hardware assembly, firmware flashing, and advanced configuration:

**[Dune Weaver Docs](https://duneweaver.com/docs)**

## Contributing

We welcome contributions! See the [Contributing Guide](CONTRIBUTING.md) for how to get started.

---

**Happy sand drawing!**
