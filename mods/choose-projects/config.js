// herdr-umbe configuration: $XDG_CONFIG_HOME/herdr-umbe/config.json
// (~/.config/herdr-umbe/config.json when XDG_CONFIG_HOME is unset).
//
// Each mod folder is installed on its own (possibly copied), so every mod that
// needs this keeps an identical copy. Edit mods/umbe-settings/config.js and
// run ./sync-config.sh to update the others.

import { home, exec, readTextFile } from "herdr";

export const DEFAULT_PROJECTS_DIR_RAW = "~/develop";

function homeDir() {
  return home().replace(/\\/g, "/").replace(/\/+$/, "");
}

// "~" / "~/x" -> absolute path; trailing slashes dropped.
export function expandHome(path) {
  let p = String(path).trim().replace(/\\/g, "/");
  if (p === "~") p = homeDir();
  else if (p.startsWith("~/")) p = `${homeDir()}/${p.slice(2)}`;
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

// Absolute path under home -> "~/..." for display.
export function tildify(path) {
  const h = homeDir();
  if (path === h) return "~";
  if (path.startsWith(`${h}/`)) return `~/${path.slice(h.length + 1)}`;
  return path;
}

export const DEFAULT_PROJECTS_DIR = expandHome(DEFAULT_PROJECTS_DIR_RAW);

// Mods cannot read the environment directly; exec runs with the user's real one.
async function configHome() {
  try {
    const result = await exec("printenv", ["XDG_CONFIG_HOME"], { timeout: 5000 });
    const value = result.code === 0 ? result.stdout.trim() : "";
    if (value) return expandHome(value);
  } catch (_error) {
    // fall through to the default
  }
  return `${homeDir()}/.config`;
}

export async function configPath() {
  return `${await configHome()}/herdr-umbe/config.json`;
}

// Never throws. `raw` is the parsed JSON object (or {}), `projectsDirRaw` the
// value as written (e.g. "~/develop"), `projectsDir` the expanded path.
export async function loadConfig() {
  const path = await configPath();
  const fallback = (warning) => ({
    path,
    raw: {},
    projectsDirRaw: DEFAULT_PROJECTS_DIR_RAW,
    projectsDir: DEFAULT_PROJECTS_DIR,
    warning,
  });

  let text;
  try {
    text = await readTextFile(path);
  } catch (_error) {
    // readTextFile may refuse paths outside the mod's read roots (an unusual
    // XDG_CONFIG_HOME); the shell has no such limit.
    try {
      const result = await exec("sh", ["-c", '[ -e "$1" ] || exit 3; cat -- "$1"', "sh", path], { timeout: 5000 });
      if (result.code === 3) text = null;
      else if (result.code === 0) text = result.stdout;
      else return fallback(`Could not read ${tildify(path)}: ${result.stderr.trim()}`);
    } catch (error) {
      return fallback(`Could not read ${tildify(path)}: ${error?.message ?? error}`);
    }
  }
  if (text === null) return fallback("");

  let raw;
  try {
    raw = JSON.parse(text);
  } catch (_error) {
    return fallback(`${tildify(path)} is not valid JSON, using ${DEFAULT_PROJECTS_DIR_RAW}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fallback(`${tildify(path)} must contain a JSON object, using ${DEFAULT_PROJECTS_DIR_RAW}`);
  }

  const value = raw.projects_dir;
  if (typeof value === "string" && value.trim()) {
    return { path, raw, projectsDirRaw: value.trim(), projectsDir: expandHome(value), warning: "" };
  }
  return { ...fallback(""), raw };
}

// Writes the whole object as pretty JSON, creating the folder if needed.
// A mod's own fs may only write under ~/.config/herdr-app, so use the shell.
export async function saveConfig(raw) {
  const path = await configPath();
  const json = `${JSON.stringify(raw, null, 2)}\n`;
  const script = 'mkdir -p -- "$(dirname -- "$1")" && printf "%s" "$2" > "$1"';
  const result = await exec("sh", ["-c", script, "sh", path, json], { timeout: 10000 });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `sh exited with ${result.code}`);
  }
  return path;
}

// The mod's fs only reads inside granted roots, but the projects folder can be
// anywhere, so these go through the shell.

// Visible subfolders of `dir`, sorted. Throws with the shell's message.
export async function listDirs(dir) {
  const script = 'cd -- "$1" && for d in */; do [ -d "$d" ] && printf "%s\\n" "${d%/}"; done; exit 0';
  const result = await exec("sh", ["-c", script, "sh", dir], { timeout: 10000 });
  if (result.code !== 0) throw new Error(result.stderr.trim().replace(/^sh: \d+: /, "") || `sh exited with ${result.code}`);
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function pathExists(path) {
  const result = await exec("test", ["-e", path], { timeout: 5000 });
  return result.code === 0;
}
