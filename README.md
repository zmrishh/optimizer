<div align="center">

# Depopsy 🚀

### The npm doctor for dependency chaos.

**Understand *why* your dependencies are bloated — and fix them safely.**

[![npm version](https://img.shields.io/npm/v/depopsy?color=crimson&label=npm&logo=npm)](https://www.npmjs.com/package/depopsy)
[![npm downloads](https://img.shields.io/npm/dm/depopsy?color=blue&logo=npm)](https://www.npmjs.com/package/depopsy)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
![Supports npm · yarn · pnpm](https://img.shields.io/badge/supports-npm%20%C2%B7%20yarn%20%C2%B7%20pnpm-8A2BE2)

</div>

---

## The Problem

Modern JavaScript projects silently accumulate **multiple versions of the same package**. After a few months of adding dependencies, you might have `lodash@4.17.19` *and* `lodash@4.17.21` installed simultaneously — pulled in by different tools like `eslint`, `jest`, or `next`.

This leads to:

- 🐢 **Slower installs** — `npm install` / CI pipelines download and extract duplicate packages
- 📦 **Larger bundles** — your end users download the bloat too
- 🐛 **Subtle runtime bugs** — packages that check `instanceof` silently break when two versions exist

`npm dedupe` tells you *what* is duplicated. `depopsy` tells you ***why*** — and fixes it safely.

---

## Quick Start

Zero install required. Run it at the root of **any** npm, yarn, or pnpm project:

```bash
npx depopsy
```

For a quick 3-line summary:

```bash
npx depopsy --simple
```

---

## Example Output

```
Analyzing large dependency graph...
Detected Package Manager: npm

📦 Dependency Health Report
──────────────────────────────────────────────────

🚨 Problem:
   You have 19 duplicate dependencies
   → ~1.89 MB wasted on disk
   → Slower installs, larger bundles, subtle runtime bugs

🔥 Top Root Causes  (you can act on)
   These are the packages pulling in most duplicate dependencies.

  1. jest  → 19 duplicate packages

   ➔ These top root causes account for ~89% of your duplication.

🎯 Why this matters
  · Multiple versions of the same package increase bundle size
  · Slows npm install / pnpm install / CI pipelines
  · Can cause subtle runtime bugs when packages check instanceof

🧠 What you should do

  ▶ jest
  Confidence: LOW — manual review required
  Introduces: ansi-styles, chalk, ansi-regex, semver (+15 more)
  → Test tooling often bundles its own utility versions.
  → Upgrade jest to latest — may resolve 19 duplicate chains.

⚡ Quick Fix
   Run:  npx depopsy fix
   (applies 0 SAFE fixes automatically — no breaking changes)

📊 Summary
──────────────────────────────────────────────────
  ✔ SAFE issues:  0  (auto-fixable)
  ✖ RISKY issues: 19  (manual review)

──────────────────────────────────────────────────
💡 Tip: Even well-maintained projects have duplicates.
   This tool explains *why* — not just what.
```

---

## CLI Reference

| Command | Description |
|---|---|
| `npx depopsy` | Full dependency health report |
| `npx depopsy --simple` | Top 3 root causes only |
| `npx depopsy --verbose` | Full breakdown of every group |
| `npx depopsy --top <n>` | Limit root cause output to top N groups |
| `npx depopsy --json` | JSON output for CI/CD pipelines |
| `npx depopsy --ci` | Minimal JSON with correct exit codes |
| `npx depopsy fix` | Dry-run: preview safe deduplication fixes |
| `npx depopsy fix --yes` | Apply fixes directly to `package.json` |
| `npx depopsy trace <pkg>` | Trace which top-level dep introduces `<pkg>` |

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success — no duplicates found |
| `1` | Duplicates found |
| `2` | Fatal error (no lockfile, parse failure, etc.) |

---

## How It Works

```
1. Parses your lockfile  →  package-lock.json, yarn.lock, or pnpm-lock.yaml
2. Builds a dependency graph  →  maps every package to its introducers
3. Detects duplicates  →  packages installed at multiple versions
4. Identifies root causes  →  which top-level dep (eslint, jest, next) is responsible
5. Suggests safe fixes  →  only semver-compatible consolidations
```

### Root Cause Attribution

The attribution engine uses a 3-layer priority system to find the most actionable signal:

1. **`roots[]`** — Pre-computed top-level introducers via graph traversal (most accurate)
2. **`parents[]`** — Immediate dependents (closer signal than full ancestor chain)
3. **`ancestors[]`** — Full flattened chain (last resort, only when no better signal exists)

Low-level utility packages (`chalk`, `semver`, `minimatch`, `glob`, etc.) are automatically suppressed from root cause output — they are always *indirect* symptoms, never *causes*.

---

## Features

| Feature | Detail |
|---|---|
| ✅ Multi-lockfile | npm (`package-lock.json`), yarn (`yarn.lock`), pnpm (`pnpm-lock.yaml`) |
| ✅ Root cause analysis | Identifies *which* top-level dep pulls in each duplicate |
| ✅ Safe fixes only | Backs up `package.json` before writing; never touches RISKY diffs |
| ✅ CI/CD ready | `--json` and `--ci` flags with correct exit codes |
| ✅ Zero config | Works instantly in any project root — no setup required |
| ✅ Monorepo aware | Skips internal workspace packages (`link:`, `workspace:`, `file:`) |
| ✅ Disk waste measurement | Actual on-disk byte measurement of duplicate package directories |
| ✅ Package manager detection | Auto-detects npm / yarn / pnpm from lockfile presence |
| ✅ Yarn v1 + v2+ | Handles both classic and modern Yarn lockfile formats |
| ✅ pnpm v5–v9 | Handles all pnpm lockfile versions including v9 snapshots |

---

## The `fix` Command

`depopsy fix` only touches **SAFE** duplicates — packages where all versions share the same major version (semver-compatible).

```bash
# Preview what would change (no files modified)
npx depopsy fix

# Apply changes to package.json
npx depopsy fix --yes
```

After running `fix --yes`, you **must** reinstall to apply the overrides to your lockfile:

```bash
npm install    # or yarn install / pnpm install
```

### What it writes

| Package manager | What gets written |
|---|---|
| npm | `"overrides"` in `package.json` |
| yarn | `"resolutions"` in `package.json` |
| pnpm | `"pnpm.overrides"` in `package.json` |

A backup of your original `package.json` is saved to `.depopsy-backup/` before any write.

---

## The `trace` Command

Trace exactly which top-level dependencies are responsible for pulling in a given package:

```bash
npx depopsy trace semver
```

```
Tracing "semver" through dependency graph...

🔍 Trace: semver
──────────────────────────────────────────────────

  Versions found: 5.7.2, 7.5.4, 7.6.0
  Safety: RISKY

  semver is introduced by:
    ▶ jest
    ▶ eslint
    ▶ @babel/core

  Per-version breakdown:
    5.7.2 — required by: node-semver, validate-npm-package-version
    7.5.4 — required by: jest-runner, jest-resolve
    7.6.0 — required by: eslint, @babel/core

──────────────────────────────────────────────────
  ⚠  No auto-fix available — versions span multiple majors.
```

---

## CI/CD Integration

### GitHub Actions

```yaml
- name: Check for duplicate dependencies
  run: npx depopsy --ci
  # Exits 1 if duplicates found, 0 if clean
```

### JSON output for custom scripting

```bash
npx depopsy --json > dep-report.json
```

```json
{
  "summary": {
    "total": 19,
    "safe": 4,
    "risky": 15,
    "wasteKB": "1934.22"
  },
  "rootCauses": [...],
  "duplicates": [...],
  "suggestions": [...]
}
```

---

## FAQ

**Q: How is this different from `npm dedupe`?**

`npm dedupe` reorganizes `node_modules` at install time but doesn't prevent the problem from recurring. `depopsy` analyzes your *lockfile* to explain the root cause and writes `overrides`/`resolutions` to your `package.json` — so the deduplication survives a fresh `npm install`.

**Q: Is it safe to run on production projects?**

Yes. The `analyze` and `trace` commands are fully **read-only**. The `fix` command defaults to a dry-run — you must explicitly pass `--yes` to make changes, and it always creates a backup first.

**Q: Does it work with workspaces / monorepos?**

Yes. It automatically detects workspace packages and excludes them from root cause attribution (they use `link:`, `workspace:`, or `file:` version strings in lockfiles).

**Q: Why does it show "RISKY" for some duplicates?**

RISKY means the duplicate versions span **multiple major versions** (e.g., `react@17` and `react@18`). These cannot be safely auto-aligned because major version bumps can include breaking changes. Use `depopsy trace <pkg>` to understand which dependency is causing it.

**Q: Why don't I see `semver` or `chalk` as root causes?**

These are *leaf* utility packages — they are always pulled in transitively, never directly causing bloat. `depopsy` suppresses them from root cause output to keep results actionable. Use `--verbose` or `trace` to inspect them.

---

## Requirements

- **Node.js** `>= 18.0.0`
- A project with at least one lockfile: `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`

---

## Contributing

```bash
git clone https://github.com/depopsy/depopsy
cd depopsy
npm install
npm test
```

Please open an issue before submitting a pull request for significant changes.

---

## License

[MIT](./LICENSE) © 2026 depopsy contributors

---

<div align="center">
Built with ❤️ for the open-source JavaScript ecosystem.
</div>
