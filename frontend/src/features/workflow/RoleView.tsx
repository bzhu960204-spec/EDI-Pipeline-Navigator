import { Card, Empty, List, Select, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchStepsByRole, type BusinessRole } from '../../api/workflow';

export function RoleView({ roles }: { roles: BusinessRole[] }) {
  const [roleId, setRoleId] = useState<number | null>(roles[0]?.id ?? null);
  const selectedRole = roles.find((r) => r.id === roleId) ?? null;

  const { data: steps = [], isLoading } = useQuery({
    queryKey: ['roles', roleId, 'steps'],
    queryFn: () => fetchStepsByRole(roleId as number),
    enabled: roleId != null,
  });

  return (
    <Card
      title={
        <Space>
          <span>Responsibilities by role</span>
          {selectedRole && <Tag color={selectedRole.color ?? undefined}>{selectedRole.name}</Tag>}
        </Space>
      }
      extra={
        <Select
          style={{ width: 200 }}
          value={roleId ?? undefined}
          placeholder="Select role"
          onChange={setRoleId}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
        />
      }
    >
      {roleId == null ? (
        <Empty description="Select a role" />
      ) : (
        <List
          loading={isLoading}
          dataSource={steps}
          locale={{ emptyText: 'No steps assigned to this role' }}
          renderItem={(step) => (
            <List.Item>
              <List.Item.Meta
                title={step.name}
                description={
                  step.description || (
                    <Typography.Text type="secondary">No description</Typography.Text>
                  )
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
