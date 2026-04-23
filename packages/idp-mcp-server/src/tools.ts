export interface ToolContext {
  backstageUrl: string;
  githubToken: string;
  githubOrg: string;
}

async function costFetch(backstageUrl: string, path: string): Promise<any> {
  const res = await fetch(`${backstageUrl}/api/cost${path}`);
  if (!res.ok) return { error: `Cost API error: ${res.status}` };
  return res.json();
}

async function ghFetch(token: string, path: string): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) return { error: `GitHub API error: ${res.status} ${res.statusText}` };
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

export async function listGithubRepos(ctx: ToolContext): Promise<string> {
  const data = await ghFetch(ctx.githubToken, `/orgs/${ctx.githubOrg}/repos?per_page=50&sort=updated`);
  if (data.error) return JSON.stringify(data, null, 2);
  return JSON.stringify((data as any[]).map((r: any) => ({
    name: r.name, description: r.description, language: r.language,
    default_branch: r.default_branch, visibility: r.visibility,
    updated_at: r.updated_at, html_url: r.html_url,
  })), null, 2);
}

export async function listRepoWorkflows(ctx: ToolContext, repo: string): Promise<string> {
  const data = await ghFetch(ctx.githubToken, `/repos/${ctx.githubOrg}/${repo}/actions/workflows`);
  if (data.error) return JSON.stringify(data, null, 2);
  return JSON.stringify((data as any).workflows?.map((w: any) => ({
    id: w.id, name: w.name, state: w.state, path: w.path, html_url: w.html_url,
  })), null, 2);
}

export async function listWorkflowRuns(ctx: ToolContext, repo: string, status?: string, limit: string = '10'): Promise<string> {
  const n = Math.min(parseInt(limit, 10), 30);
  const qs = status ? `&status=${status}` : '';
  const data = await ghFetch(ctx.githubToken, `/repos/${ctx.githubOrg}/${repo}/actions/runs?per_page=${n}${qs}`);
  if (data.error) return JSON.stringify(data, null, 2);
  return JSON.stringify((data as any).workflow_runs?.map((r: any) => ({
    id: r.id, name: r.name, status: r.status, conclusion: r.conclusion,
    head_branch: r.head_branch, event: r.event,
    created_at: r.created_at, updated_at: r.updated_at, html_url: r.html_url,
  })), null, 2);
}

export async function getWorkflowRun(ctx: ToolContext, repo: string, runId: string): Promise<string> {
  const data = await ghFetch(ctx.githubToken, `/repos/${ctx.githubOrg}/${repo}/actions/runs/${runId}`);
  if (data.error) return JSON.stringify(data, null, 2);
  const r = data as any;
  return JSON.stringify({
    id: r.id, name: r.name, status: r.status, conclusion: r.conclusion,
    head_branch: r.head_branch, head_sha: r.head_sha?.slice(0, 8),
    event: r.event, created_at: r.created_at, updated_at: r.updated_at,
    run_attempt: r.run_attempt, html_url: r.html_url,
  }, null, 2);
}

export async function listPullRequests(ctx: ToolContext, repo: string, state: string = 'open'): Promise<string> {
  const data = await ghFetch(ctx.githubToken, `/repos/${ctx.githubOrg}/${repo}/pulls?state=${state}&per_page=20&sort=updated`);
  if (data.error) return JSON.stringify(data, null, 2);
  return JSON.stringify((data as any[]).map((pr: any) => ({
    number: pr.number, title: pr.title, state: pr.state,
    author: pr.user?.login, head: pr.head?.ref, base: pr.base?.ref,
    created_at: pr.created_at, updated_at: pr.updated_at,
    draft: pr.draft, html_url: pr.html_url,
  })), null, 2);
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
    name: 'list_github_repos',
    description: 'List all GitHub repositories in the organization',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_repo_workflows',
    description: 'List all GitHub Actions workflows defined in a repository',
    inputSchema: {
      type: 'object',
      properties: { repo: { type: 'string', description: 'Repository name e.g. backstage-idp' } },
      required: ['repo'],
    },
  },
  {
    name: 'list_workflow_runs',
    description: 'List recent GitHub Actions workflow runs, optionally filtered by status',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name' },
        status: { type: 'string', description: 'success | failure | in_progress | queued | cancelled' },
        limit: { type: 'string', description: 'Number of runs (default 10, max 30)' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'get_workflow_run',
    description: 'Get full details of a specific GitHub Actions workflow run',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name' },
        run_id: { type: 'string', description: 'Workflow run ID' },
      },
      required: ['repo', 'run_id'],
    },
  },
  {
    name: 'list_pull_requests',
    description: 'List pull requests for a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name' },
        state: { type: 'string', description: 'open (default) | closed | all' },
      },
      required: ['repo'],
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
    case 'list_github_repos':
      return listGithubRepos(ctx);
    case 'list_repo_workflows':
      return listRepoWorkflows(ctx, args.repo);
    case 'list_workflow_runs':
      return listWorkflowRuns(ctx, args.repo, args.status, args.limit);
    case 'get_workflow_run':
      return getWorkflowRun(ctx, args.repo, args.run_id);
    case 'list_pull_requests':
      return listPullRequests(ctx, args.repo, args.state);
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
