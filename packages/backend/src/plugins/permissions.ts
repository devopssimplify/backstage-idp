import { createBackendModule } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  AuthorizeResult,
  type PolicyDecision,
} from '@backstage/plugin-permission-common';
import type {
  PermissionPolicy,
  PolicyQuery,
} from '@backstage/plugin-permission-node';
import type { BackstageIdentityResponse } from '@backstage/plugin-auth-node';

// Permissions only admin can use
const ADMIN_ONLY = new Set(['idp.admin.use']);

// Permissions denied to viewer (allowed to infra, platform, admin)
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
    // Guest (dev mode) or unauthenticated — allow everything
    if (!user || user.identity.userEntityRef === 'user:default/guest') {
      return { result: AuthorizeResult.ALLOW };
    }

    const isAdmin = this.hasRole(user, 'admin');
    if (isAdmin) return { result: AuthorizeResult.ALLOW };

    const name = request.permission.name;

    // Admin-only actions
    if (ADMIN_ONLY.has(name)) {
      return { result: AuthorizeResult.DENY };
    }

    // Viewer-restricted actions
    const isPlatform = this.hasRole(user, 'platform');
    const isInfra = this.hasRole(user, 'infra');
    if (VIEWER_DENIED.has(name) && !isPlatform && !isInfra) {
      return { result: AuthorizeResult.DENY };
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
