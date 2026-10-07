#!/bin/sh
set -e

echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy

if [ -n "$AUTH_URL" ]; then
  echo "Starting server — open $AUTH_URL (a new database will prompt you to create the admin account)."
else
  echo "Starting server..."
fi
exec node server.js
