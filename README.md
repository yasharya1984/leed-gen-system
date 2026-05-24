# Lead Generation System (LGS) - Microservices Architecture

This repository contains the backend and frontend components of the Lead Generation System (LGS), a high-performance, stateless data ingestion pipeline designed to scrape, validate, and enrich lead information via distributed microservices.

## Architectural Overview

The system is built around a **decoupled, event-driven architecture** where services communicate asynchronously via a centralized Redis data pipeline (the "Spine"). Performance-critical scraping logic is built using **Rust** to optimize text extraction loops and maintain zero-cost abstractions, while orchestration, APIs, and network utilities are built using **Go**.

+--------------------+
                       |    React Frontend  |
                       +---------+----------+
                                 |
                                 v (JWT Authenticated)
                       +---------+----------+
                       |     api-gateway    | (Go)
                       +----+-----------+---+
                            |           |
             (Writes Data)  v           v (Pushes Tasks via LPUSH)
                    +-------+---+   +---+-------+
                    | PostgreSQL|   |   Redis   | (The "Spine")
                    +-----------+   +---+-------+
                                        |
     +-------------------+--------------+--------------+-------------------+
     | (BRPOP)           | (BRPOP)                     | (BRPOP)           | (BRPOP)
     v                   v                             v                   v
+--------+--------+ +--------+--------+           +--------+--------+ +--------+--------+
|  scrape-worker  | |  search-worker  |           |antidetect-serv. | |validation-work.|
|    (RUST)       | |     (Go)        |           |     (Go)        | |     (Go)        |
+--------+--------+ +-----------------+           +--------+--------+ +--------+--------+
|                                                 |
+-------------------< Proxy Router Engine <-------+-------------------+
|
+---------+----------+
|   proxy-manager    | (Go)
+--------------------+


---

## Service Directory Reference

### 1. `api-gateway` (Go)
*   **Role:** Core Application Engine & REST API Coordinator.
*   **Responsibilities:**
    *   Exposes secure REST API endpoints for campaign configurations, operations tracking, and metric aggregation (`POST /api/campaigns`, `GET /api/campaigns/{id}`).
    *   Enforces system security parameters by processing cryptographic JSON Web Token (JWT) authorization headers with standard 30-day self-invalidation rules.
    *   Manages transactional state changes in the primary PostgreSQL instance.
    *   Serializes user campaign parameters into discrete target execution payloads and distributes them into active Redis lists via `LPUSH` operations.
    *   Tracks system-wide telemetry and exposes a persistent ledger mechanism for administrative auditing logs.

### 2. `scrape-worker` (Rust)
*   **Role:** High-Performance Static Text Extraction Worker.
*   **Responsibilities:**
    *   Acts as a dedicated subscriber consumer listening for incoming targets via non-blocking `BRPOP` operations against the Redis backbone.
    *   Utilizes asynchronous network processing (`reqwest`) and memory-optimized HTML node tree mapping (`scraper`) to download and parse target web configurations.
    *   Executes localized regular expression (Regex) processing to capture clean email sequences (RFC 5322 compliance) and international communication keys (E.164 phone standard layout) directly out of unmanaged document streams.
    *   **Boundary Constraints:** Adheres to a strict hardware envelope of **$\le$ 512MB RAM worker memory usage** per runtime node container.

### 3. `search-worker` (Go)
*   **Role:** Automated Query Execution & Ingestion Interface.
*   **Responsibilities:**
    *   Iterates across external search provider index layers (Bing and Google SERPs) utilizing dynamically permuted search matrices and advanced operators (`site:`, `intext:`).
    *   Extracts organic resulting hyperlink records out of underlying page matrices.
    *   Runs URL pattern analysis algorithms to partition discoveries into distinct system pipelines: routes network endpoints matching platform configurations to Profile tracks, and groups corporate domains into downstream Website Scraping lists.

