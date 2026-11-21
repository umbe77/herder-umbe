# herdr-umbe

A personal collection of Herdr mods, key bindings and a theme. Nothing here is built or compiled: the scripts link (or
copy) the files into Herdr's config folder and Herdr loads them from there.

## Herdr reference

Read @~/.config/herdr-app/AGENTS.md before changing anything. It documents the
Herdr app: layouts, `keys.json`, commands, `settings.json`, how mods are
written (the `herdr`, `gpui-kit` and `gpui-base` modules) and how to check them.
The type declarations for the mod API are in `~/.config/herdr-app/herdr.d.ts`
and `~/.config/herdr-app/gpui-kit.d.ts`.

## Layout

```
mods/<name>/       one Herdr mod per folder (installed one folder at a time)
  mod.json         manifest: title, place, overlay (popup size/position)
  main.js          the mod: `export default class … extends View`
  config.js        copy of the shared config helper (only mods that need it)
  gpui-kit.d.ts    editor typings written by Herdr — never edit by hand
  jsconfig.json    editor config written by Herdr
themes/            Herdr themes (catppuccin.json = Catppuccin Mocha, mauve accent)
keys.json          bindings merged into ~/.config/herdr-app/keys.json
install.sh         link/copy mods + themes, merge keys, run `herdr-app check`
uninstall.sh       remove them and the bindings that still match keys.json
sync-config.sh     copy mods/umbe-settings/config.js into every other mod
README.md          user-facing docs for every mod, key and option
```

## The mods

| Mod | Key | What it does |
|---|---|---|
| `choose-projects` | `alt-o` | fuzzy picker over the folders in `projects_dir` not already open as a space; opens a space with `IDE` (`nvim .`), `Terminal` and an agent tab |
| `new-project` | `alt-n` | prompts for a name, creates `<projects_dir>/<name>`, opens it like `choose-projects` |
| `switch-space` | `alt-s` | fuzzy switcher over the open spaces |
| `close-space` | `alt-d` | fuzzy list of the open spaces; Enter arms a row, Enter again runs `space.close`; Tab marks several, alt-a marks all |
| `umbe-settings` | `alt-,` | edits `projects_dir` and `agent_cmd` in the config file |
| `copy-mode` | `alt-c` | tmux `mode-keys vi` copy mode for the focused terminal |
| `zen-mode` | `alt-z` | hides sidebar / tabs / status / panel; state per layout in `shared("zen-mode")` |
| `git-graph-toggle` | `alt-g` | opens/closes the right panel on the git graph |
| `works-space` | `ctrl-n` | selects the `works` space, or creates it in `~` with two terminal tabs; moves it to the top |

`keys.json` also binds `shift-left` / `shift-right` to `tab.prev` / `tab.next`.

All mods use `"place": "none"` with a popup overlay and are opened with
`mod.open:<name>`. One-shot mods (`zen-mode`, `git-graph-toggle`) use a 1×1
overlay, do their work in `init` (skipped when `checking()`), then
`closeOverlay(props().overlay)`.

## Configuration

The mods read `$XDG_CONFIG_HOME/herdr-umbe/config.json`
(`~/.config/herdr-umbe/config.json`):

```json
{ "projects_dir": "~/develop", "agent_cmd": "claude" }
```

`mods/umbe-settings/config.js` is the source of truth for the helper that reads
and writes it. Mods can't share files (each folder is installed on its own,
possibly copied), so `choose-projects` and `new-project` keep identical copies.
**After editing it, run `./sync-config.sh`** — never edit the other copies.

## Workflow

- Install / reinstall: `./install.sh` (symlinks by default, so edits in the repo
  are live; `--copy` copies, `--no-keys` skips `keys.json`,
  `HERDR_CONFIG=/path` targets another config folder). It runs
  `herdr-app check` on every mod and exits non-zero if one fails.
- Check a single mod: `herdr-app check ~/.config/herdr-app/mods/<name>`.
- Remove: `./uninstall.sh`.

## Adding or changing a mod

1. Create `mods/<name>/mod.json` and `main.js` (copy the shape of an existing
   mod; `install.sh` only picks up folders that contain `mod.json`).
2. If it needs the config, copy `config.js` in and keep it synced.
3. Add its binding to `keys.json` (under `global`).
4. Document it in `README.md`: the intro count, a `### <name> (<key>)`
   section, and the bindings list under **Install**.
5. Run `./install.sh` and make sure every `herdr-app check` passes.

## Conventions

- Plain ES modules (ES2022), no build step, no dependencies beyond what Herdr
  provides. Type-checked by the editor via `jsconfig.json` (`checkJs`).
- Each `main.js` starts with a comment saying what the mod does and where its
  state lives.
- Commits use conventional prefixes (`feat: …`).
