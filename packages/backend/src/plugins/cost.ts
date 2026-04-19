import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { Router } from 'express';
import { BigQuery } from '@google-cloud/bigquery';

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
            res.json({ costs: rows });
          } catch (err: any) {
            logger.error('BigQuery costs query failed', err);
            res.status(500).json({ error: err.message });
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
            res.json({ summary: rows });
          } catch (err: any) {
            logger.error('BigQuery summary query failed', err);
            res.status(500).json({ error: err.message });
          }
        });

        // Service-level breakdown for a specific network-code
        router.get('/costs/breakdown', async (req, res) => {
          try {
            const networkCode = req.query.networkCode as string;
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
            res.json({ breakdown: rows });
          } catch (err: any) {
            logger.error('BigQuery breakdown query failed', err);
            res.status(500).json({ error: err.message });
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
