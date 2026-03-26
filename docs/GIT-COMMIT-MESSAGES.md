# Git commit messages on GitHub

The **Message** column on GitHub’s file browser shows the **last commit that touched each path**. Old commits stay in history until you **rewrite history** (e.g. `git filter-repo`, interactive rebase, or squashing into a new repo).

- **Normal push** does not change those messages for files you didn’t commit again.
- To replace Korean / legacy messages everywhere you’d need a **history rewrite** and a **force-push** — coordinate with anyone else using the repo.

Going forward, use **English** (or your team convention) in new commits, e.g. `feat: add OpenClaw brand assets and language order`.
