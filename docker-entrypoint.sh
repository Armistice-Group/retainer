#!/bin/sh
set -e

echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy

echo "Starting server — a new database will prompt you to create the admin account at /setup."
exec node server.js
