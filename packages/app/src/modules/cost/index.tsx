import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';

const costInsightsPage = PageBlueprint.make({
  params: {
    path: '/cost-insights',
    loader: async () => {
      const { CostInsightsPage } = await import('./CostPage');
      return <CostInsightsPage />;
    },
  },
});

export const costPlugin = createFrontendPlugin({
  pluginId: 'cost-insights',
  extensions: [costInsightsPage],
});
