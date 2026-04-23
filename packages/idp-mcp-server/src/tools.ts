export interface ToolContext {
  backstageUrl: string;
}

async function costFetch(backstageUrl: string, path: string): Promise<any> {
  const res = await fetch(`${backstageUrl}/api/cost${path}`);
  if (!res.ok) return { error: `Cost API error: ${res.status}` };
  return res.json();
}

const pick = (e: any) => ({
  name: e.metadata?.name,
  description: e.metadata?.description ?? '',
  tags: e.metadata?.tags ?? [],
  type: e.spec?.type,
  owner: e.spec?.owner,
  system: e.spec?.system,
  lifecycle: e.spec?.lifecycle,
  links: (e.metadata?.links ?? []).map((l: any) => ({ title: l.title, url: l.url })),
});

async function catalogFetch(backstageUrl: string, path: string): Promise<any[]> {
  const res = await fetch(`${backstageUrl}/api/catalog/${path}`);
  if (!res.ok) return [];
  return res.json();
}

export async function listEnvironments(ctx: ToolContext): Promise<string> {
  const items = await catalogFetch(
    ctx.backstageUrl,
    'entities?filter=kind=Resource&filter=spec.type=environment',
  );
  return JSON.stringify(items.map(pick), null, 2);
}

export async function getEnvironmentResources(
  ctx: ToolContext,
  environment: string,
): Promise<string> {
  const items = await catalogFetch(
    ctx.backstageUrl,
    `entities?filter=kind=Resource&filter=metadata.name~${environment}`,
  );
  return JSON.stringify(items.map(pick), null, 2);
}

export async function listApplications(
  ctx: ToolContext,
  environment: string,
): Promise<string> {
  const items = await catalogFetch(
    ctx.backstageUrl,
    `entities?filter=kind=Component&filter=spec.lifecycle=${environment}`,
  );
  return JSON.stringify(items.map(pick), null, 2);
}

export async function listSystems(ctx: ToolContext): Promise<string> {
  const items = await catalogFetch(ctx.backstageUrl, 'entities?filter=kind=System');
  return JSON.stringify(items.map(pick), null, 2);
}

export async function getEntity(
  ctx: ToolContext,
  kind: string,
  name: string,
): Promise<string> {
  const res = await fetch(
    `${ctx.backstageUrl}/api/catalog/entities/by-name/${kind.toLowerCase()}/default/${name}`,
  );
  if (!res.ok) return JSON.stringify({ error: `Entity ${kind}:${name} not found` });
  const entity = await res.json();
  return JSON.stringify(pick(entity), null, 2);
}

export async function getCostSummary(ctx: ToolContext): Promise<string> {
  return JSON.stringify(await costFetch(ctx.backstageUrl, '/costs/summary'), null, 2);
}

export async function getCostTrends(ctx: ToolContext, months: string = '3'): Promise<string> {
  return JSON.stringify(await costFetch(ctx.backstageUrl, `/costs?months=${months}`), null, 2);
}

export async function getCostBreakdown(ctx: ToolContext, networkCode: string): Promise<string> {
  return JSON.stringify(
    await costFetch(ctx.backstageUrl, `/costs/breakdown?networkCode=${networkCode}`),
    null,
    2,
  );
}

export const TOOL_DEFINITIONS = [
  {
    name: 'list_environments',
    description: 'List all environments/namespaces registered in the IDP catalog',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_environment_resources',
    description:
      'Get all infrastructure resources (Cloud SQL, GCS, Redis) provisioned for a specific environment',
    inputSchema: {
      type: 'object',
      properties: {
        environment: { type: 'string', description: 'Environment name e.g. pds-515' },
      },
      required: ['environment'],
    },
  },
  {
    name: 'list_applications',
    description: 'List all applications deployed to a specific environment',
    inputSchema: {
      type: 'object',
      properties: {
        environment: { type: 'string', description: 'Environment name e.g. pds-515' },
      },
      required: ['environment'],
    },
  },
  {
    name: 'list_systems',
    description: 'List all systems (network codes / cost centers) in the IDP catalog',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_entity',
    description: 'Get full details of a specific catalog entity by kind and name',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: 'Entity kind: Resource, Component, or System',
        },
        name: { type: 'string', description: 'Entity name e.g. pds-515-namespace' },
      },
      required: ['kind', 'name'],
    },
  },
  {
    name: 'get_cost_summary',
    description: 'Get current month GCP cost summary grouped by network code (cost center)',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_cost_trends',
    description: 'Get monthly GCP cost trends for the last N months grouped by network code',
    inputSchema: {
      type: 'object',
      properties: {
        months: { type: 'string', description: 'Number of months to fetch (1-12, default 3)' },
      },
      required: [],
    },
  },
  {
    name: 'get_cost_breakdown',
    description: 'Get current month GCP cost breakdown by GCP service for a specific network code',
    inputSchema: {
      type: 'object',
      properties: {
        network_code: { type: 'string', description: 'Network code e.g. cn580004' },
      },
      required: ['network_code'],
    },
  },
];

export async function runTool(
  name: string,
  args: Record<string, string>,
  ctx: ToolContext,
): Promise<string> {
  switch (name) {
    case 'list_environments':
      return listEnvironments(ctx);
    case 'get_environment_resources':
      return getEnvironmentResources(ctx, args.environment);
    case 'list_applications':
      return listApplications(ctx, args.environment);
    case 'list_systems':
      return listSystems(ctx);
    case 'get_entity':
      return getEntity(ctx, args.kind, args.name);
    case 'get_cost_summary':
      return getCostSummary(ctx);
    case 'get_cost_trends':
      return getCostTrends(ctx, args.months);
    case 'get_cost_breakdown':
      return getCostBreakdown(ctx, args.network_code);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
