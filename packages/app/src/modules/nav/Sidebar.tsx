import { useEffect, useState } from 'react';
import {
  Sidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarScrollWrapper,
  SidebarSpace,
} from '@backstage/core-components';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { SidebarLogo } from './SidebarLogo';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import DeleteIcon from '@material-ui/icons/Delete';
import StorageIcon from '@material-ui/icons/Storage';
import HistoryIcon from '@material-ui/icons/History';
import MoneyIcon from '@material-ui/icons/AttachMoney';
import AssistantIcon from '@material-ui/icons/EmojiObjects';
import AddBoxIcon from '@material-ui/icons/AddBox';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import { SidebarSearchModal } from '@backstage/plugin-search';
import { UserSettingsSignInAvatar } from '@backstage/plugin-user-settings';
import { NotificationsSidebarItem } from '@backstage/plugin-notifications';

type RoleState = {
  loaded: boolean;
  isGuest: boolean;
  isAdmin: boolean;
  isPlatform: boolean;
  isInfra: boolean;
  isDev: boolean;
  isQa: boolean;
};

function useIdpRoles(): RoleState {
  const identityApi = useApi(identityApiRef);
  const [state, setState] = useState<RoleState>({
    loaded: false,
    isGuest: false,
    isAdmin: false,
    isPlatform: false,
    isInfra: false,
    isDev: false,
    isQa: false,
  });

  useEffect(() => {
    identityApi.getBackstageIdentity().then(identity => {
      const refs = identity.ownershipEntityRefs;
      const isGuest = identity.userEntityRef === 'user:default/guest';
      const groups = refs
        .filter(r => r.startsWith('group:default/'))
        .map(r => r.slice('group:default/'.length));

      setState({
        loaded: true,
        isGuest,
        isAdmin: groups.includes('admin'),
        isPlatform: groups.includes('platform'),
        isInfra: groups.includes('infra'),
        isDev: groups.includes('dev'),
        isQa: groups.includes('qa'),
      });
    });
  }, [identityApi]);

  return state;
}

export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ navItems }) => {
      const nav = navItems.withComponent(item => (
        <SidebarItem icon={() => item.icon} to={item.href} text={item.title} />
      ));

      nav.take('page:search');

      const { loaded, isGuest, isAdmin, isPlatform, isInfra, isDev, isQa } = useIdpRoles();

      const showAll = !loaded || isGuest;

      // Role gates
      const canAssist        = showAll || isAdmin || isPlatform;
      const canViewCost      = showAll || isAdmin || isPlatform || isInfra;
      const canProvisionInfra = showAll || isAdmin || isPlatform || isInfra;
      const canDeployAndEnv  = showAll || isAdmin || isPlatform || isDev || isQa;
      const canDeleteInfra   = showAll || isAdmin || isInfra;
      const canDeleteEnv     = showAll || isAdmin;

      return (
        <Sidebar>
          <SidebarLogo />
          <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
            <SidebarSearchModal />
          </SidebarGroup>
          <SidebarDivider />
          <SidebarGroup label="Menu" icon={<MenuIcon />}>
            {nav.take('page:catalog')}
            <SidebarDivider />
            <SidebarScrollWrapper>
              {nav.rest({ sortBy: 'title' })}
            </SidebarScrollWrapper>
          </SidebarGroup>

          {/* IDP Assistant — admin and platform only */}
          {canAssist && (
            <>
              <SidebarDivider />
              <SidebarGroup label="IDP Assistant" icon={<AssistantIcon />}>
                <SidebarItem icon={AssistantIcon} to="/idp-assistant" text="IDP Assistant" />
              </SidebarGroup>
            </>
          )}

          {/* Monitoring — visible to all */}
          <SidebarDivider />
          <SidebarGroup label="IDP Monitoring" icon={<StorageIcon />}>
            <SidebarItem icon={StorageIcon} to="/?filters[kind]=system&filters[user]=all" text="By Network Code" />
            <SidebarItem icon={StorageIcon} to="/?filters[kind]=resource&filters[user]=all" text="IDP Resources" />
            <SidebarItem icon={HistoryIcon} to="/create/tasks" text="Audit Trail" />
            {canViewCost && (
              <SidebarItem icon={MoneyIcon} to="/cost-insights" text="Cost Insights" />
            )}
          </SidebarGroup>

          {/* Deploy — dev, qa, platform, admin */}
          {canDeployAndEnv && (
            <>
              <SidebarDivider />
              <SidebarGroup label="Deploy" icon={<CloudUploadIcon />}>
                <SidebarItem icon={AddBoxIcon} to="/create/templates/default/provision-environment" text="New Environment" />
                <SidebarItem icon={CloudUploadIcon} to="/create/templates/default/deploy-application" text="Deploy Application" />
              </SidebarGroup>
            </>
          )}

          {/* Provision Infra — infra, platform, admin */}
          {canProvisionInfra && (
            <>
              <SidebarDivider />
              <SidebarGroup label="Provision Infra" icon={<AddBoxIcon />}>
                <SidebarItem icon={AddBoxIcon} to="/create/templates/default/provision-cockroachdb" text="New CockroachDB" />
                <SidebarItem icon={AddBoxIcon} to="/create/templates/default/provision-kafka" text="New Kafka" />
                <SidebarItem icon={AddBoxIcon} to="/create/templates/default/provision-kafka-topics" text="New Kafka Topics" />
              </SidebarGroup>
            </>
          )}

          {/* Administration — delete actions, role-gated per item */}
          {(canDeleteEnv || canDeleteInfra) && (
            <>
              <SidebarDivider />
              <SidebarGroup label="Administration" icon={<DeleteIcon />}>
                {canDeleteEnv && (
                  <SidebarItem icon={DeleteIcon} to="/create/templates/default/delete-environment" text="Delete Environment" />
                )}
                {canDeleteInfra && (
                  <>
                    <SidebarItem icon={DeleteIcon} to="/create/templates/default/delete-infrastructure" text="Delete Infrastructure" />
                    <SidebarItem icon={DeleteIcon} to="/create/templates/default/delete-kafka-cluster" text="Delete Kafka Cluster" />
                    <SidebarItem icon={DeleteIcon} to="/create/templates/default/delete-kafka-topics" text="Delete Kafka Topics" />
                  </>
                )}
              </SidebarGroup>
            </>
          )}

          <SidebarSpace />
          <SidebarDivider />
          <NotificationsSidebarItem />
          <SidebarDivider />
          <SidebarGroup label="Settings" icon={<UserSettingsSignInAvatar />} to="/settings">
            {nav.take('page:app-visualizer')}
            {nav.take('page:user-settings')}
          </SidebarGroup>
        </Sidebar>
      );
    },
  },
});
