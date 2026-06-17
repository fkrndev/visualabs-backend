# V-Box Project Flow Documentation

## Project Overview

V-Box (ShardX Launcher) adalah anti-detect browser untuk web scraping dan multi-accounting. Project ini menggunakan Tauri (Rust backend + React frontend) untuk mengelola browser profile yang terisolasi dengan fingerprint spoofing di level Chromium engine.

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust (Tauri)
- **Browser Engine**: Chromium 149 yang sudah di-patch
- **Storage**: Local file system (JSON-based)
- **API**: Local HTTP API dengan JWT auth
- **MCP Server**: Integration dengan Claude Desktop/Cursor

## Main Flows

### 1. Authentication Flow

**Entry Point**: `AuthGate.tsx` → `lib/api.ts`

**Flow**:
1. User membuka aplikasi
2. `AuthGate` mengecek apakah user sudah login
3. Jika belum, menampilkan login form
4. User menginput email/password
5. Call API ke backend untuk authentication
6. Jika success, simpan access token
7. Set user context di Rust backend
8. Redirect ke main application

**Key Components**:
- `src/components/AuthGate.tsx` - Authentication gate component
- `src/lib/api.ts` - API client dengan JWT handling
- `src-tauri/src/lib.rs` - User context management

### 2. Profile Management Flow

**Entry Point**: `App.tsx` → Profile tabs

**Flow**:
1. User membuka Profile tab
2. Load list profiles dari local storage
3. Display profiles dengan metadata (name, notes, proxy, last launched)
4. User bisa:
   - Create new profile
   - Edit existing profile
   - Delete profile
   - Duplicate profile
   - Pin/unpin profile
5. Changes disimpan ke local storage

**Key Components**:
- `src/App.tsx` - Main profile UI
- `src-tauri/src/profile.rs` - Profile CRUD operations
- `src-tauri/src/store.rs` - Storage layer

### 3. Proxy Management Flow

**Entry Point**: `App.tsx` → Proxy tab

**Flow**:
1. User membuka Proxy tab
2. Load list proxies dari local storage
3. Display proxies dengan info (host, port, country, kind)
4. User bisa:
   - Add new proxy (SOCKS5/HTTP/HTTPS)
   - Edit proxy
   - Delete proxy
   - Test proxy connectivity
   - Test UDP relay (untuk SOCKS5)
5. Proxy test results disimpan

**Key Components**:
- `src/App.tsx` - Proxy UI
- `src-tauri/src/proxy.rs` - Proxy CRUD + testing
- `src-tauri/src/psapi.rs` - ProxyShard API integration

### 4. Browser Launch Flow

**Entry Point**: `App.tsx` → Launch button pada profile

**Flow**:
1. User klik "Launch" pada profile
2. Resolve browser binary path:
   - Cek settings manual path
   - Cek runtime cache
   - Fallback ke dev path
3. Load profile configuration
4. Resolve proxy binding (jika ada)
5. Test UDP relay capability (untuk SOCKS5)
6. Auto-resolve fields (timezone, locale, geolocation dari proxy)
7. Generate fingerprint JSON
8. Pre-warm Widevine CDM (untuk DRM content)
9. Inject VBOX Controller extension config
10. Launch Chromium dengan args:
    - `--user-data-dir` (isolated per profile)
    - `--proxy-server` (jika proxy bound)
    - `--fingerprint-file` (path ke fingerprint.json)
    - `--remote-debugging-port` (jika CDP enabled)
11. Track process dengan PID
12. Emit event ke frontend

**Key Components**:
- `src-tauri/src/launch.rs` - Main launch logic
- `src-tauri/src/runtime.rs` - Runtime management
- `src-tauri/src/process.rs` - Process tracking
- `src-tauri/src/fingerprints.rs` - Fingerprint generation

### 5. Profile Switcher Flow

**Entry Point**: `ProfileSwitcher.tsx` (separate window)

