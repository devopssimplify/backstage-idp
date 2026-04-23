#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runTool, ToolContext } from './tools.js';

const BACKSTAGE_URL = process.env.BACKSTAGE_URL ?? 'http://localhost:7007';
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN ?? '';
const GITHUB_ORG    = process.env.GITHUB_ORG ?? 'devopssimplify';

const ctx: ToolContext = { backstageUrl: BACKSTAGE_URL, githubToken: GITHUB_TOKEN, githubOrg: GITHUB_ORG };

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

server.tool('list_github_repos', 'List all GitHub repositories in the org', {}, async () => ({
  content: [{ type: 'text', text: await runTool('list_github_repos', {}, ctx) }],
}));

server.tool(
  'list_repo_workflows',
  'List GitHub Actions workflows in a repository',
  { repo: z.string().describe('Repository name e.g. backstage-idp') },
  async ({ repo }) => ({
    content: [{ type: 'text', text: await runTool('list_repo_workflows', { repo }, ctx) }],
  }),
);

server.tool(
  'list_workflow_runs',
  'List recent GitHub Actions workflow runs for a repository',
  {
    repo: z.string().describe('Repository name'),
    status: z.string().optional().describe('success | failure | in_progress | queued | cancelled'),
    limit: z.string().optional().describe('Number of runs (default 10, max 30)'),
  },
  async ({ repo, status, limit }) => ({
    content: [{ type: 'text', text: await runTool('list_workflow_runs', { repo, status: status ?? '', limit: limit ?? '10' }, ctx) }],
  }),
);

server.tool(
  'get_workflow_run',
  'Get details of a specific GitHub Actions workflow run',
  {
    repo: z.string().describe('Repository name'),
    run_id: z.string().describe('Workflow run ID'),
  },
  async ({ repo, run_id }) => ({
    content: [{ type: 'text', text: await runTool('get_workflow_run', { repo, run_id }, ctx) }],
  }),
);

server.tool(
  'list_pull_requests',
  'List pull requests for a GitHub repository',
  {
    repo: z.string().describe('Repository name'),
    state: z.string().optional().describe('open (default) | closed | all'),
  },
  async ({ repo, state }) => ({
    content: [{ type: 'text', text: await runTool('list_pull_requests', { repo, state: state ?? 'open' }, ctx) }],
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
