.PHONY: build build-backend build-frontend build-postgres \
        up down restart \
        logs logs-backend logs-frontend logs-postgres \
        ps shell-backend shell-db \
        clean \
        go-build run-% test test-integration lint \
        seed-proxies backup-db \
        help

COMPOSE := docker compose --project-directory . -f deploy/docker-compose.yml
PROJECT := lgs

# ── Docker: images ────────────────────────────────────────────────────────────

## build: Build all Docker images in parallel.
build:
	@echo "→ Building all service images…"
	$(COMPOSE) build --parallel

## build-backend: Build only the backend image.
build-backend:
	$(COMPOSE) build backend

## build-frontend: Build only the frontend image.
build-frontend:
	$(COMPOSE) build frontend

## build-postgres: Build only the postgres image.
build-postgres:
	$(COMPOSE) build postgres

# ── Docker: stack lifecycle ───────────────────────────────────────────────────

## up: Start the full LGS stack in detached mode.
up:
	@echo "→ Starting LGS stack…"
	$(COMPOSE) up -d --remove-orphans
	@echo ""
	@echo "  Frontend  → http://localhost:$${FRONTEND_PORT:-3000}"
	@echo "  Backend   → http://localhost:$${BACKEND_PORT:-8080}"
	@echo "  Postgres  → localhost:$${DB_EXPOSE_PORT:-5432}"
	@echo ""

## down: Stop and remove containers (volumes are preserved).
down:
	@echo "→ Stopping LGS stack…"
	$(COMPOSE) down

## restart: Restart all containers.
restart:
	$(COMPOSE) restart

# ── Docker: observability ─────────────────────────────────────────────────────

## logs: Tail logs for all services.
logs:
	$(COMPOSE) logs -f

## logs-backend: Tail backend logs only.
logs-backend:
	$(COMPOSE) logs -f backend

## logs-frontend: Tail frontend logs only.
logs-frontend:
	$(COMPOSE) logs -f frontend

## logs-postgres: Tail postgres logs only.
logs-postgres:
	$(COMPOSE) logs -f postgres

## ps: Show running container status.
ps:
	$(COMPOSE) ps

# ── Docker: debugging shells ──────────────────────────────────────────────────

## shell-backend: Open a shell inside the running backend container.
shell-backend:
	$(COMPOSE) exec backend sh

## shell-db: Open a psql session inside the running postgres container.
shell-db:
	$(COMPOSE) exec postgres psql \
	  -U $${DB_USER:-lgs_user} \
	  -d $${DB_NAME:-lgs_core}

# ── Docker: cleanup ───────────────────────────────────────────────────────────

## clean: Stop containers, remove volumes, and prune unused Docker objects.
##        WARNING: destroys the postgres data volume — all DB data is lost.
clean:
	@echo "→ Stopping containers and removing volumes…"
	$(COMPOSE) down --volumes --remove-orphans
	@echo "→ Pruning unused Docker images, networks, and build cache…"
	docker system prune -f
	@echo "→ Done."

# ── Go: local development (no Docker) ────────────────────────────────────────

## go-build: Compile all Go services to ./bin/.
go-build:
	@for svc in backend proxy-manager antidetect-service search-worker validation-worker; do \
	  echo "Building $$svc…"; \
	  go build -o bin/$$svc ./services/$$svc; \
	done

## run-%: Run a single Go service locally without Docker (e.g. make run-backend).
run-%:
	go run ./services/$*

## test: Run the unit test suite.
test:
	go test ./...

## test-integration: Run the integration test suite.
test-integration:
	go test ./tests/integration/...

## lint: Run golangci-lint across all Go packages.
lint:
	golangci-lint run ./...

# ── Operational scripts ───────────────────────────────────────────────────────

## seed-proxies: Seed the proxy pool via the helper script.
seed-proxies:
	./scripts/seed_proxies.sh

## backup-db: Dump the postgres database to a local file.
backup-db:
	./scripts/backup_db.sh

# ── Help ──────────────────────────────────────────────────────────────────────

## help: List all available make targets with descriptions.
help:
	@grep -E '^##' $(MAKEFILE_LIST) | sed 's/## /  /'
