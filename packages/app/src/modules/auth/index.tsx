import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { ProxiedSignInPage } from '@backstage/core-components';

export const authModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    SignInPageBlueprint.make({
      params: {
        loader: async () => {
          const OidcSignInPage = (props: any) => (
            <ProxiedSignInPage {...props} provider="oidc" />
          );
          return OidcSignInPage;
        },
      },
    }),
  ],
});
