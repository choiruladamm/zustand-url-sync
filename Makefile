SHELL := /bin/bash
.PHONY: help status version publish tag release

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

status: ## Git status + pending changesets
	@git status --short
	@echo "--- pending changesets ---"
	@ls .changeset/*.md 2>/dev/null | grep -v README || echo "(none)"

version: ## Bump version via changeset (no publish, no push)
	@status=$$(git status --porcelain); \
	if [ -n "$$status" ]; then \
		echo "Working tree dirty. Commit/stash first."; \
		exit 1; \
	fi; \
	pnpm changeset version && \
	pnpm install --lockfile-only && \
	git add . && \
	git commit -m "chore: release version $$(node -p "require('./package.json').version")"

publish: ## Publish to npm (assumes version commit already made)
	@status=$$(git status --porcelain); \
	if [ -n "$$status" ]; then \
		echo "Working tree dirty. Commit/stash first."; \
		exit 1; \
	fi; \
	pnpm changeset publish

tag: ## Push main + tags, verify tag points to HEAD
	@branch=$$(git branch --show-current); \
	if [ "$$branch" != "main" ]; then \
		echo "Not on main (on $$branch). Switch to main first."; \
		exit 1; \
	fi; \
	git push --follow-tags origin main && \
	git fetch --tags origin && \
	ver=$$(node -p "require('./package.json').version") && \
	local_tag=$$(git rev-parse v$$ver) && \
	remote_tag=$$(git rev-parse origin/v$$ver) && \
	if [ "$$local_tag" != "$$remote_tag" ]; then \
		echo "Tag mismatch: local=$$local_tag remote=$$remote_tag"; \
		exit 1; \
	fi; \
	gh release create v$$ver \
		--repo $$(git remote get-url origin | sed -E 's#.*github.com[:/]([^/]+/[^.]+)(\.git)?#\1#') \
		--title "v$$ver" \
		--notes "See CHANGELOG.md for release notes." && \
	echo "Tag v$$ver + release synced ($$local_tag)"

release: version publish tag ## Full release: version + publish + push tag
