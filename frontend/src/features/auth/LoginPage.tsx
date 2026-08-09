import { Button, Card, Form, Input, Typography, App as AntApp, theme } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { login, type LoginPayload } from '../../api/auth';
import { extractErrorMessage } from '../../api/client';
import { useAuthStore } from './authStore';
import { ThemeSwitcher } from '../../theme/ThemeSwitcher';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const { token } = theme.useToken();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  useEffect(() => {
    if (sessionStorage.getItem('edinav-session-expired')) {
      sessionStorage.removeItem('edinav-session-expired');
      message.warning('Your session has expired. Please sign in again.');
    }
  }, [message]);

  const onFinish = async (values: LoginPayload) => {
    setLoading(true);
    try {
      const res = await login(values);
      setAuth(res.token, res.user);
      message.success(`Welcome, ${res.user.displayName}`);
      navigate(from, { replace: true });
    } catch (error) {
      message.error(extractErrorMessage(error, 'Login failed'));
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
          EDI Pipeline Navigator
        </Typography.Title>
        <Typography.Text type="secondary">Sign in to continue</Typography.Text>
        <Form layout="vertical" onFinish={onFinish} style={{ marginTop: 24 }} requiredMark={false}>
          <Form.Item
            name="username"
            label="Username"
            rules={[{ required: true, message: 'Please enter your username' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="username" size="large" autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            Sign in
          </Button>
        </Form>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Typography.Text type="secondary">No account? </Typography.Text>
          <Link to="/register">Register</Link>
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
