.PHONY: build run test lint docker-up docker-down

SERVICES := api-gateway proxy-manager antidetect-service search-worker scrape-worker validation-worker

build:
	@for svc in $(SERVICES); do \
		echo "Building $$svc..."; \
		go build -o bin/$$svc ./services/$$svc; \
	done

run-%:
	go run ./services/$*

test:
	go test ./tests/unit/...

test-integration:
	go test ./tests/integration/...

lint:
	golangci-lint run ./...

docker-up:
	docker compose -f deploy/docker-compose.yml up -d

docker-down:
	docker compose -f deploy/docker-compose.yml down

seed-proxies:
	./scripts/seed_proxies.sh

backup-db:
	./scripts/backup_db.sh
