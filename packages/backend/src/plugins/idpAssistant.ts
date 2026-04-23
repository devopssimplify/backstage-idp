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
): Promise<string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  const getEntities = async (qs: string) => {
    const r = await fetch(`${catalogUrl}/entities?${qs}`, { headers });
    if (!r.ok) return [];
    return (await r.json()) as any[];
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
          res.flushHeaders();

          const emit = (obj: object) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

          try {
            const catalogUrl = await discovery.getBaseUrl('catalog');
            const { token } = await auth.getPluginRequestToken({
              onBehalfOf: await auth.getOwnServiceCredentials(),
              targetPluginId: 'catalog',
            });

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
            logger.error('IDP Assistant error', { error: err });
            emit({ type: 'error', message: err.message ?? 'Unknown error' });
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