**Flow**:
1. Profile switcher window dibuka (always-on-top, borderless)
2. Poll running profiles setiap 2 detik
3. Display running profiles sebagai compact list
4. User bisa:
   - Expand/collapse list
   - Click profile untuk switch/focus
   - Drag window untuk reposition
5. Auto-resize window berdasarkan:
   - Jumlah running profiles
   - Expanded/collapsed state
   - Panjang nama profile terpanjang
6. Listen events dari main window:
   - `profile-launched` - update list
   - `profile-stopped` - update list
   - `profile-updated` - refresh metadata
   - `profile-deleted` - refresh list
   - `theme-changed` - update theme

**Key Components**:
- `src/ProfileSwitcher.tsx` - Switcher UI
- `src-tauri/src/lib.rs` - Process list command
- `src-tauri/src/process.rs` - Process tracking

### 6. Runtime Download Flow

**Entry Point**: Settings → Download Runtime

**Flow**:
1. User buka Settings tab
2. Cek runtime status (installed/not)
3. Jika not installed, tampilkan download button
4. User klik download
5. Fetch manifest dari GitHub (runtime.json)
6. Download archives dari CDN:
   - Browser engine (ShardX-{Platform}.zip)
   - Widevine CDM (ShardX-Widevine-{Platform}.zip)
7. Extract ke runtime directory
8. Verify installation
9. Emit progress events ke frontend
10. Update UI status

**Key Components**:
- `src-tauri/src/runtime.rs` - Runtime download/extract
- `src/App.tsx` - Runtime UI + progress display

### 7. Fingerprint Editor Flow

**Entry Point**: `App.tsx` → Fingerprint tab pada profile

**Flow**:
1. User buka profile dan klik Fingerprint tab
2. Load fingerprint configuration dari profile
3. Display categorized fingerprint settings:
   - Device identity (UA, platform, CPU, RAM)
   - Graphics (WebGL, WebGPU, Canvas noise)
   - Audio (sample rate, channel count, noise)
   - Screen (resolution, DPR, color depth)
   - Locale (timezone, language)
   - Geolocation (coordinates)
   - Network (connection type, RTT, battery)
   - TLS (ClientHello, cipher selection)
   - WebRTC policy
   - Speech voices
   - Fonts
4. User bisa edit setiap parameter
5. Auto-resolve fields bisa di-toggle
6. Changes disimpan ke profile

**Key Components**:
- `src/App.tsx` - Fingerprint editor UI
- `src-tauri/src/fingerprints.rs` - Fingerprint logic
- `src-tauri/src/launch.rs` - Auto-resolve implementation

### 8. Cookie Management Flow

**Entry Point**: `App.tsx` → Cookies tab pada profile

**Flow**:
1. User buka profile dan klik Cookies tab
2. Load cookies dari profile's user-data-dir
3. Display cookies dalam table format
4. User bisa:
   - Add new cookie
   - Edit existing cookie
   - Delete cookie
   - Import cookies (JSON/Netscape)
   - Export cookies
5. Changes disimpan ke browser's cookie database

**Key Components**:
- `src/App.tsx` - Cookie UI
- `src-tauri/src/cookies.rs` - Cookie operations

### 9. API Server Flow

**Entry Point**: Settings → API Server toggle

**Flow**:
1. User enable API server di Settings
2. Rust backend start Axum HTTP server
3. Server listen pada `127.0.0.1:{port}`
4. Generate JWT secret
5. Expose endpoints:
   - `POST /auth` - Login dan dapatkan JWT token
   - `GET /profiles` - List profiles
   - `POST /profiles` - Create profile
   - `POST /profiles/{id}/launch` - Launch profile
   - `POST /profiles/{id}/stop` - Stop profile
   - `GET /profiles/{id}/cdp` - Get CDP endpoint
6. All endpoints require Bearer JWT auth
7. API info (URL, token) displayed di Settings

**Key Components**:
- `src-tauri/src/api.rs` - HTTP API implementation
- `src-tauri/src/settings.rs` - API settings

### 10. MCP Server Flow

