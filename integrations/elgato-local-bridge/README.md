# PIURA ERP · Local Space Bridge

The dashboard is hosted over HTTPS, while the home devices expose local-network APIs. This loopback-only bridge connects the two without exposing any device to the internet.

Configured devices:

- Elgato Light Strip Pro D026
- 341
- TP-Link HS103 plugs 1, 2, 3 and 5

Prepared but not yet controllable:

- TP-Link HS300 strip 4 (requires TP-Link account authentication)
- Levoit purifier (requires VeSync account authentication)
- Garage at `192.168.4.45` (device type still unknown)
- Smart Life fan at `192.168.4.23` (requires its Tuya local key)

The launch agent starts the bridge automatically at login on `127.0.0.1:45831`. Only the PIURA GitHub Pages origin and local development origins receive CORS access.
