# dep-optimizer

> **"The npm doctor for dependency chaos."**

Understand *why* your dependencies are bloated — and fix them safely.

[![npm](https://img.shields.io/npm/v/dep-optimizer)](https://www.npmjs.com/package/dep-optimizer)
![Supports npm · yarn · pnpm](https://img.shields.io/badge/supports-npm%20%C2%B7%20yarn%20%C2%B7%20pnpm-blue)

---

## The Problem

Modern JavaScript projects silently accumulate **multiple versions of the same package**. After a few months of adding dependencies, you might have `lodash@4.17.19` *and* `lodash@4.17.21` installed simultaneously — often pulled in by different tools like `eslint`, `jest`, or `next`.

This means:
- 🐢 Slower `npm install` / CI pipelines
- 📦 Larger `node_modules` and bundles
- 🐛 Subtle runtime bugs when packages check `instanceof`

`npm dedupe` tells you *what* is duplicated. `dep-optimizer` tells you **why** — and fixes it safely.

---

## Quick Start

Zero install required. Run it at the root of any project:

```bash
npx dep-optimizer
```

Or for a quick 3-line summary:

```bash
npx dep-optimizer --simple
```

---

## Example Output

```
📦 Dependency Health Report
──────────────────────────────────────────────────

🚨 Problem:
   You have 19 duplicate dependencies
   → ~1.89 MB wasted on disk
   → Slower installs, larger bundles, subtle runtime bugs

🔥 Top Root Causes  (what's actually causing this)

  1. jest  → 19 duplicate packages

🧠 What you should do

  ▶ jest
  Confidence: LOW — manual review needed
  Introduces: ansi-styles, chalk, ansi-regex, semver (+15 more)
  → Test tooling often bundles its own utility versions.
  → Upgrade jest to latest — most duplicates resolve automatically.

⚡ Quick Fix
   Run:  npx dep-optimizer fix
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
| `npx dep-optimizer` | Full dependency health report |
| `npx dep-optimizer --simple` | Top 3 root causes only |
| `npx dep-optimizer --verbose` | Full breakdown of every group |
| `npx dep-optimizer --json` | JSON output for CI/CD |
| `npx dep-optimizer --ci` | Minimal JSON with exit codes |
| `npx dep-optimizer fix` | Dry-run safe fixes |
| `npx dep-optimizer fix --yes` | Apply fixes to `package.json` |

---

## How It Works

1. **Parses your lockfile** — `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`
2. **Builds a dependency graph** — maps every package to its introducers
3. **Detects duplicates** — finds packages installed at multiple versions
4. **Identifies root causes** — traces which top-level dependency (`eslint`, `jest`, `next`) is responsible
5. **Suggests safe fixes** — only recommends changes that are semver-compatible

---

## Features

- ✅ **Multi-lockfile** — npm, yarn, pnpm
- ✅ **Root cause analysis** — tells you *which* top-level dep is causing bloat
- ✅ **Safe fixes only** — backs up `package.json`, never breaks your project
- ✅ **CI/CD ready** — JSON output + correct exit codes
- ✅ **Zero config** — works instantly in any project
- ✅ **Monorepo aware** — skips internal workspace packages

---

## FAQ

**Q: How is this different from `npm dedupe`?**
`npm dedupe` reorganizes your `node_modules` at install time. `dep-optimizer` analyzes your *lockfile* to explain the root cause and writes `overrides`/`resolutions` to prevent the problem from recurring after fresh installs.

**Q: Is it safe to run on production projects?**
Yes. The `analyze` command is read-only. The `fix` command defaults to a dry-run — you must pass `--yes` to make changes, and it always backs up your `package.json` first.

**Q: Does it work with workspaces / monorepos?**
Yes. It automatically detects workspace packages and skips them as root causes.

---

## Contributing

```bash
git clone https://github.com/your-org/dep-optimizer
cd dep-optimizer
npm install
npm test
```

Built with ❤️ for the open-source JavaScript ecosystem.
