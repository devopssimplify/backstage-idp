import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { Router, json } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_environments',
    description: 'List all environments/namespaces registered in the IDP catalog',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_environment_resources',
    description:
      'Get all infrastructure resources (Cloud SQL, GCS, Redis) provisioned for a specific environment',
    input_schema: {
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
    input_schema: {
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
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_entity',
    description: 'Get full details of a specific catalog entity by kind and name',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Entity kind: Resource, Component, or System' },
        name: { type: 'string', description: 'Entity name e.g. pds-515-namespace' },
      },
      required: ['kind', 'name'],
    },
  },
  {
    name: 'get_cost_summary',
    description: 'Get current month GCP cost summary grouped by network code (cost center)',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_cost_trends',
    description: 'Get monthly GCP cost trends for the last N months, grouped by network code',
    input_schema: {
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
    input_schema: {
      type: 'object',
      properties: {
        network_code: { type: 'string', description: 'Network code / cost center e.g. cn580004' },
      },
      required: ['network_code'],
    },
  },
  {
    name: 'list_github_repos',
    description: 'List all GitHub repositories in the organization',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_repo_workflows',
    description: 'List all GitHub Actions workflows defined in a repository',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name e.g. backstage-idp' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'list_workflow_runs',
    description: 'List recent GitHub Actions workflow runs for a repository, optionally filtered by status',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name e.g. backstage-idp' },
        status: { type: 'string', description: 'Filter by status: success, failure, in_progress, queued, cancelled' },
        limit: { type: 'string', description: 'Number of runs to return (default 10, max 30)' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'get_workflow_run',
    description: 'Get full details of a specific GitHub Actions workflow run by run ID',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name e.g. backstage-idp' },
        run_id: { type: 'string', description: 'Workflow run ID (number)' },
      },
      required: ['repo', 'run_id'],
    },
  },
  {
    name: 'list_pull_requests',
    description: 'List pull requests for a GitHub repository',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name e.g. backstage-idp' },
        state: { type: 'string', description: 'PR state: open (default), closed, all' },
      },
      required: ['repo'],
    },
  },
];

const pick = (e: any) => ({
  name: e.metadata?.name,
  description: e.metadata?.description ?? '',
  tags: e.metadata?.tags ?? [],
  type: e.spec?.type,
  owner: e.spec?.owner,
  system: e.spec?.system,
  lifecycle: e.spec?.lifecycle,
  links: (e.metadata?.links ?? []).map((l: any) => l.title),
});

