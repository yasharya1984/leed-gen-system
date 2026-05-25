.PHONY: build build-backend build-frontend build-postgres build-seq \
        pull-base \
        tag images push \
        up down restart \
        logs logs-backend logs-frontend logs-postgres \
        ps shell-backend shell-db \
        clean \
        go-build run-% test test-integration lint \
        seed-proxies backup-db \
        help

COMPOSE := docker compose --project-directory . -f deploy/docker-compose.yml

# ── Image tag ─────────────────────────────────────────────────────────────────
# Defaults to 'latest'. Override per-invocation:
#   make build TAG=v1.2.3
#   make build TAG=$(shell git rev-parse --short HEAD)
TAG ?= latest
# Export so docker compose can interpolate ${TAG} in deploy/docker-compose.yml.
export TAG

# All three image base names — used by the `tag` and `push` targets.
IMAGES := lgs-postgres lgs-backend lgs-frontend

# ── Docker: build images ──────────────────────────────────────────────────────

## build: Build all images in parallel with the current TAG (default: latest).
##        Example: make build TAG=v1.2.3
build:
	@echo "→ Building all service images (TAG=$(TAG))…"
	$(COMPOSE) build --parallel

## build-seq: Build images sequentially — use when parallel pulls time out.
build-seq:
	@echo "→ Building images sequentially (TAG=$(TAG))…"
	$(COMPOSE) build postgres
	$(COMPOSE) build backend
	$(COMPOSE) build frontend

## build-backend: Build only the backend image.
build-backend:
	$(COMPOSE) build backend

## build-frontend: Build only the frontend image.
build-frontend:
	$(COMPOSE) build frontend

## build-postgres: Build only the postgres image.
build-postgres:
	$(COMPOSE) build postgres

## pull-base: Pull all base images into the local cache.
##            Run this before 'make build' if Docker Hub is timing out.
##            Once images are cached locally the build won't need the network.
pull-base:
	@echo "→ Pulling base images…"
	docker pull golang:1.25-alpine
	docker pull alpine:3.19
	docker pull node:20-alpine
	docker pull postgres:15-alpine
	@echo "→ Base images cached. Re-run 'make build' now."

# ── Docker: tag & push ────────────────────────────────────────────────────────

## images: List all built LGS images.
images:
	@echo ""
	@docker images --filter "reference=lgs-*" \
	  --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}"
	@echo ""

## tag: Re-tag lgs-*:latest images with TAG.
##      Example: make tag TAG=v1.2.3
tag:
	@if [ "$(TAG)" = "latest" ]; then \
	  echo "Error: set a version — e.g. make tag TAG=v1.2.3"; exit 1; \
	fi
	@for img in $(IMAGES); do \
	  echo "  $$img:latest → $$img:$(TAG)"; \
	  docker tag $$img:latest $$img:$(TAG); \
	done
	@echo "✓ Tagged lgs-*:latest → lgs-*:$(TAG)"

## push: Push lgs-* images to REGISTRY with TAG.
##       Example: make push TAG=v1.2.3 REGISTRY=ghcr.io/myorg
REGISTRY ?=
push:
	@test -n "$(REGISTRY)" || (echo "Error: set REGISTRY — e.g. make push REGISTRY=ghcr.io/myorg TAG=v1.2.3"; exit 1)
	@for img in $(IMAGES); do \
	  echo "  Pushing $(REGISTRY)/$$img:$(TAG)"; \
	  docker tag  $$img:$(TAG) $(REGISTRY)/$$img:$(TAG); \
	  docker push $(REGISTRY)/$$img:$(TAG); \
	done

# ── Docker: stack lifecycle ───────────────────────────────────────────────────

## up: Start the full LGS stack in detached mode.
up:
	@echo "→ Starting LGS stack (TAG=$(TAG))…"
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
