# OpenAI, Claude and external chat clients

There are two distinct connections. Both use the same commerce capabilities.

## Models inside the merchant chat

Operators can configure encrypted global provider settings and shop overrides
in **Vendune Platform → AI providers**; ordinary shops inherit that selection.
Configured flags are not provider-health checks. See [provider inheritance](platform.md#central-ai-inherited-by-all-shops).

For a local environment-based setup, set credentials in the private, ignored
`.env`, then restart the server:

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-6-sol
ANTHROPIC_API_KEY=your-api-key
ANTHROPIC_MODEL=claude-sonnet-5-5
```

In `/#merchant`, sign in with a personal member account and open the assistant
model settings. Choose Local, OpenAI, or Claude. You can override
the model ID per turn. The server uses OpenAI **Responses** with structured
outputs, or Anthropic **Messages** with `output_config.format`. No subscription
cookies, ChatGPT browser automation, or Claude subscription tokens are used.
These APIs require separate provider credentials/access and may incur charges.
The database and local-model route do not require a paid service.

Credentials are never returned to the frontend or stored in conversations.
Cloud selection sends the bounded catalog, graph context and conversation
history to that provider. No silent provider fallback occurs. Failures are
stored as explicit error messages; they never create an executable proposal.
The server validates IDs, ranges and trusted revisions for every provider.

Official references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

## Claude Desktop / local MCP clients

The Python bridge forwards real JSON-RPC requests over stdio to the running
Rust MCP endpoint. Add this entry to your client's MCP configuration, replacing
the absolute checkout path. Preserve existing entries in your config.

```json
{
  "mcpServers": {
    "vendune": {
      "command": "python3",
      "args": ["/absolute/path/vendune/scripts/mcp_stdio.py"],
      "env": {
        "COMMERCE_URL": "http://127.0.0.1:8787",
        "COMMERCE_TENANT": "atelier"
      }
    }
  }
}
```

This configuration exposes the customer/read tools. For merchant planning and
approval, set `COMMERCE_SESSION_TOKEN` privately to a personal member session
and `COMMERCE_TENANT` to its shop. A scoped integration key is another option
through the same authenticated server path. Do not commit a filled credential/config. The tool sequence is
`merchant.plan` → inspect the stored preview → `merchant.apply` with explicit
approval. `knowledge.graph` and `knowledge.search` expose the actual graph and
retrieval route. The bridge is transport, not another commerce implementation.

## ChatGPT / Claude remote connectors

The Rust endpoint is `/mcp`, a stateless JSON-response subset of Streamable
HTTP. GET returns 405 because this prototype offers no SSE subscription.
Localhost is not directly reachable by ChatGPT or Claude's hosted services.
Use a supported secure tunnel or a deployed HTTPS endpoint for remote access.
Keep the local demo bound to loopback until its production identity layer exists.

For an authorized OpenAI API client, the remote MCP tool configuration is:

```json
{
  "type": "mcp",
  "server_label": "commerce",
  "server_url": "https://your-commerce-host.example/mcp",
  "authorization": "Bearer YOUR_PRIVATE_MERCHANT_TOKEN",
  "require_approval": "always"
}
```

For ChatGPT's UI, an authorized account/workspace owner must add the custom
MCP app in Developer Mode. Account availability and authentication requirements
depend on the product/plan. This repository does not register an app in your
ChatGPT/Claude account or implement a full OAuth authorization server.
For a remote UI connector that requires OAuth, an OAuth gateway is still needed;
a personal session or integration key is not a replacement for that OAuth gateway.

[ChatGPT developer-mode setup and secure-tunnel guidance](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt)
and [OpenAI remote MCP API](https://developers.openai.com/api/docs/guides/tools-connectors-mcp).

## Verification boundary

`scripts/providers.py` exercises both adapters against **local HTTP contract
servers** and verifies the real merchant conversation and approval routes.
Those tests do not prove live OpenAI/Anthropic inference. Real local Ollama
inference is tested separately. Live cloud checks require your own API keys;
no borrowed credentials or fabricated cloud results are included.

## Personal workspace credentials (v0.4)

For normal merchant MCP access, set `COMMERCE_SESSION_TOKEN` to that user's
opaque login session and `COMMERCE_TENANT` to one of their memberships. The bridge
uses this token preferentially. Knowledge and merchant tools check scoped
authority on the server; readers cannot apply proposals. Sessions expire after
12 hours and must be renewed through personal login. Never distribute the
legacy global `MERCHANT_TOKEN` to SaaS merchants. Public product/cart tools work
without merchant credentials; complete graph/vector tools do not. The generated
local configuration intentionally contains no embedded credentials.
