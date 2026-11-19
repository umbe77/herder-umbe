# herder-choose-projects

Seven Herdr mods: a fuzzy project picker for the folders directly inside your
projects folder (`~/develop` by default), a prompt that creates a new project
there, a fuzzy switcher for the spaces you have open, a settings popup, a
tmux-style copy mode with vi keys, a zen mode that hides every bar, and a key
that toggles the git graph panel.

## What it does

### `choose-projects` (`alt-o`)

- Type to fuzzy-filter the folders in the projects folder (immediate subdirectories,
  hidden folders skipped).
- Use `↑` / `↓` and `Enter`, click a row, or press `Esc` to close.
- Choosing a folder creates a space named after it, with three tabs:
  - `IDE` — runs `nvim .`
  - `Terminal` — your default shell
  - an agent tab — runs `agent_cmd` (`claude` by default) and is named after
    the command (`Claude`, `Codex`, …)
- All tabs start in the chosen folder; the `IDE` tab is the active one.

### `new-project` (`alt-n`)

- Type a project name and press `Enter` (`Esc` closes).
- The name must not be empty, contain spaces, `/` or `\`, or start with a dot,
  and `<projects folder>/<name>` must not exist yet.
- Creates `<projects folder>/<name>`, then opens it exactly like `choose-projects`:
  a space with `IDE` (active), `Terminal` and agent tabs.

### `switch-space` (`alt-s`)

- Lists every open space (the active one is marked `●`), with its tab count.
- Type to fuzzy-filter by space name, then `Enter` or click to switch.
  `Esc` closes.

### `umbe-settings` (`alt-,`)

- Edit the projects folder and the agent command, then press `Enter` to save
  them to the config file (`Esc` closes). `~` is allowed. A folder that doesn't exist yet is flagged but
  can still be saved.
- Herdr's command palette (`ctrl-shift-p`) only lists Herdr's own commands, so
  this popup can only be opened with its key binding.

### `copy-mode` (`alt-c`)

tmux `mode-keys vi` copy mode for the focused terminal. A small `-- COPY --` pill
appears at the top and takes the keyboard; the terminal's selection is the cursor
and starts at the program's cursor. Moving past the top or bottom scrolls the history.

| Keys | Action |
|---|---|
| `h` `j` `k` `l`, arrows | move |
| `w` / `b` / `e` | next word / start of word / end of word |
| `0` / `^` / `$` | start / start / end of line |
| `g` / `G` | top of history / bottom |
| `ctrl-u` `ctrl-b` / `ctrl-d` `ctrl-f`, PgUp / PgDn | page up / down |
| `ctrl-y` / `ctrl-e` | line up / down |
| `v` / `space`, `V` | start a selection, line selection (again: back to cursor) |
| `y` / `Enter` | copy the selection to the clipboard and leave |
| `q` / `Esc` / `ctrl-c` | leave without copying |

A count before a motion repeats it (`5j`, `3w`). Word motions follow vim's rules
(letters, digits and `_` make a word; other punctuation runs are words too). They
work on the terminal's text from `hc read`, so a word broken by a soft wrap is
still one word. Search isn't available.

### `zen-mode` (`alt-z`)

- Hides the layout's bars (sidebar, tab bar, status bar and the right panel) so
  only the terminals remain. Press `alt-z` again to bring them back.
- Only what zen mode hid is restored: a panel that was already closed stays
  closed. Each layout keeps its own zen state.
- Pane headers are part of the pane frame, not layout nodes, so they stay.

### `git-graph-toggle` (`alt-g`)

- Opens the right panel on Herdr's git graph. Press `alt-g` again to close it.
- If the panel is open on something else (files, changes), it switches to the
  graph instead of closing.
- Needs a layout with a `panel` node holding a `panel-body` stack with a
  `graph` child (Herdr's `main` and `catppuccin` layouts both have one).
  Otherwise it shows a warning toast.

### Tab navigation

- `shift-left` / `shift-right` — previous / next tab in the current space.

## Theme

`themes/catppuccin.json` is [Catppuccin Mocha](https://catppuccin.com/palette)
with a mauve accent, covering the terminal colors and every panel color the mods
use. `install.sh` puts it in `~/.config/herdr-app/themes/`; pick `catppuccin` in
Settings, or run:

```sh
herdr-app do app.theme '{"name":"catppuccin"}'
```

## Configuration

The mods read `$XDG_CONFIG_HOME/herdr-umbe/config.json`
(`~/.config/herdr-umbe/config.json` when `XDG_CONFIG_HOME` is unset):

```json
{
  "projects_dir": "~/develop",
  "agent_cmd": "claude"
}
```

- `projects_dir` — the folder whose subfolders `choose-projects` lists and where
  `new-project` creates projects. `~` is expanded. Defaults to `~/develop` when
  the file or the key is missing (an invalid file also falls back, with a warning).
- `agent_cmd` — the command run in the third tab that `choose-projects` and
  `new-project` open (e.g. `codex`, `aider --model sonnet`). A command with
  arguments runs through `sh -c`, so quoting and `VAR=value` prefixes work. The
  tab is named after the command. Defaults to `claude` when the key is
  missing or empty.
- Edit them by hand or with `alt-,`. Changes apply the next time a popup opens.

The helper that reads it lives in `mods/umbe-settings/config.js`. Each mod keeps
its own copy, because mods are installed one folder at a time. After editing it,
run `./sync-config.sh`.

## Install

```sh
./install.sh
```

It installs every mod in `mods/` into `~/.config/herdr-app/mods`, every theme in
`themes/` into `~/.config/herdr-app/themes`, and merges the
bindings from this repo's `keys.json` into `~/.config/herdr-app/keys.json`
(your other bindings are kept), then runs `herdr-app check` on each mod.
Run it again any time: mods that are already installed are replaced, and
bindings that are already there are left alone.

Options:

- `--copy` — copy the mods and themes instead of symlinking them (if Herdr does not
  follow symlinks on your setup).
- `--no-keys` — do not touch `keys.json`.
- `HERDR_CONFIG=/path ./install.sh` — install into another config folder.

The bindings it adds (under `global`):

```json
"alt-o": "mod.open:choose-projects",
"alt-n": "mod.open:new-project",
"alt-s": "mod.open:switch-space",
"alt-,": "mod.open:umbe-settings",
"alt-c": "mod.open:copy-mode",
"alt-z": "mod.open:zen-mode",
"alt-g": "mod.open:git-graph-toggle",
"shift-left": "tab.prev",
"shift-right": "tab.next"
```

Because `shift-left` / `shift-right` are global bindings, Herdr takes them before
the terminal does: programs in a tab (nvim, the shell) no longer receive
Shift+Arrow.

## Uninstall

```sh
./uninstall.sh
```

It removes every mod in `mods/` from `~/.config/herdr-app/mods` and every theme
in `themes/` from `~/.config/herdr-app/themes` (links or copies; the files in
this repo are not touched) and removes this repo's
bindings from `~/.config/herdr-app/keys.json`. A binding is only removed while
it still points at the same action, so a key you have rebound is left alone.
Safe to run again. `--no-keys` leaves `keys.json` alone, and `HERDR_CONFIG`
works as for `install.sh`.
