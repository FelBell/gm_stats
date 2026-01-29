#!/bin/sh

# Exit on error
set -e

# Wait for Certbot to create the certificate
wait_for_certificate() {
  while [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; do
    echo "Waiting for certificate for $DOMAIN..."
    sleep 5
  done
}

# Generate a dummy certificate if none exists
generate_dummy_certificate() {
  if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
    echo "Generating dummy certificate for $DOMAIN..."
    mkdir -p /etc/letsencrypt/live/$DOMAIN
    openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
      -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
      -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
      -subj "/CN=localhost"
  fi
}

# Start Nginx in the background
start_nginx() {
  echo "Starting Nginx..."
  nginx -g "daemon off;" &
}

# Request a certificate from Let's Encrypt
request_certificate() {
  echo "Requesting certificate for $DOMAIN..."
  certbot certonly --config /etc/certbot/cli.ini -d $DOMAIN -d www.$DOMAIN
}

# Main script execution
generate_dummy_certificate
start_nginx
request_certificate
wait_for_certificate

# Stop the dummy Nginx instance and start the real one
kill $(ps aux | grep 'nginx: master process' | awk '{print $2}')
nginx -g "daemon off;"
