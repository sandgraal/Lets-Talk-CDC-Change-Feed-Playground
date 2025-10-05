SCENARIO ?= crud-basic

scenario:
	@node ./scripts/prepare-scenario.mjs $(SCENARIO)

snapshots:
	@node ./scripts/snapshot-scenarios.mjs

up: scenario
	@docker compose -f docker-compose.yml up --build -d
	@echo "Harness stack starting. Use 'make status' to view verifier report once ready."

replay:
	@docker compose -f docker-compose.yml run --rm generator

status:
	@curl --silent http://localhost:8089/report || echo "verifier not ready"

logs:
	@docker compose -f docker-compose.yml logs --tail=100 -f

down:
	@docker compose -f docker-compose.yml down

.PHONY: scenario snapshots up replay status logs down
