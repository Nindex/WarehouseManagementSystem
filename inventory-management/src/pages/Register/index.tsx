import React from 'react'
import { Form, Input, Button, Card, Typography, App } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '@/services/api'

const { Title } = Typography

const RegisterPage: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { message } = App.useApp()

  const onFinish = async (values: any) => {
    try {
      const res = await authAPI.register({
        username: values.username,
        password: values.password,
        name: values.name,
        email: values.email,
        phone: values.phone,
      })
      if (res.success) {
        message.success('注册成功，请登录')
        navigate('/login')
      } else {
        message.error(res.error || '注册失败')
      }
    } catch (e) {
      message.error('注册失败，请重试')
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #003366 0%, #004080 100%)',
      }}
    >
      <Card
        style={{
          width: 520,
          boxShadow: '0 8px 32px rgba(0, 51, 102, 0.3)',
          borderRadius: 12,
        }}
        styles={{ body: { padding: '32px 24px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ color: '#003366', margin: 0 }}>
            注册账户
          </Title>
        </div>
        <Form form={form} layout="vertical" size="large" onFinish={onFinish}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input
              prefix={<MailOutlined />}
              placeholder="邮箱"
              type="email"
            />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input prefix={<PhoneOutlined />} placeholder="电话" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              style={{
                height: 48,
                fontSize: 16,
                background: '#003366',
                borderColor: '#003366',
              }}
            >
              注册
            </Button>
          </Form.Item>
          <Form.Item>
            <Button
              type="link"
              block
              onClick={() => navigate('/login')}
              style={{ color: '#003366' }}
            >
              返回登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default RegisterPage
