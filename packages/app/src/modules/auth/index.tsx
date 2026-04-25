import { createFrontendModule, ApiBlueprint, createApiRef, createApiFactory, discoveryApiRef, oauthRequestApiRef } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { OAuth2 } from '@backstage/core-app-api';
import { SignInPage } from '@backstage/core-components';
import type { OAuthApi, OpenIdConnectApi, ProfileInfoApi, BackstageIdentityApi, SessionApi } from '@backstage/frontend-plugin-api';

export const oidcAuthApiRef = createApiRef<OAuthApi & OpenIdConnectApi & ProfileInfoApi & BackstageIdentityApi & SessionApi>({
  id: 'auth.oidc',
});

export const authModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    ApiBlueprint.make({
      name: 'oidc',
      params: defineParams => defineParams(createApiFactory({
        api: oidcAuthApiRef,
        deps: {
          discoveryApi: discoveryApiRef,
          oauthRequestApi: oauthRequestApiRef,
        },
        factory: ({ discoveryApi, oauthRequestApi }) =>
          OAuth2.create({
            discoveryApi,
            oauthRequestApi,
            provider: {
              id: 'oidc',
              title: 'Keycloak',
              icon: () => null,
            },
            defaultScopes: ['openid', 'profile', 'email'],
            environment: 'production',
          }),
      })),
    }),
    SignInPageBlueprint.make({
      params: {
        loader: async () => {
          const OidcSignInPage = (props: any) => (
            <SignInPage
              {...props}
              auto
              provider={{
                id: 'oidc',
                title: 'Keycloak',
                message: 'Sign in using your Keycloak account',
                apiRef: oidcAuthApiRef,
              }}
            />
          );
          return OidcSignInPage;
        },
      },
    }),
  ],
});
