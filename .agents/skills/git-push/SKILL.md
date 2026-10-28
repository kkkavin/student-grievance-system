---
name: git-push
description: >-
  Automates checking repository status, validating builds and tests, staging changes,
  generating meaningful commit messages, and pushing commits to the remote GitHub/git repository.
  Use when the user asks to push changes to GitHub or git, run a git push workflow, or commit and push work.
---

# Git Push Skill

This skill provides a reliable, end-to-end procedure to validate, stage, commit, and push changes to the remote git repository.

---

## Workflow Steps

### 1. Pre-Push Verification & Health Checks
Before staging and committing, verify that the project is in a clean, functional state:
1. **Lint & Type Check**:
   ```powershell
   npm run lint
   ```
2. **Build Verification**:
   ```powershell
   npm run build
   ```
3. **Knowledge Graph Sync** (if `graphify` is present):
   ```powershell
   npm run graphify:update
   # or: graphify update .
   ```

> [!IMPORTANT]
> If any lint or build step fails, stop and fix the issues before proceeding to commit.

---

### 2. Inspect Working Tree & Untracked Files
Check current git status to identify modified, deleted, and untracked files:
```powershell
git status -u
```
- Ensure sensitive files (e.g. `.env`, credentials, sqlite databases, cache directories) are properly ignored in `.gitignore`.
- Verify only intentional project changes and relevant new files are being added.

---

### 3. Stage Changes
Stage the required files:
```powershell
git add -A
```

> [!NOTE]
> If running in a restricted sandbox environment on Windows and `git add` fails with a `.git/index.lock` permission error, execute the command with `BypassSandbox: true`.

---

### 4. Commit Changes
Craft a clear, conventional commit message reflecting the actual modifications:
```powershell
git commit -m "<type>: <concise description of changes>" -m "<detailed bullet points if necessary>"
```
*Common types*: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`, `perf`, `test`.

---

### 5. Push to Remote Repository
Determine the current branch and push to the configured upstream remote:
```powershell
# Get active branch name
git branch --show-current

# Push changes to remote (e.g. origin main)
git push origin <branch-name>
```

> [!NOTE]
> Pushing to remote repositories requires network access. If executed in a sandboxed terminal environment that blocks outbound network connections (`Could not resolve host`), re-run the `git push` command with `BypassSandbox: true`.

---

### 6. Verification & Reporting
Confirm the push was successful:
1. Check `git status` to ensure working tree is clean.
2. Confirm the remote tracking branch is up to date (`Your branch is up to date with 'origin/<branch>'`).
3. Report the commit hash, branch, and brief summary of pushed changes to the user.

---

## Fast-Track Helper Script

Alternatively, you can run the automated helper script that bundles verification, staging, committing, and pushing:
- PowerShell script: [push.ps1](./scripts/push.ps1)
  ```powershell
  powershell -ExecutionPolicy Bypass -File .agents/skills/git-push/scripts/push.ps1 -Message "feat: your commit message"
  ```

