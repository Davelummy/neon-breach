# Blender CLI healthcheck workflow

This workflow creates one cube with one material from Blender factory settings
and exports a single GLB to:

```text
.codex/artifacts/blender/healthcheck.glb
```

The artifact directory is ignored by Git. The workflow does not install or
enable BlenderMCP and does not load the downloaded BlenderMCP add-on.

## Security boundaries

- Blender is invoked from the fixed path
  `/Applications/Blender.app/Contents/MacOS/Blender`.
- The wrapper accepts no arguments, commands, environment overrides, or output
  paths.
- Blender receives fixed `--background`, `--factory-startup`,
  `--disable-autoexec`, and `--python` arguments with `shell: false`.
- Blender receives only fixed `LANG=C` and `LC_ALL=C` environment values.
  Tokens, API keys, user-controlled paths, `PYTHONPATH`, and Blender startup
  overrides are excluded.
- The Python script performs no dynamic code execution, process creation,
  shell execution, socket access, network access, downloads, telemetry, or
  credential reads.
- The Python script rejects symlinked artifact directories and a symlinked
  output file before exporting.
- Factory settings are requested both by the CLI and by the Python script. The
  scene is emptied before the test cube is created.
- GLB is used so the export remains one self-contained file. Cameras and lights
  are excluded, and only the selected test cube is exported.

## Review before execution

Before every first run after changing either script:

1. Review the complete diff for `scripts/blender/healthcheck.py`,
   `scripts/blender/run-healthcheck.mjs`, `package.json`, and this document.
2. Confirm the Blender binary and Python script paths remain fixed constants.
3. Confirm the wrapper still rejects command-line arguments and uses
   `shell: false` with only the fixed locale environment.
4. Confirm the Python script contains no `eval`, `exec`, subprocess, shell,
   socket, HTTP, download, telemetry, or credential code.
5. Confirm the only export path is
   `.codex/artifacts/blender/healthcheck.glb` and `.codex/artifacts/` remains in
   `.gitignore`.
6. Perform syntax-only checks. Do not invoke Blender during review.
7. Obtain explicit approval before running:

   ```bash
   npm run blender:check
   ```

On success, the script prints a compact JSON object containing `ok`, `object`,
`output`, and `bytes`. Blender may print its own startup and exporter messages
before that JSON line.