async function runTool(
  name: string,
  input: Record<string, string>,
  catalogUrl: string,
  token: string,
  costUrl: string,
  githubToken: string,
  githubOrg: string,
): Promise<string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  const getEntities = async (qs: string) => {
    const r = await fetch(`${catalogUrl}/entities?${qs}`, { headers });
    if (!r.ok) return [];
    return (await r.json()) as any[];
  };

  const getCost = async (path: string) => {
    const r = await fetch(`${costUrl}${path}`);
    if (!r.ok) return { error: `Cost API error: ${r.status}` };
    return r.json();
  };

  const ghHeaders = { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const ghGet = async (path: string) => {
    const r = await fetch(`https://api.github.com${path}`, { headers: ghHeaders });
    if (!r.ok) return { error: `GitHub API error: ${r.status} ${r.statusText}` };
    return r.json();
  };

  switch (name) {
    case 'list_environments': {
      const items = await getEntities('filter=kind=Resource&filter=spec.type=environment');
      return JSON.stringify(items.map(pick));
    }
    case 'get_environment_resources': {
      const items = await getEntities(
        `filter=kind=Resource&filter=metadata.name~${input.environment}`,
      );
      return JSON.stringify(items.map(pick));
    }
    case 'list_applications': {
      const items = await getEntities(
        `filter=kind=Component&filter=spec.lifecycle=${input.environment}`,
      );
      return JSON.stringify(items.map(pick));
    }
    case 'list_systems': {
      const items = await getEntities('filter=kind=System');
      return JSON.stringify(items.map(pick));
    }
    case 'get_entity': {
      const r = await fetch(
        `${catalogUrl}/entities/by-name/${input.kind.toLowerCase()}/default/${input.name}`,
        { headers },
      );
      if (!r.ok) return JSON.stringify({ error: `Not found: ${input.kind}/${input.name}` });
      return JSON.stringify(pick(await r.json()));
    }
    case 'get_cost_summary':
      return JSON.stringify(await getCost('/costs/summary'));
    case 'get_cost_trends': {
      const months = input.months ?? '3';
      return JSON.stringify(await getCost(`/costs?months=${months}`));
    }
    case 'get_cost_breakdown':
      return JSON.stringify(await getCost(`/costs/breakdown?networkCode=${input.network_code}`));
    case 'list_github_repos': {
      const data = await ghGet(`/orgs/${githubOrg}/repos?per_page=50&sort=updated`);
      if (data.error) return JSON.stringify(data);
      return JSON.stringify((data as any[]).map((r: any) => ({
        name: r.name, description: r.description, language: r.language,
        default_branch: r.default_branch, visibility: r.visibility,
        updated_at: r.updated_at, html_url: r.html_url,
      })));
    }
    case 'list_repo_workflows': {
      const data = await ghGet(`/repos/${githubOrg}/${input.repo}/actions/workflows`);
      if (data.error) return JSON.stringify(data);
      return JSON.stringify((data as any).workflows?.map((w: any) => ({
        id: w.id, name: w.name, state: w.state, path: w.path, html_url: w.html_url,
      })));
    }
    case 'list_workflow_runs': {
      const limit = Math.min(parseInt(input.limit ?? '10', 10), 30);
      const qs = input.status ? `&status=${input.status}` : '';
      const data = await ghGet(`/repos/${githubOrg}/${input.repo}/actions/runs?per_page=${limit}${qs}`);
      if (data.error) return JSON.stringify(data);
      return JSON.stringify((data as any).workflow_runs?.map((r: any) => ({
        id: r.id, name: r.name, status: r.status, conclusion: r.conclusion,
        head_branch: r.head_branch, event: r.event,
        created_at: r.created_at, updated_at: r.updated_at, html_url: r.html_url,
      })));
    }
    case 'get_workflow_run': {
      const data = await ghGet(`/repos/${githubOrg}/${input.repo}/actions/runs/${input.run_id}`);
      if (data.error) return JSON.stringify(data);
      const r = data as any;
      return JSON.stringify({
        id: r.id, name: r.name, status: r.status, conclusion: r.conclusion,
        head_branch: r.head_branch, head_sha: r.head_sha?.slice(0, 8),
        event: r.event, created_at: r.created_at, updated_at: r.updated_at,
        run_attempt: r.run_attempt, html_url: r.html_url,
      });
    }
    case 'list_pull_requests': {
      const state = input.state ?? 'open';
      const data = await ghGet(`/repos/${githubOrg}/${input.repo}/pulls?state=${state}&per_page=20&sort=updated`);
      if (data.error) return JSON.stringify(data);
      return JSON.stringify((data as any[]).map((pr: any) => ({
        number: pr.number, title: pr.title, state: pr.state,
        author: pr.user?.login, head: pr.head?.ref, base: pr.base?.ref,
        created_at: pr.created_at, updated_at: pr.updated_at,
        draft: pr.draft, html_url: pr.html_url,
      })));
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export default createBackendPlugin({
  pluginId: 'idp-assistant',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
      },
      async init({ httpRouter, config, logger, discovery, auth }) {
        const router = Router();
        router.use(json());

        router.post('/query', async (req, res) => {
          const { question } = req.body ?? {};
          if (!question) {
            res.status(400).json({ error: 'question is required' });
            return;
          }

          const apiKey =
            config.getOptionalString('idpAssistant.anthropicApiKey') ??
            process.env.ANTHROPIC_API_KEY;

          if (!apiKey) {
            res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
            return;
          }

          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          res.flushHeaders();
          (res as any).socket?.setNoDelay(true);

          const emit = (obj: object) => {
            try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* closed */ }
          };

          try {
            const [catalogUrl, costUrl] = await Promise.all([
              discovery.getBaseUrl('catalog'),
              discovery.getBaseUrl('cost'),
            ]);
            const { token } = await auth.getPluginRequestToken({
              onBehalfOf: await auth.getOwnServiceCredentials(),
              targetPluginId: 'catalog',
            });
            const githubToken = process.env.GITHUB_TOKEN ?? '';
            const githubOrg = config.getOptionalString('idpAssistant.githubOrg') ?? process.env.GITHUB_ORG ?? 'devopssimplify';

            const anthropic = new Anthropic({ apiKey });
            const messages: Anthropic.MessageParam[] = [
              { role: 'user', content: question },
            ];

            for (let turn = 0; turn < 10; turn++) {
              const stream = anthropic.messages.stream({
                model: 'claude-sonnet-4-6',
                max_tokens: 4096,
                system: `You are an IDP (Internal Developer Platform) assistant for a platform engineering team.
You help engineers query and understand their infrastructure managed via Backstage.
Always use the provided tools to fetch real data before answering.
Be concise. Use bullet points for lists. Include relevant names and links when available.`,
                tools: TOOLS,
                messages,
              });

              for await (const event of stream) {
                if (
                  event.type === 'content_block_delta' &&
                  event.delta.type === 'text_delta'
                ) {
                  emit({ type: 'text', content: event.delta.text });
                } else if (
                  event.type === 'content_block_start' &&
                  event.content_block.type === 'tool_use'
                ) {
                  emit({ type: 'tool_start', name: event.content_block.name });
                }
              }

              const final = await stream.finalMessage();
              const toolUses = final.content.filter(
                (b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
              );

              if (toolUses.length === 0) break;

              messages.push({ role: 'assistant', content: final.content });

              const results: Anthropic.ToolResultBlockParam[] = [];
              for (const tu of toolUses) {
                emit({ type: 'tool_running', name: tu.name });
                const result = await runTool(
                  tu.name,
                  tu.input as Record<string, string>,
                  catalogUrl,
                  token,
                  costUrl,
                  githubToken,
                  githubOrg,
                );
                emit({ type: 'tool_done', name: tu.name });
                results.push({
                  type: 'tool_result',
                  tool_use_id: tu.id,
                  content: result,
                });
              }

              messages.push({ role: 'user', content: results });
            }

            emit({ type: 'done' });
          } catch (err: any) {
            const msg = err?.message ?? String(err) ?? 'Unknown error';
            logger.error(`IDP Assistant error: ${msg}`, { stack: err?.stack, cause: String(err?.cause ?? '') });
            emit({ type: 'error', message: msg });
          } finally {
            res.end();
          }
        });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({ path: '/query', allow: 'unauthenticated' });
      },
    });
  },
});
