import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { oidcAuthenticator } from '@backstage/plugin-auth-backend-module-oidc-provider';

const IDP_ROLES = new Set(['admin', 'platform', 'infra', 'viewer', 'dev', 'qa']);

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

              // Read roles from the ID token JWT directly (most reliable)
              let keycloakRoles: string[] = [];
              const idToken = (result.session as any)?.idToken;
              if (idToken) {
                try {
                  const payload = JSON.parse(
                    Buffer.from(idToken.split('.')[1], 'base64url').toString(),
                  );
                  keycloakRoles = payload?.realm_access?.roles ?? [];
                } catch {}
              }
              // Fallback to fullProfile claims
              if (!keycloakRoles.length) {
                const claims = (result.fullProfile as any)?._json ?? result.fullProfile as any;
                keycloakRoles = claims?.realm_access?.roles ?? [];
              }

              const idpRoles = keycloakRoles.filter(r => IDP_ROLES.has(r));

              const userRef = `user:default/${email
                .split('@')[0]
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-')}`;

              // Template-access groups control which scaffolder templates the user sees.
              // template-common   → provision-environment, provision-kafka-topics
              // template-deploy   → deploy-application (dev/qa/platform/admin, NOT infra)
              // template-infra    → all other templates (infra/platform/admin, NOT dev/qa)
              const templateGroups: string[] = [];
              const isAdmin    = idpRoles.includes('admin');
              const isPlatform = idpRoles.includes('platform');
              const isInfra    = idpRoles.includes('infra');
              const isDevOrQa  = idpRoles.includes('dev') || idpRoles.includes('qa');

              if (isAdmin || isPlatform) {
                templateGroups.push(
                  'group:default/template-common',
                  'group:default/template-deploy',
                  'group:default/template-infra',
                );
              } else if (isInfra) {
                templateGroups.push(
                  'group:default/template-common',
                  'group:default/template-infra',
                );
              } else if (isDevOrQa) {
                templateGroups.push(
                  'group:default/template-common',
                  'group:default/template-deploy',
                );
              }

              return ctx.issueToken({
                claims: {
                  sub: userRef,
                  ent: [
                    userRef,
                    ...idpRoles.map(r => `group:default/${r}`),
                    ...templateGroups,
                  ],
                },
              });
            },
          }),
        });
      },
    });
  },
});
