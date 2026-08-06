SHELL := /bin/bash
.PHONY: help release status

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

status: ## Git status + pending changesets
	@git status --short
	@echo "--- pending changesets ---"
	@ls .changeset/*.md 2>/dev/null | grep -v README || echo "(none)"

release: ## Version + publish + push tag (run on main, after PR merged)
	@status=$$(git status --porcelain); \
	if [ -n "$$status" ]; then \
		echo "Working tree dirty. Commit/stash first."; \
		exit 1; \
	fi; \
	branch=$$(git branch --show-current); \
	if [ "$$branch" != "main" ]; then \
		echo "Not on main (on $$branch). Switch to main first."; \
		exit 1; \
	fi; \
	pnpm changeset version && \
	pnpm install --lockfile-only && \
	git add . && \
	git commit -m "chore: release version $$(node -p "require('./package.json').version")" && \
	pnpm changeset publish && \
	git push --follow-tags origin main && \
	echo "Released v$$(node -p "require('./package.json').version")"
