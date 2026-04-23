import { createFrontendPlugin, PageBlueprint } from '@backstage/frontend-plugin-api';

const idpAssistantPage = PageBlueprint.make({
  params: {
    path: '/idp-assistant',
    loader: async () => {
      const { IdpAssistantPage } = await import('./IdpAssistantPage');
      return <IdpAssistantPage />;
    },
  },
});

export const idpAssistantPlugin = createFrontendPlugin({
  pluginId: 'idp-assistant',
  extensions: [idpAssistantPage],
});
