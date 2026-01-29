FROM nginx:latest

# Remove the default nginx configuration file
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx configuration file
COPY nginx.conf /etc/nginx/nginx.conf
