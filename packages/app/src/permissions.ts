import { createPermission } from '@backstage/plugin-permission-common';

export const adminUsePermission = createPermission({
  name: 'idp.admin.use',
  attributes: { action: 'use' },
});

export const costViewPermission = createPermission({
  name: 'idp.cost.view',
  attributes: { action: 'read' },
});

export const assistantUsePermission = createPermission({
  name: 'idp.assistant.use',
  attributes: { action: 'use' },
});

export const infraProvisionPermission = createPermission({
  name: 'idp.infra.provision',
  attributes: { action: 'use' },
});