### 4. `proxy-manager` (Go)
*   **Role:** Outbound Traffic Routing Engine & Shield.
*   **Responsibilities:**
    *   Wraps third-party residential proxy provider gateways into a unified system-level transport interceptor.
    *   Implements an IP rotation schedule forcing an alternate proxy network interface node selection per standalone request stream.
    *   Enforces an internal safety delay window restricting execution pathways to a **minimum gap of 60 seconds per specific proxy IP connection**.
    *   Features network error isolation handlers: traps `403 Forbidden`, `429 Too Many Requests`, and connection drops to slide blocked proxy channels out of rotation during cool-down periods.

### 5. `validation-worker` (Go)
*   **Role:** Data Cleaning & Domain Verification Engine.
*   **Responsibilities:**
    *   Pops newly discovered text blocks from the validation queue to enforce quality standards before persistent data writing occurs.
    *   Conducts advanced string sanitization (stripping extraneous formatting characters, evaluating structural domain layouts).
    *   Performs concurrent, asynchronous live DNS lookups via Mail Exchange (`net.LookupMX`) verification to confirm host servers exist and are actively accepting messages.
    *   Computes and assigns granular lead confidence scores; strips out unresolvable or junk data vectors to maintain strict database indexing optimizations.

### 6. `antidetect-service` (Go)
*   **Role:** Headless Dynamic Crawler for Rich Applications.
*   **Responsibilities:**
    *   Drives programmatic browser automation layouts utilizing Chrome DevTools Protocol (CDP via the `rod` library infrastructure) to parse JavaScript-heavy Single Page Applications (SPAs).
    *   **Boundary Constraints:** Implements a strict crawler navigation ceiling limiting path depth targets to a **maximum of 5 total subdirectory pages** down to **2 directory layout levels maximum** (`/contact`, `/about`).
    *   Features automated base64 screenshot capture routines that upload UI capture files directly to persistent object storage (MinIO) during workflow errors for debugging audits.

### 7. `frontend` (Next.js 15 — App Router)
*   **Role:** Operations Control Dashboard.
*   **Stack:** Next.js 15, React 19, Tailwind CSS, TanStack React Query v5, Axios.
*   **Responsibilities:**
    *   Provides a polished B2B SaaS dashboard with sidebar navigation, campaign list/create/status management, and real-time toast notifications.
    *   Implements JWT session management via a browser cookie (`lgs_session`) shared between the Axios request interceptor and Next.js Edge Middleware.
    *   `middleware.ts` guards all `/dashboard/*` routes server-side; a React Query response interceptor handles 403 Forbidden → session expiry redirect.
    *   Full campaign lifecycle management: create, filter by status, transition status (active → paused → completed → archived), and delete.
*   **Module README:** [`frontend/README.md`](frontend/README.md)

---

## Module READMEs

| Module | README |
|--------|--------|
| `frontend/` | [frontend/README.md](frontend/README.md) |
| `pkg/auth/` | [pkg/auth/README.md](pkg/auth/README.md) |
| `pkg/campaign/` | [pkg/campaign/README.md](pkg/campaign/README.md) |
| `services/api-gateway/` | [services/api-gateway/README.md](services/api-gateway/README.md) |

---

## Data Flow Pipeline

1.  **Initiation:** Operator sets search configurations via the `frontend` Dashboard $\rightarrow$ Dispatched to `api-gateway`.
2.  **Queue Injection:** `api-gateway` records the operational campaign entity in PostgreSQL and breaks down target tracking parameters as tasks into the **Redis Spine**.
3.  **Discovery:** 
    *   Static/Simple tasks are consumed by the **Rust** `scrape-worker`.
    *   Advanced JS/SPA tasks are routed to the `antidetect-service`.
    *   Keyword operations are handled via the `search-worker`.
4.  **Network Routing:** All external network workers access targets by passing connection threads through the `proxy-manager` interceptor to protect scrapers behind rotated resident IPs.
5.  **Validation:** Extracted lead signatures pass to the `validation-worker` where regex normalization and synchronous DNS MX queries evaluate legitimacy.
6.  **Persistence:** Cleaned, authenticated results are stored inside PostgreSQL using optimized index layers to enforce deduplication across the database.
