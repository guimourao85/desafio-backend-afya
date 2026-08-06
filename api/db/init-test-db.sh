#!/bin/sh
# Roda uma única vez, no primeiro boot do volume do Postgres.
# Volume pré-existente ignora este script: `docker compose down -v` antes de subir.
#
# É `.sh` e não `.sql` de propósito: o nome do banco de teste tem um dono só, o
# POSTGRES_DB_TEST do .env — que é também o que o DataSource de teste vai ler.
# Um literal aqui divergiria em silêncio no dia em que a variável mudasse.
set -e

psql -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "CREATE DATABASE \"$POSTGRES_DB_TEST\" OWNER \"$POSTGRES_USER\";"
