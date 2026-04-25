import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import kubernetesPlugin from '@backstage/plugin-kubernetes/alpha';
import { navModule } from './modules/nav';
import { costPlugin } from './modules/cost';
import { idpAssistantPlugin } from './modules/idp-assistant';
import { authModule } from './modules/auth';

export default createApp({
  features: [catalogPlugin, kubernetesPlugin, navModule, costPlugin, idpAssistantPlugin, authModule],
});