**Entry Point**: Settings → MCP Server

**Flow**:
1. User klik "Download MCP Server"
2. Download MCP server source ke `mcp/` directory
3. User register MCP server di Claude Desktop/Cursor config
4. MCP server exposes tools:
   - Profile management (list, create, delete)
   - Browser control (launch, stop, focus)
   - CDP access untuk browser automation
5. MCP server communicate dengan VBOX via local HTTP API

**Key Components**:
- `src-tauri/src/mcp_setup.rs` - MCP download
- `mcp/index.js` - MCP server implementation
- `mcp/README.md` - MCP documentation

### 11. Settings Flow

**Entry Point**: `App.tsx` → Settings tab

**Flow**:
1. User buka Settings tab
2. Load current settings
3. Display settings categories:
   - Browser path (manual override)
   - Theme (dark/light)
   - Geo checker (service untuk geolocation testing)
   - Screen resolution mode
   - API server (enable/disable, port, secret)
   - MCP server (download link)
4. User bisa modify settings
5. Changes disimpan ke local storage
6. Some changes trigger immediate effects (theme, API server)

**Key Components**:
- `src/App.tsx` - Settings UI
- `src-tauri/src/settings.rs` - Settings persistence

### 12. Process Tracking Flow

**Entry Point**: Background process di Rust backend

**Flow**:
1. Setiap browser launch, process di-track dengan PID
2. Background thread monitor process status
3. Jika process exit:
   - Update total runtime
   - Cleanup resources
   - Emit event ke frontend
4. Frontend update running status
5. Profile switcher update list

**Key Components**:
- `src-tauri/src/process.rs` - Process tracking
- `src-tauri/src/lib.rs` - Event emission

## Existing Features

### Core Features
- ✅ Profile management (CRUD)
- ✅ Proxy management (CRUD + testing)
- ✅ Browser launching dengan isolated user-data-dir
- ✅ Fingerprint spoofing (device, graphics, audio, screen, locale, geo, network, TLS, WebRTC)
- ✅ Profile switcher (compact, always-on-top window)
- ✅ Runtime download dan management
- ✅ Cookie management
- ✅ Local HTTP API dengan JWT auth
- ✅ MCP server integration
- ✅ Multi-user support (profile isolation per user)
- ✅ Theme switching (dark/light)
- ✅ Process tracking dan management

### Advanced Features
- ✅ Auto-resolve fields dari proxy (timezone, locale, geolocation)
- ✅ UDP relay testing untuk SOCKS5 proxies
- ✅ Widevine CDM pre-warm untuk DRM content
- ✅ CDP (Chrome DevTools Protocol) support
- ✅ Headless mode support
- ✅ VBOX Controller extension injection
- ✅ Per-profile folder organization
- ✅ Profile pinning dan favorites
- ✅ Runtime tracking (total uptime per profile)

### Anti-Detect Capabilities
- ✅ User agent dan Sec-CH-UA stack spoofing
- ✅ WebGL/WebGPU fingerprint spoofing
- ✅ Canvas noise injection
- ✅ Audio fingerprint spoofing
- ✅ Screen resolution spoofing
- ✅ Timezone dan locale spoofing
- ✅ Geolocation spoofing
- ✅ Network capability spoofing
- ✅ TLS ClientHello spoofing (JA4, Akamai)
- ✅ QUIC over SOCKS5 UDP relay
- ✅ WebRTC policy control
- ✅ Speech synthesis enumeration
- ✅ Font enumeration spoofing
- ✅ No JavaScript injection layer (engine-level patching)

## File Structure

