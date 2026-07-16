# NEON BREACH Codex MCP setup

This repository includes a safe project-scoped MCP configuration in
`.codex/config.toml`. It intentionally contains no credentials. Servers that
need paid accounts, secrets, Blender, Chrome, or Docker start disabled.

## 1. Open the project in Codex

1. Clone or pull `Davelummy/neon-breach` on the Mac.
2. Open that local folder in the Codex app.
3. Trust the repository when Codex asks. Project MCP configuration is ignored
   for untrusted repositories.
4. Open **Settings > MCP servers** and confirm `context7` and `playwright` are
   listed.
5. Restart Codex after changing MCP configuration or installing prerequisites.

Run this first in Terminal from the repository root:

```bash
npm run mcp:check
```

The command reports only whether tools and environment variables exist. It
never prints secret values.

## 2. Core browser tooling

Install Node.js 18 or newer and Google Chrome:

```bash
brew install --cask google-chrome
```

Playwright MCP is enabled by default. It runs Chrome headlessly with an isolated
profile. Chrome DevTools MCP remains disabled until Chrome is installed. After
installing it, change `mcp_servers.chrome_devtools.enabled` to `true`.

## 3. Blender production tooling

Install Blender and `uv`:

```bash
brew install --cask blender
brew install uv
```

Download `addon.py` only from the BlenderMCP repository, install it through
Blender's add-on preferences, enable the add-on, and start its MCP socket inside
Blender. Then change `mcp_servers.blender.enabled` to `true`.

BlenderMCP can execute Python inside Blender. Keep its approval mode on
`prompt`, use it only with this trusted repository, and review destructive
scene operations before approval.

## 4. Account-dependent production servers

Set credentials in the shell environment or macOS launch environment used to
start Codex. Never put secrets in `.codex/config.toml`, `.env` files committed
to Git, terminal screenshots, issues, or chat messages.

| Server | Local variables or authentication | Enable after |
| --- | --- | --- |
| Meshy | `MESHY_API_KEY` | Meshy API access is active |
| ElevenLabs | `ELEVENLABS_API_KEY` | `uv` is installed and credits are available |
| Sentry | OAuth in Codex | A Sentry project exists |
| BrowserStack | `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY` | A BrowserStack plan is active |
| PostHog | OAuth in Codex | Privacy-safe telemetry is approved |
| SonarQube | `SONARQUBE_TOKEN`, `SONARQUBE_ORG` | Docker and SonarQube are configured |

For ElevenLabs output, create an ignored local folder and set:

```bash
mkdir -p .codex/artifacts/audio
export ELEVENLABS_MCP_BASE_PATH="$PWD/.codex/artifacts/audio"
export ELEVENLABS_MCP_OUTPUT_MODE="files"
```

Enable one account-dependent MCP at a time, restart Codex, authenticate when
required, and run a harmless read-only command before enabling the next one.

## 5. Existing hosted plugins

GitHub, Sites, Google Drive, Figma, and Automations are already connected to the
hosted ChatGPT workspace. They remain plugin-managed and therefore do not
appear in this project config. Figma currently reports View-only seats; design
write operations require an Editor seat or edit access to a target file.

## 6. Verification order

Use this order to keep failures easy to diagnose:

1. Context7: retrieve Three.js documentation.
2. Playwright: open the local game and take a screenshot.
3. Chrome DevTools: record a short performance trace.
4. Blender: inspect an empty test scene without modifying it.
5. Meshy: check account balance before generating an asset.
6. ElevenLabs: list available voices before creating audio.
7. Sentry, BrowserStack, PostHog, and SonarQube: perform read-only account or
   project checks.

Do not enable Cloudflare or Supabase MCPs yet. The current Sites/D1 backend is
working; adding a second hosting or database control plane before an explicit
architecture decision would increase risk without improving the game.
