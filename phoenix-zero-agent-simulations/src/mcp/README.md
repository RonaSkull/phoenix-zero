# MCP adapter (local)

This is a **local adapter** that exposes MCP tools over stdio and calls the existing Phoenix Zero REST API.

Tools:

- `discover`
- `pricing`
- `compatibility`
- `checkoutCreate` (requires `apiKey`)

Target:

- `PHOENIX_ZERO_BASE_URL` (default: https://phoenix-zero-web.onrender.com)
