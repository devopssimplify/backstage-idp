import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { oidcAuthenticator } from '@backstage/plugin-auth-backend-module-oidc-provider';

const IDP_ROLES = new Set(['admin', 'platform', 'infra', 'viewer']);

export const keycloakAuthModule = createBackendModule({
  pluginId: 'auth',
  moduleId: 'keycloak-oidc',
  register(reg) {
    reg.registerInit({
      deps: { providers: authProvidersExtensionPoint },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'oidc',
          factory: createOAuthProviderFactory({
            authenticator: oidcAuthenticator,
            async signInResolver(info, ctx) {
              const { profile, result } = info;
              const email = profile.email;
              if (!email) throw new Error('No email in OIDC profile');

              // Keycloak puts roles in realm_access.roles of the JWT claims
              const claims = (result.fullProfile as any)?._json ?? result.fullProfile as any;
              const keycloakRoles: string[] =
                claims?.realm_access?.roles ?? [];

              const idpRoles = keycloakRoles.filter(r => IDP_ROLES.has(r));

              const userRef = `user:default/${email
                .split('@')[0]
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-')}`;

              return ctx.issueToken({
                claims: {
                  sub: userRef,
                  ent: [userRef, ...idpRoles.map(r => `group:default/${r}`)],
                },
              });
            },
          }),
        });
      },
    });
  },
});
