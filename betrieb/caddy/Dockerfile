# Caddys Ratenbegrenzung ist ein Zusatzmodul und im Standardabbild nicht
# enthalten — deshalb einmal selbst bauen. Genau dieselbe Zeile steht als
# Hinweis in api/caddy/anmeldung.Caddyfile.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
