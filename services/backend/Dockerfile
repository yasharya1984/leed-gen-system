# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — builder
#
# Build context MUST be the repository root (`.`) because go.mod lives there
# and the source spans both `pkg/` and `services/backend/`. Set in Compose as:
#   build:
#     context: .
#     dockerfile: services/backend/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Download modules first so this layer is cached across source-only rebuilds.
COPY go.mod go.sum ./
RUN go mod download

# Copy only the packages needed to build the backend binary.
# Rebuilding this image after changes outside pkg/ or services/backend/ will
# still hit the module-download cache above.
COPY pkg/            ./pkg/
COPY services/backend/ ./services/backend/

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
      -trimpath \
      -ldflags="-s -w" \
      -o /out/backend \
      ./services/backend

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — runner (~10 MB image)
#
# Alpine provides just enough for TLS root certificates and timezone data.
# The statically linked Go binary needs nothing else at runtime.
# ─────────────────────────────────────────────────────────────────────────────
FROM alpine:3.19 AS runner

RUN apk --no-cache add ca-certificates tzdata

# Run as a non-root user.
RUN addgroup -S lgs && adduser -S lgs -G lgs
USER lgs

WORKDIR /app
COPY --from=builder /out/backend ./backend

EXPOSE 8080

CMD ["./backend"]
