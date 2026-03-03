import React from 'react'
import { Result, Button } from 'antd'

type Props = { children: React.ReactNode }

type State = { hasError: boolean; error?: any }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error }
  }
  componentDidCatch(error: any, info: any) {
    try {
      console.error('渲染器错误捕获', {
        error: error?.toString(),
        errorMessage: error?.message,
        errorStack: error?.stack,
        componentStack: info?.componentStack,
        errorName: error?.name
      })
      // 尝试向主进程发送错误信息（如果可用）
      if (typeof window !== 'undefined' && (window as any).electron?.electronAPI) {
        try {
          // 可以添加一个 IPC 调用来向主进程报告错误
          console.error('渲染进程错误详情已记录到控制台')
        } catch (e) {
          // 忽略 IPC 错误
        }
      }
    } catch (e) {
      console.error('无法记录错误信息', e)
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="页面加载失败"
          subTitle={String(this.state.error || '')}
          extra={<Button onClick={() => this.setState({ hasError: false, error: undefined })}>重试</Button>}
        />
      )
    }
    return this.props.children as any
  }
}
