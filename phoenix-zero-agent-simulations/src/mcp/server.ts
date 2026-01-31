import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

import { baseUrlFromEnv, httpJson } from '../lib/http';

function asText(obj: any): { content: Array<{ type: 'text'; text: string }>; structuredContent: any } {
  const structuredContent = obj ?? null;
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
}

async function main() {
  const baseUrl = baseUrlFromEnv();

  const server = new McpServer({
    name: 'phoenix-zero-mcp-adapter',
    version: '0.1.0'
  });

  server.registerTool(
    'discover',
    {
      title: 'Discover Phoenix Zero',
      description: 'Fetch Phoenix Zero public discovery + capabilities. Adapter calls REST endpoints on PHOENIX_ZERO_BASE_URL.',
      inputSchema: {},
      outputSchema: {
        ok: z.boolean(),
        baseUrl: z.string(),
        wellKnown: z.any(),
        capabilities: z.any()
      }
    },
    async () => {
      const wellKnown = await httpJson({ method: 'GET', url: `${baseUrl}/.well-known/ai-service.json` });
      const capabilities = await httpJson({ method: 'GET', url: `${baseUrl}/api/capabilities` });

      return asText({
        ok: wellKnown.ok && capabilities.ok,
        baseUrl,
        wellKnown: { status: wellKnown.status, body: wellKnown.json },
        capabilities: { status: capabilities.status, body: capabilities.json }
      });
    }
  );

  server.registerTool(
    'pricing',
    {
      title: 'Pricing',
      description: 'Fetch /api/pricing (public by default). Optionally pass apiKey to get tenant-scoped pricing if supported.',
      inputSchema: {
        apiKey: z.string().optional()
      },
      outputSchema: {
        ok: z.boolean(),
        status: z.number(),
        body: z.any()
      }
    },
    async ({ apiKey }: { apiKey?: string }) => {
      const res = await httpJson({ method: 'GET', url: `${baseUrl}/api/pricing`, apiKey });
      return asText({ ok: res.ok, status: res.status, body: res.json });
    }
  );

  server.registerTool(
    'compatibility',
    {
      title: 'Compatibility',
      description: 'POST /api/compatibility to check whether an operation is compatible with an intent and agent type.',
      inputSchema: {
        operation: z.string().optional(),
        intent: z.string().optional(),
        agentType: z.string().optional(),
        supportsPpo: z.boolean().optional()
      },
      outputSchema: {
        ok: z.boolean(),
        status: z.number(),
        body: z.any()
      }
    },
    async (args: { operation?: string; intent?: string; agentType?: string; supportsPpo?: boolean }) => {
      const res = await httpJson({ method: 'POST', url: `${baseUrl}/api/compatibility`, body: args });
      return asText({ ok: res.ok, status: res.status, body: res.json });
    }
  );

  server.registerTool(
    'checkoutCreate',
    {
      title: 'Checkout Create (tenant)',
      description: 'Create a payment intent. Requires x-api-key. Adapter calls POST /api/checkout/create.',
      inputSchema: {
        apiKey: z.string(),
        currency: z.string().default('BRL'),
        providerHint: z.enum(['pix', 'crypto']).default('pix'),
        operation: z.string(),
        units: z.number().int().min(1).default(1),
        proofMeta: z.object({
          agentId: z.string(),
          taskId: z.string(),
          taskType: z.string(),
          taskInputHash: z.string(),
          taskOutputHash: z.string()
        })
      },
      outputSchema: {
        ok: z.boolean(),
        status: z.number(),
        body: z.any()
      }
    },
    async (args: any) => {
      const { apiKey, ...body } = args;
      const res = await httpJson({ method: 'POST', url: `${baseUrl}/api/checkout/create`, apiKey, body });
      return asText({ ok: res.ok, status: res.status, body: res.json });
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(JSON.stringify({ ok: true, baseUrl, name: 'phoenix-zero-mcp-adapter', version: '0.1.0' }));
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
