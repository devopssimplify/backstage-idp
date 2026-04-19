import {
  createFrontendModule,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';

const costInsightsPage = PageBlueprint.make({
  params: {
    defaultPath: '/cost-insights',
    component: async () => {
      const { CostInsightsPage } = await import('./CostPage');
      return CostInsightsPage;
    },
  },
});

export const costModule = createFrontendModule({
  pluginId: 'cost-insights',
  extensions: [costInsightsPage],
});
