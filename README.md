# Yuzei Labs

Yuzei Labs is a desktop application built for Minecraft mod and plugin developers. It brings the entire development workflow — building, versioning, publishing, deploying, and debugging — into a single, cohesive tool, instead of juggling Gradle commands, file managers, hosting panels, and log files separately.

> ⚠️ **Test Release** — This project is under active development. Expect bugs and rough edges. Feedback and bug reports are very welcome!

## Features

The app is built around a modular **Tools** system — each major feature is its own self-contained tool within the platform.

### 🔧 Publisher

Handles the entire build lifecycle for your project:

- Automatically detects your Gradle project — name, version, Java version, Gradle version, and Git branch — the moment you open a workspace
- Detects multi-module projects and lets you scope builds to specific modules only
- Runs Clean, Build, and Build & Publish tasks with a live, streaming console
- Edit your project's version, developer name, and build number, and apply changes directly back into `build.gradle`
- Built-in release notes editor with quick-insert sections (Added, Changed, Fixed, Removed, Known Issues)
- Tracks every build artifact — rename, delete, reveal in file explorer, or drag artifacts directly out of the app
- Automatically copies finished artifacts to a configured output folder
- Sends formatted publish notifications to a Discord webhook, including the artifact when under Discord's size limit
- Open your project directly in IntelliJ IDEA, Eclipse, or VS Code, with automatic detection of installed IDEs

### 🚀 Deploy

Get your builds onto a live server and manage it afterward:

- Supports local servers and remote servers hosted through Pterodactyl panels
- Create deployment profiles defining where an artifact should go, with automatic backups and restarts
- Full server control — start, stop, restart — for both local and Pterodactyl-managed servers
- Live console streaming, with automatic reconnection for Pterodactyl sessions
- Live CPU and RAM usage monitoring
- Built-in file manager and text editor for logs, configs, and other files
- Send console commands directly to a running server
- One-click backups (local folder copy or Pterodactyl's backup system)
- Full deploy history

### 🩺 Inspector

An AI-assisted debugging assistant for Java and Minecraft-specific errors:

- Paste a crash log, stack trace, or console output — or upload a log file directly
- Offline analysis powered by a built-in knowledge base covering common Java exceptions, Fabric/Forge/NeoForge mod errors, and Paper/Bukkit/Spigot plugin errors
- Optional deeper AI-powered analysis using OpenAI, Anthropic, Gemini, OpenRouter, or local options like Ollama and LM Studio
- Each analysis returns a summary, root cause, suggested fixes, a confidence score, and related files detected in the trace
- Follow-up AI chat scoped specifically to the error you're debugging

### Also included

- Unified **History** page combining build and deploy history in one searchable, filterable feed
- **Dashboard** showing current project status, quick tool access, recent workspaces, and recent activity
- Full account support — registration, login, password changes, profile avatars
- Per-tool settings that appear dynamically in the Settings page

## Installation

1. Download the latest installer from the [Releases page](../../releases)
2. Run `yuzei-labs_x.x.x_x64-setup.exe` (or the `.msi`) and follow the prompts
3. Launch Yuzei Labs, sign in or create an account, and open your project workspace

**Windows only** for now.

## Tech Stack

- [Tauri](https://tauri.app/) — desktop app shell (Rust backend)
- [React](https://react.dev/) + TypeScript — frontend
- [Vite](https://vite.dev/) — build tooling
- [Zustand](https://github.com/pmndrs/zustand) — state management

## Development

```bash
# install dependencies
npm install

# run in development mode
npm run tauri dev

# build a production installer
npm run tauri build
```

Build output (installer files) will be under `src-tauri/target/release/bundle/`.

## Contributing

This project is early and evolving quickly. Bug reports, feature suggestions, and pull requests are welcome — feel free to open an issue.

## License

This project is licensed under the [MIT License](LICENSE).
