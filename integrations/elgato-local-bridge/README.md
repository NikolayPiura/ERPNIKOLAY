# PIURA ERP · Elgato Local Bridge

The dashboard is hosted over HTTPS, while Elgato Light Strip Pro exposes a local HTTP API. This loopback-only bridge connects the two without exposing the lights to the internet.

Configured devices:

- Elgato Light Strip Pro D026
- 341

The launch agent starts the bridge automatically at login on `127.0.0.1:45831`. Only the PIURA GitHub Pages origin and local development origins receive CORS access.
