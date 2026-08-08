import { Card, Col, Row, Statistic, Typography, Alert } from 'antd';
import { ApartmentOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../auth/authStore';
import { fetchArtifacts } from '../../api/artifacts';
import { fetchAllSteps, type WorkflowStep } from '../../api/workflow';

function countSteps(steps: WorkflowStep[]): number {
  return steps.reduce((sum, s) => sum + 1 + countSteps(s.children ?? []), 0);
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: artifacts = [] } = useQuery({ queryKey: ['artifacts'], queryFn: fetchArtifacts });
  const { data: tree = [] } = useQuery({ queryKey: ['workflow', 'all-steps'], queryFn: fetchAllSteps });

  return (
    <div>
      <Typography.Title level={4}>Welcome back, {user?.displayName}</Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="EDI Pipeline Navigator"
        description="Use the Procedure Orchestrator to navigate the workflow, and the Artifact Manager to organize your QA documents."
      />
      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic title="Workflow Steps" value={countSteps(tree)} prefix={<ApartmentOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic title="My Artifacts" value={artifacts.length} prefix={<FolderOpenOutlined />} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
