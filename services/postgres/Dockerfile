# Extend the official Postgres 15 Alpine image.
# The only addition is copying the SQL init scripts into the
# /docker-entrypoint-initdb.d/ directory. Postgres executes every *.sql
# file there in alphabetical order the first time the data volume is empty.
FROM postgres:15-alpine

# Copy all SQL init scripts. Only *.sql files are included; swap files
# and other editor artefacts are filtered by .dockerignore.
COPY init-scripts/ /docker-entrypoint-initdb.d/

# Ensure scripts are executable by the entrypoint.
RUN chmod -R 755 /docker-entrypoint-initdb.d/
