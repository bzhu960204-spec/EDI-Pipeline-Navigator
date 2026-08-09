import { Button, Card, Form, Input, Typography, App as AntApp, theme } from 'antd';
import { IdcardOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register, type RegisterPayload } from '../../api/auth';
import { extractErrorMessage } from '../../api/client';
import { useAuthStore } from './authStore';
import { ThemeSwitcher } from '../../theme/ThemeSwitcher';

export function RegisterPage() {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const { token } = theme.useToken();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: RegisterPayload) => {
    setLoading(true);
    try {
      const res = await register(values);
      setAuth(res.token, res.user);
      message.success('Account created');
      navigate('/', { replace: true });
    } catch (error) {
      message.error(extractErrorMessage(error, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ ...styles.wrapper, background: token.colorBgLayout }}>
      <div style={styles.topBar}>
        <ThemeSwitcher />
      </div>
      <Card style={{ ...styles.card, boxShadow: token.boxShadowSecondary }} variant="borderless">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          Create your account
        </Typography.Title>
        <Typography.Text type="secondary">Join the EDI Pipeline Navigator</Typography.Text>
        <Form layout="vertical" onFinish={onFinish} style={{ marginTop: 24 }} requiredMark={false}>
          <Form.Item
            name="username"
            label="Username"
            rules={[{ required: true, min: 3, message: 'At least 3 characters' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="username" size="large" autoFocus />
          </Form.Item>
          <Form.Item name="displayName" label="Display name">
            <Input prefix={<IdcardOutlined />} placeholder="e.g. Jane Developer" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, min: 6, message: 'At least 6 characters' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            Register
          </Button>
        </Form>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Typography.Text type="secondary">Already have an account? </Typography.Text>
          <Link to="/login">Sign in</Link>
        </div>
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 24,
  },
  topBar: {
    position: 'absolute',
    top: 16,
    right: 24,
  },
  card: {
    width: 380,
  },
};
