import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { Router } from 'express';
import { BigQuery } from '@google-cloud/bigquery';

const MOCK_SUMMARY = [
  { network_code: 'cn580004', total_cost: 312.45, currency: 'USD' },
  { network_code: 'cn580005', total_cost: 198.72, currency: 'USD' },
  { network_code: 'untagged',  total_cost: 87.30,  currency: 'USD' },
];

const MOCK_COSTS = [
  { network_code: 'cn580004', total_cost: 312.45, currency: 'USD', month: '2026-04' },
  { network_code: 'cn580005', total_cost: 198.72, currency: 'USD', month: '2026-04' },
  { network_code: 'untagged',  total_cost: 87.30,  currency: 'USD', month: '2026-04' },
  { network_code: 'cn580004', total_cost: 289.10, currency: 'USD', month: '2026-03' },
  { network_code: 'cn580005', total_cost: 175.40, currency: 'USD', month: '2026-03' },
  { network_code: 'untagged',  total_cost: 92.15,  currency: 'USD', month: '2026-03' },
  { network_code: 'cn580004', total_cost: 301.88, currency: 'USD', month: '2026-02' },
  { network_code: 'cn580005', total_cost: 210.55, currency: 'USD', month: '2026-02' },
  { network_code: 'untagged',  total_cost: 79.60,  currency: 'USD', month: '2026-02' },
];

const MOCK_BREAKDOWN: Record<string, any[]> = {
  cn580004: [
    { service: 'Kubernetes Engine', total_cost: 198.30, currency: 'USD' },
    { service: 'Cloud SQL',         total_cost: 72.15,  currency: 'USD' },
    { service: 'Cloud Storage',     total_cost: 28.50,  currency: 'USD' },
    { service: 'Networking',        total_cost: 13.50,  currency: 'USD' },
  ],
  cn580005: [
    { service: 'Kubernetes Engine', total_cost: 120.40, currency: 'USD' },
    { service: 'Pub/Sub',           total_cost: 45.20,  currency: 'USD' },
    { service: 'Cloud Storage',     total_cost: 33.12,  currency: 'USD' },
  ],
  untagged: [
    { service: 'Kubernetes Engine', total_cost: 87.30, currency: 'USD' },
  ],
};

export default createBackendPlugin({
  pluginId: 'cost',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ httpRouter, config, logger }) {
        const router = Router();

        const projectId = config.getString('gcpBilling.projectId');
        const dataset = config.getString('gcpBilling.dataset');
        const table = config.getString('gcpBilling.table');

        const bigquery = new BigQuery({ projectId });

        // Monthly costs grouped by network-code label
        router.get('/costs', async (req, res) => {
          try {
            const months = Math.min(
              parseInt((req.query.months as string) || '3', 10),
              12,
            );
            const query = `
              SELECT
                IFNULL(nc.value, 'untagged') AS network_code,
                SUM(cost) AS total_cost,
                MAX(currency) AS currency,
                FORMAT_DATE('%Y-%m', DATE(usage_start_time)) AS month
              FROM \`${projectId}.${dataset}.${table}\`
              LEFT JOIN UNNEST(labels) AS nc ON nc.key = 'network-code'
              WHERE usage_start_time >= TIMESTAMP_SUB(
                  CURRENT_TIMESTAMP(), INTERVAL ${months * 30} DAY)
                AND cost > 0
              GROUP BY network_code, month
              ORDER BY month DESC, total_cost DESC
            `;
            const [rows] = await bigquery.query({ query });
            res.json({ costs: rows.length ? rows : MOCK_COSTS, mock: !rows.length });
          } catch (err: any) {
            logger.warn('BigQuery costs query failed, using mock data', err);
            res.json({ costs: MOCK_COSTS, mock: true });
          }
        });

        // Current-month summary per network-code (for dashboard cards)
        router.get('/costs/summary', async (_req, res) => {
          try {
            const query = `
              SELECT
                IFNULL(nc.value, 'untagged') AS network_code,
                SUM(cost) AS total_cost,
                MAX(currency) AS currency
              FROM \`${projectId}.${dataset}.${table}\`
              LEFT JOIN UNNEST(labels) AS nc ON nc.key = 'network-code'
              WHERE DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
                AND cost > 0
              GROUP BY network_code
              ORDER BY total_cost DESC
            `;
            const [rows] = await bigquery.query({ query });
            res.json({ summary: rows.length ? rows : MOCK_SUMMARY, mock: !rows.length });
          } catch (err: any) {
            logger.warn('BigQuery summary query failed, using mock data', err);
            res.json({ summary: MOCK_SUMMARY, mock: true });
          }
        });

        // Service-level breakdown for a specific network-code
        router.get('/costs/breakdown', async (req, res) => {
          const networkCode = req.query.networkCode as string;
          try {
            if (!networkCode) {
              res.status(400).json({ error: 'networkCode query param required' });
              return;
            }
            const query = `
              SELECT
                service.description AS service,
                SUM(cost) AS total_cost,
                MAX(currency) AS currency
              FROM \`${projectId}.${dataset}.${table}\`
              LEFT JOIN UNNEST(labels) AS nc ON nc.key = 'network-code'
              WHERE DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
                AND IFNULL(nc.value, 'untagged') = @networkCode
                AND cost > 0
              GROUP BY service
              ORDER BY total_cost DESC
            `;
            const [rows] = await bigquery.query({
              query,
              params: { networkCode },
            });
            const fallback = MOCK_BREAKDOWN[networkCode] || MOCK_BREAKDOWN['untagged'];
            res.json({ breakdown: rows.length ? rows : fallback, mock: !rows.length });
          } catch (err: any) {
            logger.warn('BigQuery breakdown query failed, using mock data', err);
            const fallback = MOCK_BREAKDOWN[networkCode] || MOCK_BREAKDOWN['untagged'];
            res.json({ breakdown: fallback, mock: true });
          }
        });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({
          path: '/costs',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/costs/summary',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/costs/breakdown',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
