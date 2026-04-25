import { createBackendModule } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  AuthorizeResult,
  isResourcePermission,
  type PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  catalogConditions,
  createCatalogConditionalDecision,
} from '@backstage/plugin-catalog-backend/alpha';
import type {
  PermissionPolicy,
  PolicyQuery,
} from '@backstage/plugin-permission-node';
import type { BackstageIdentityResponse } from '@backstage/plugin-auth-node';

const ADMIN_ONLY = new Set(['idp.admin.use']);
const VIEWER_DENIED = new Set([
  'idp.cost.view',
  'idp.assistant.use',
  'idp.infra.provision',
]);

class IdpPermissionPolicy implements PermissionPolicy {
  private hasRole(user: BackstageIdentityResponse, role: string): boolean {
    return user.identity.ownershipEntityRefs.includes(`group:default/${role}`);
  }

  async handle(
    request: PolicyQuery,
    user?: BackstageIdentityResponse,
  ): Promise<PolicyDecision> {
    if (!user || user.identity.userEntityRef === 'user:default/guest') {
      return { result: AuthorizeResult.ALLOW };
    }

    const isAdmin = this.hasRole(user, 'admin');
    const isPlatform = this.hasRole(user, 'platform');

    // Admin and platform see everything
    if (isAdmin || isPlatform) return { result: AuthorizeResult.ALLOW };

    const name = request.permission.name;

    // Admin-only actions
    if (ADMIN_ONLY.has(name)) return { result: AuthorizeResult.DENY };

    const isInfra = this.hasRole(user, 'infra');

    // Viewer-restricted actions
    if (VIEWER_DENIED.has(name) && !isInfra) {
      return { result: AuthorizeResult.DENY };
    }

    // Catalog entity filtering — restrict template visibility by spec.owner
    if (isResourcePermission(request.permission, 'catalog-entity')) {
      return createCatalogConditionalDecision(request.permission, {
        anyOf: [
          // Non-template entities: always visible
          { not: catalogConditions.isEntityKind({ kinds: ['Template'] }) },
          // Template entities: check if user owns them (via template-access groups)
          catalogConditions.isEntityOwner({
            claims: user.identity.ownershipEntityRefs,
          }),
        ],
      });
    }

    return { result: AuthorizeResult.ALLOW };
  }
}

export const permissionModuleIdpPolicy = createBackendModule({
  pluginId: 'permission',
  moduleId: 'idp-policy',
  register(reg) {
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(new IdpPermissionPolicy());
      },
    });
  },
});
