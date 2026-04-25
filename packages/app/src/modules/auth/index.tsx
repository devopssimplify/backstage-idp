import type { ComponentType } from 'react';
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { SignInPage } from '@backstage/core-components';
import type { SignInPageProps } from '@backstage/core-components';

export const authModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    SignInPageBlueprint.make({
      params: {
        loader: async (): Promise<ComponentType<SignInPageProps>> => {
          const OidcSignInPage: ComponentType<SignInPageProps> = props => (
            <SignInPage
              {...props}
              providers={['oidc']}
            />
          );
          return OidcSignInPage;
        },
      },
    }),
  ],
});
