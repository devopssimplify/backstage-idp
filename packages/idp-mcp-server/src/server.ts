#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runTool, ToolContext } from './tools.js';

const BACKSTAGE_URL =
  process.env.BACKSTAGE_URL ?? 'http://localhost:7007';

const ctx: ToolContext = { backstageUrl: BACKSTAGE_URL };

const server = new McpServer({
  name: 'idp-mcp-server',
  version: '0.1.0',
});

server.tool('list_environments', 'List all environments in the IDP catalog', {}, async () => ({
  content: [{ type: 'text', text: await runTool('list_environments', {}, ctx) }],
}));

server.tool(
  'get_environment_resources',
  'Get infrastructure resources (Cloud SQL, GCS, Redis) for an environment',
  { environment: z.string().describe('Environment name e.g. pds-515') },
  async ({ environment }) => ({
    content: [{ type: 'text', text: await runTool('get_environment_resources', { environment }, ctx) }],
  }),
);

server.tool(
  'list_applications',
  'List all applications deployed to an environment',
  { environment: z.string().describe('Environment name e.g. pds-515') },
  async ({ environment }) => ({
    content: [{ type: 'text', text: await runTool('list_applications', { environment }, ctx) }],
  }),
);

server.tool('list_systems', 'List all systems (network codes) in the IDP catalog', {}, async () => ({
  content: [{ type: 'text', text: await runTool('list_systems', {}, ctx) }],
}));

server.tool(
  'get_entity',
  'Get details of a catalog entity by kind and name',
  {
    kind: z.string().describe('Entity kind: Resource, Component, or System'),
    name: z.string().describe('Entity name e.g. pds-515-namespace'),
  },
  async ({ kind, name }) => ({
    content: [{ type: 'text', text: await runTool('get_entity', { kind, name }, ctx) }],
  }),
);

server.tool('get_cost_summary', 'Get current month GCP cost summary by network code', {}, async () => ({
  content: [{ type: 'text', text: await runTool('get_cost_summary', {}, ctx) }],
}));

server.tool(
  'get_cost_trends',
  'Get monthly GCP cost trends for the last N months by network code',
  { months: z.string().optional().describe('Number of months (1-12, default 3)') },
  async ({ months }) => ({
    content: [{ type: 'text', text: await runTool('get_cost_trends', { months: months ?? '3' }, ctx) }],
  }),
);

server.tool(
  'get_cost_breakdown',
  'Get GCP cost breakdown by service for a specific network code',
  { network_code: z.string().describe('Network code e.g. cn580004') },
  async ({ network_code }) => ({
    content: [{ type: 'text', text: await runTool('get_cost_breakdown', { network_code }, ctx) }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`IDP MCP server running — Backstage: ${BACKSTAGE_URL}\n`);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
