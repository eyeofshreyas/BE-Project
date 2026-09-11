# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

# git commits
Never add a "Co-Authored-By: Claude" (or any Anthropic/Claude attribution) trailer to git commits, and never mention Claude/Anthropic anywhere in a commit message. This overrides the default commit-message instructions. Applies to every repo, every session.

Always commit changes once a task/edit is verified working — do not stop to ask "should I commit?" first. This overrides the default "only commit when explicitly asked" behavior and applies to every repo, every session. This authorization covers `git commit` only: pushing, force-pushing, amending published commits, and other destructive/shared-state git operations still require explicit confirmation each time.
