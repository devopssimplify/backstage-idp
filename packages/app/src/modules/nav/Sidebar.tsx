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
import { SidebarSearchModal } from '@backstage/plugin-search';
import { UserSettingsSignInAvatar } from '@backstage/plugin-user-settings';
import { NotificationsSidebarItem } from '@backstage/plugin-notifications';

type RoleState = {
  loaded: boolean;
  isGuest: boolean;
  isAdmin: boolean;
  isPlatform: boolean;
  isInfra: boolean;
};

function useIdpRoles(): RoleState {
  const identityApi = useApi(identityApiRef);
  const [state, setState] = useState<RoleState>({
    loaded: false,
    isGuest: false,
    isAdmin: false,
    isPlatform: false,
    isInfra: false,
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

      // Skipped items
      nav.take('page:search');

      const { loaded, isGuest, isAdmin, isPlatform, isInfra } = useIdpRoles();

      // While loading: show everything (avoids flash of hidden items)
      // Guest (dev mode): show everything
      const showAll = !loaded || isGuest;

      // Role gates
      const canProvision = showAll || isAdmin || isPlatform || isInfra;
      const canViewCost   = showAll || isAdmin || isPlatform || isInfra;
      const canAssist     = showAll || isAdmin || isPlatform || isInfra;
      const canDelete     = showAll || isAdmin;

      return (
        <Sidebar>
          <SidebarLogo />
          <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
            <SidebarSearchModal />
          </SidebarGroup>
          <SidebarDivider />
          <SidebarGroup label="Menu" icon={<MenuIcon />}>
            {nav.take('page:catalog')}
            {canProvision && nav.take('page:scaffolder')}
            <SidebarDivider />
            <SidebarScrollWrapper>
              {nav.rest({ sortBy: 'title' })}
            </SidebarScrollWrapper>
          </SidebarGroup>

          {canAssist && (
            <>
              <SidebarDivider />
              <SidebarGroup label="IDP Assistant" icon={<AssistantIcon />}>
                <SidebarItem
                  icon={AssistantIcon}
                  to="/idp-assistant"
                  text="IDP Assistant"
                />
              </SidebarGroup>
            </>
          )}

          <SidebarDivider />
          <SidebarGroup label="IDP Monitoring" icon={<StorageIcon />}>
            <SidebarItem
              icon={StorageIcon}
              to="/?filters[kind]=system&filters[user]=all"
              text="By Network Code"
            />
            <SidebarItem
              icon={StorageIcon}
              to="/?filters[kind]=resource&filters[user]=all"
              text="IDP Resources"
            />
            <SidebarItem
              icon={HistoryIcon}
              to="/create/tasks"
              text="Audit Trail"
            />
            {canViewCost && (
              <SidebarItem
                icon={MoneyIcon}
                to="/cost-insights"
                text="Cost Insights"
              />
            )}
          </SidebarGroup>

          {canProvision && (
            <>
              <SidebarDivider />
              <SidebarGroup label="Provision" icon={<AddBoxIcon />}>
                <SidebarItem
                  icon={AddBoxIcon}
                  to="/create/templates/default/provision-environment"
                  text="New Environment"
                />
                <SidebarItem
                  icon={AddBoxIcon}
                  to="/create/templates/default/provision-cockroachdb"
                  text="New CockroachDB"
                />
                <SidebarItem
                  icon={AddBoxIcon}
                  to="/create/templates/default/provision-kafka"
                  text="New Kafka"
                />
              </SidebarGroup>
            </>
          )}

          {canDelete && (
            <>
              <SidebarDivider />
              <SidebarGroup label="Administration" icon={<DeleteIcon />}>
                <SidebarItem
                  icon={DeleteIcon}
                  to="/create/templates/default/delete-environment"
                  text="Delete Environment"
                />
                <SidebarItem
                  icon={DeleteIcon}
                  to="/create/templates/default/delete-infrastructure"
                  text="Delete Infrastructure"
                />
              </SidebarGroup>
            </>
          )}

          <SidebarSpace />
          <SidebarDivider />
          <NotificationsSidebarItem />
          <SidebarDivider />
          <SidebarGroup
            label="Settings"
            icon={<UserSettingsSignInAvatar />}
            to="/settings"
          >
            {nav.take('page:app-visualizer')}
            {nav.take('page:user-settings')}
          </SidebarGroup>
        </Sidebar>
      );
    },
  },
});
