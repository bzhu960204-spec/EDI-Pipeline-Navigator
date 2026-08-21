import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result, Typography } from 'antd';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error captured by ErrorBoundary:', error, info);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Result
        status="error"
        title="页面出现了一点问题"
        subTitle="操作触发了一个未处理的错误。你可以尝试重试当前视图，或重新加载页面。"
        extra={[
          <Button type="primary" key="retry" onClick={this.handleReset}>
            重试
          </Button>,
          <Button key="reload" onClick={this.handleReload}>
            重新加载页面
          </Button>,
        ]}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {error.message}
        </Typography.Paragraph>
      </Result>
    );
  }
}
