#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE n8n_db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n_db')\gexec
    GRANT ALL PRIVILEGES ON DATABASE n8n_db TO $POSTGRES_USER;
EOSQL
