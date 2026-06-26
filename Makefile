.PHONY: fmt fmt-check lint typecheck check security ci install clean lockfile

lockfile:
	npm i --package-lock-only --silent 2>/dev/null

fmt:
	npm run fmt

fmt-check:
	npm run fmt:check

lint:
	npm run lint

typecheck:
	npm run typecheck

check: fmt-check lint typecheck
	@echo "✅ All checks passed"

security: lockfile
	npm run security

ci: check security
	@echo "✅ CI pipeline passed"

install:
	npm install

clean:
	rm -rf node_modules dist
