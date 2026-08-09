import { useMemo } from 'react';
import { Layout, Menu, Typography, Dropdown, Avatar, Space, Tag } from 'antd';
import {
  ApartmentOutlined,
  FolderOpenOutlined,
  DashboardOutlined,
  LogoutOutlined,
  UserOutlined,
  PartitionOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, isAdmin } from '../features/auth/authStore';
import { ThemeSwitcher } from '../theme/ThemeSwitcher';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clear } = useAuthStore();

  const selectedKey = useMemo(() => {
    if (location.pathname.startsWith('/workflow/roles')) return '/workflow/roles';
    if (location.pathname.startsWith('/workflow')) return '/workflow';
    if (location.pathname.startsWith('/artifacts')) return '/artifacts';
    return '/';
  }, [location.pathname]);

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    {
      key: 'procedure',
      icon: <ApartmentOutlined />,
      label: 'Procedure Orchestrator',
      children: [
        { key: '/workflow', icon: <PartitionOutlined />, label: 'Workflows' },
        { key: '/workflow/roles', icon: <TeamOutlined />, label: 'Roles' },
      ],
    },
    { key: '/artifacts', icon: <FolderOpenOutlined />, label: 'Artifact Manager' },
  ];

  const handleLogout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsible theme="dark">
        <div style={styles.logo}>
          <Typography.Text style={{ color: '#fff', fontWeight: 600 }}>EDI Nav</Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['procedure']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={styles.header}>
          <ThemeSwitcher />
          <Dropdown
            menu={{
              items: [
                { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', onClick: handleLogout },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>{user?.displayName}</span>
              {isAdmin(user) && <Tag color="gold">ADMIN</Tag>}
            </Space>
          </Dropdown>
        </Header>
        <Content style={styles.content}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  logo: {
    height: 48,
    margin: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    background: 'var(--ant-color-bg-container, #fff)',
  },
  content: {
    margin: 16,
    padding: 24,
    minHeight: 280,
  },
};
