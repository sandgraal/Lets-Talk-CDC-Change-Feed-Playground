# =============================================================================
# The Failure-Aware CDC Reference Pipeline
# =============================================================================

.PHONY: up down logs status watch trigger-restart trigger-lag trigger-schema trigger-duplicate trigger-backfill clean reset help

# Default target
help:
	@echo "The Failure-Aware CDC Reference Pipeline"
	@echo "========================================="
	@echo ""
	@echo "Lifecycle commands:"
	@echo "  make up              Start the full pipeline"
	@echo "  make down            Stop all containers"
	@echo "  make reset           Stop, clean, and restart"
	@echo "  make clean           Remove all volumes and images"
	@echo ""
	@echo "Monitoring commands:"
	@echo "  make status          View verifier comparison report"
	@echo "  make logs            Follow all container logs"
	@echo "  make watch           Watch key metrics in real-time"
	@echo "  make connector-status View Debezium connector status"
	@echo "  make lag             View consumer group lag"
	@echo ""
	@echo "Manual failure triggers:"
	@echo "  make trigger-restart     Kill and restart Debezium connector"
	@echo "  make trigger-lag         Pause sink consumer for 30s"
	@echo "  make trigger-schema      Add column to customers table"
	@echo "  make trigger-duplicate   Force connector re-snapshot"
	@echo "  make trigger-backfill    Insert historical records"
	@echo ""
	@echo "Debug commands:"
	@echo "  make source-shell    Open psql in source database"
	@echo "  make sink-shell      Open psql in sink database"
	@echo "  make kafka-topics    List Kafka topics"
	@echo "  make kafka-consume   Consume from customers topic"

# =============================================================================
# LIFECYCLE
# =============================================================================

up:
	@echo "Starting The Failure-Aware CDC Reference Pipeline..."
	@docker compose up -d --build
	@echo ""
	@echo "Pipeline starting. Services:"
	@echo "  - Source DB:    localhost:5432"
	@echo "  - Sink DB:      localhost:5433"  
	@echo "  - Kafka:        localhost:9092"
	@echo "  - Connect:      localhost:8083"
	@echo "  - Verifier:     localhost:8089"
	@echo ""
	@echo "Run 'make watch' to monitor the pipeline"
	@echo "Run 'make status' to view verification report"

down:
	@echo "Stopping pipeline..."
	@docker compose down

reset: down clean up

clean:
	@echo "Removing all volumes and orphan containers..."
	@docker compose down -v --remove-orphans
	@docker volume prune -f

# =============================================================================
# MONITORING
# =============================================================================

status:
	@echo "Verification Report"
	@echo "==================="
	@curl -s http://localhost:8089/report 2>/dev/null || echo "Verifier not ready. Run 'make up' first."

logs:
	@docker compose logs -f --tail=100

watch:
	@echo "Press Ctrl+C to exit"
	@watch -n 2 'echo "=== Verifier ===" && curl -s http://localhost:8089/report 2>/dev/null | head -20 && echo "" && echo "=== Consumer Lag ===" && docker exec cdc-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group cdc-sink-consumer 2>/dev/null | head -10'

connector-status:
	@echo "Debezium Connector Status"
	@echo "========================="
	@curl -s http://localhost:8083/connectors/cdc-source-connector/status | jq . 2>/dev/null || echo "Connect not ready"

lag:
	@echo "Consumer Group Lag"
	@echo "=================="
	@docker exec cdc-kafka kafka-consumer-groups \
		--bootstrap-server localhost:9092 \
		--describe \
		--group cdc-sink-consumer 2>/dev/null || echo "Kafka not ready"

# =============================================================================
# MANUAL FAILURE TRIGGERS
# =============================================================================

trigger-restart:
	@echo "Triggering connector restart..."
	@./failures/restart.sh

trigger-lag:
	@echo "Triggering consumer lag (30s pause)..."
	@./failures/lag.sh

trigger-schema:
	@echo "Triggering schema evolution..."
	@docker exec cdc-source psql -U postgres -d source -f /failures/schema-evolution.sql 2>/dev/null || \
		cat ./failures/schema-evolution.sql | docker exec -i cdc-source psql -U postgres -d source

trigger-duplicate:
	@echo "Triggering duplicate events (re-snapshot)..."
	@./failures/duplicate.sh

trigger-backfill:
	@echo "Triggering backfill..."
	@docker exec cdc-source psql -U postgres -d source -f /failures/backfill.sql 2>/dev/null || \
		cat ./failures/backfill.sql | docker exec -i cdc-source psql -U postgres -d source

# =============================================================================
# DEBUG
# =============================================================================

source-shell:
	@docker exec -it cdc-source psql -U postgres -d source

sink-shell:
	@docker exec -it cdc-sink psql -U postgres -d sink

kafka-topics:
	@docker exec cdc-kafka kafka-topics --bootstrap-server localhost:9092 --list

kafka-consume:
	@echo "Consuming from cdc-source.public.customers (Ctrl+C to exit)..."
	@docker exec cdc-kafka kafka-console-consumer \
		--bootstrap-server localhost:9092 \
		--topic cdc-source.public.customers \
		--from-beginning \
		--max-messages 10
