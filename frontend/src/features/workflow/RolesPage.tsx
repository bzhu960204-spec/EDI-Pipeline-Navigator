import { Col, Row, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { fetchRoles } from '../../api/workflow';
import { useAuthStore } from '../auth/authStore';
import { RoleManagerPanel } from './RoleManagerPanel';
import { RoleView } from './RoleView';

export function RolesPage() {
  const admin = !!useAuthStore((s) => s.user);
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>
        Roles
      </Typography.Title>
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <RoleManagerPanel roles={roles} editable={admin} />
        </Col>
        <Col xs={24} lg={12}>
          <RoleView roles={roles} />
        </Col>
      </Row>
    </div>
  );
}
