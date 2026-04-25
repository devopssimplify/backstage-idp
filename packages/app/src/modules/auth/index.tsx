import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { SignInPage } from '@backstage/core-components';
import { oidcAuthApiRef } from '@backstage/core-plugin-api';

export const authModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    SignInPageBlueprint.make({
      params: {
        component: ({ onSignInSuccess }) => (
          <SignInPage
            onSignInSuccess={onSignInSuccess}
            providers={[
              {
                id: 'oidc',
                title: 'Sign in with Keycloak',
                message: 'Sign in using your organization account',
                apiRef: oidcAuthApiRef,
              },
            ]}
          />
        ),
      },
    }),
  ],
});