```
v-box/
├── src/                          # React frontend
│   ├── App.tsx                   # Main application
│   ├── ProfileSwitcher.tsx       # Profile switcher window
│   ├── components/
│   │   └── AuthGate.tsx          # Authentication component
│   └── lib/
│       └── api.ts                # API client
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── lib.rs                # Main entry point
│       ├── api.rs                # HTTP API server
│       ├── launch.rs             # Browser launch logic
│       ├── profile.rs            # Profile CRUD
│       ├── proxy.rs              # Proxy management
│       ├── runtime.rs            # Runtime download
│       ├── process.rs            # Process tracking
│       ├── fingerprints.rs       # Fingerprint logic
│       ├── cookies.rs            # Cookie management
│       ├── settings.rs           # Settings persistence
│       ├── store.rs              # Storage layer
│       ├── mcp_setup.rs          # MCP server setup
│       ├── sse_ws.rs             # SSE/WebSocket
│       ├── extension_proxy.rs    # Extension proxy
│       └── psapi.rs              # ProxyShard API
├── sdks/                         # Standalone SDKs
│   ├── node/                     # Node.js SDK
│   ├── python/                   # Python SDK
│   └── rust/                     # Rust SDK
└── mcp/                          # MCP server
    ├── index.js                  # MCP server implementation
    └── package.json
```

## External Integrations

- **ProxyShard API**: Proxy testing dan management
- **GitHub**: Runtime manifest hosting
- **Cloudflare R2**: Browser engine dan Widevine hosting
- **Claude Desktop/Cursor**: MCP server integration
- **Chromium 149**: Patched browser engine

## Key Technologies

- **Frontend**: React 19, TypeScript, Vite, Tauri API
- **Backend**: Rust, Tauri, Axum (HTTP server), Tokio (async runtime)
- **Storage**: JSON files, SQLite (untuk cookies)
- **Authentication**: JWT (Bearer token)
- **IPC**: Tauri commands, Events
- **Browser Automation**: CDP (Chrome DevTools Protocol)

## Development Notes

- Project menggunakan multi-user architecture dengan profile isolation
- Semua fingerprint spoofing dilakukan di Chromium engine level, bukan via JS injection
- Runtime download menggunakan custom CDN domain untuk menghindari blocking di Indonesia
- Profile switcher menggunakan transparent window dengan macOS-specific workarounds
- MCP server memungkinkan natural-language control dari AI assistants


Berdasarkan analisis codebase, ini adalah pembagian tanggung jawab antara Tauri (Rust backend) dan React (frontend):

## Tauri (Rust Backend) - System & Business Logic

### Core Operations
- **Profile Management** (`profile.rs`)
  - CRUD profiles (create, read, update, delete)
  - Profile metadata storage
  - User data directory management
  - Multi-user profile isolation

- **Proxy Management** (`proxy.rs`)
  - CRUD proxies
  - Proxy connectivity testing
  - UDP relay probing (SOCKS5)
  - Proxy test result caching

- **Browser Launching** (`launch.rs`)
  - Binary path resolution
  - Process spawning dengan correct arguments
  - Fingerprint file generation
  - Widevine CDM pre-warm
  - Extension config injection
  - CDP endpoint management

- **Process Tracking** (`process.rs`)
  - PID tracking untuk running browsers
  - Process lifecycle monitoring
  - Runtime uptime calculation
  - Process cleanup on exit

### System Integration
- **Runtime Management** (`runtime.rs`)
  - CDN download (browser engine + Widevine)
  - Archive extraction
  - Installation verification
  - Progress event emission

- **Storage Layer** (`store.rs`)
  - File system operations
  - Directory structure management
  - JSON serialization/deserialization
  - Cross-platform path handling

- **Settings Persistence** (`settings.rs`)
  - Settings CRUD
  - Configuration file management
  - Default values handling

### Advanced Features
- **Fingerprint Logic** (`fingerprints.rs`)
  - Fingerprint generation
  - Auto-resolve field logic
  - Device identity spoofing parameters

- **Cookie Operations** (`cookies.rs`)
  - Cookie database access
  - Cookie import/export
  - Cross-platform cookie storage

- **HTTP API Server** (`api.rs`)
  - Axum server setup
  - JWT authentication
  - REST endpoint implementation
  - Request/response handling

- **MCP Server Setup** (`mcp_setup.rs`)
  - MCP source download
  - Directory setup
  - Installation verification

