# 1. One-time setup — fill in real secrets
cp .env.example .env
$EDITOR .env

# 2. Build all images (first run takes ~3–5 min)
make build

# 3. Start the full stack
make up
#   Frontend  → http://localhost:3000
#   Backend   → http://localhost:8080
#   Postgres  → localhost:5432

# 4. Watch logs
make logs

# 5. Tear down (preserves DB data volume)
make down

# 6. Full wipe including DB data
make clean