### Network & External APIs
- **ProxyShard API** (`psapi.rs`)
  - External API calls
  - Customer data fetching
  - Chrome profiles API

- **SSE/WebSocket** (`sse_ws.rs`)
  - Real-time event streaming
  - WebSocket connection management

- **Extension Proxy** (`extension_proxy.rs`)
  - Browser extension communication
  - Native messaging host

### Native OS Operations
- **File System**
  - Read/write text files
  - Directory creation/deletion
  - File path operations

- **Clipboard**
  - Read/write clipboard content

- **Window Management**
  - Window creation/destruction
  - Window focus control
  - Process window tracking

- **Authentication Context**
  - User ID management
  - Multi-user isolation
  - Session handling

## React (Frontend) - UI & User Interaction

### UI Components
- **Main Application** (`App.tsx`)
  - Tab navigation (Profiles, Proxies, Settings)
  - Profile list dengan metadata display
  - Proxy list dengan status indicators
  - Fingerprint editor UI
  - Cookie management UI
  - Settings forms
  - Theme switching UI

- **Profile Switcher** (`ProfileSwitcher.tsx`)
  - Compact running profile list
  - Expand/collapse functionality
  - Drag handle untuk window repositioning
  - Auto-resize logic
  - Theme-aware rendering

- **Authentication Gate** (`AuthGate.tsx`)
  - Login form
  - Authentication state management
  - Protected route logic

### State Management
- **Local State**
  - `useState` untuk component state
  - Profile list state
  - Proxy list state
  - Running profiles state
  - Settings state
  - Theme state
  - Form input states

- **Global State**
  - Toast notification queue
  - Confirm modal state
  - Context menu state
  - Developer mode context

### User Interactions
- **Event Handling**
  - Button clicks
  - Form submissions
  - Drag operations
  - Context menu triggers
  - Keyboard shortcuts

- **Form Management**
  - Input validation
  - Form submission
  - Error handling
  - Success feedback

### API Integration
- **Tauri Commands**
  - `invoke()` calls ke Rust backend
  - Error handling dan parsing
  - Loading states

- **HTTP Client** (`lib/api.ts`)
  - External API calls (ProxyShard)
  - JWT token management
  - Request/response handling
  - Error handling

### Real-time Updates
- **Event Listeners**
  - Tauri event subscriptions
  - Profile events (launched, stopped, updated, deleted)
  - Theme change events
  - Storage events

- **Polling**
  - Running profiles polling (2s interval)
  - Status updates

### UI Utilities
- **Toast Notifications**
  - Success/error/info messages
  - Auto-expiry (5.5s)
  - Global queue management

- **Confirm Modals**
  - Custom confirmation dialogs
  - Danger button styling
  - Async result handling

- **Context Menu**
  - Right-click menu
  - Position clamping
  - Action handling

- **Clipboard Operations**
  - Copy to clipboard via Tauri
  - Paste from clipboard via Tauri

### File Operations
- **File Dialogs**
  - Open file dialog
  - Save file dialog
  - Directory selection

- **Path Operations**
  - File path display
  - Path validation

### Window Management (via Tauri API)
- **Window Control**
  - Window resize
  - Window focus
  - Window hide/show
  - Drag handle implementation

### Styling & Theming
- **CSS Integration**
  - Theme application (dark/light)
  - Responsive design
  - Component styling
  - CSS-in-JS patterns

- **Dynamic Styling**
  - Theme-aware components
  - Conditional classes
  - State-based styling

## Summary

**Tauri (Backend)** fokus pada:
- System-level operations
- File system access
- Process management
- Network operations
- Business logic
- Data persistence
- Native OS integration

**React (Frontend)** fokus pada:
- UI rendering
- User interactions
- State management
- Event handling
- API orchestration
- Real-time updates
- User feedback
- Styling & theming

Ini adalah clean separation di mana React menangani presentation dan user interaction, sedangkan Tauri menangani semua operasi yang butuh akses ke system resources dan business logic yang kompleks.