import databaseService from '@/database/DatabaseService'
import { User } from '@/types'
import bcrypt from 'bcryptjs'

// bcrypt 盐值轮数
const SALT_ROUNDS = 10

export interface CreateUserData {
  username: string
  password: string
  name: string
  email?: string
  phone?: string
}

export interface UpdateUserData {
  name?: string
  email?: string
  phone?: string
  is_active?: boolean
}

class UserService {
  /**
   * 用户登录验证
   */
  async authenticate(username: string, password: string): Promise<User | null> {
    try {
      const row = await databaseService.queryOne<any>(
        'SELECT id, username, password, name, email, phone, status, created_at, updated_at FROM users WHERE username = ? AND status = 1',
        [username]
      )
      if (!row) return null
      
      // 检查密码是否已哈希（以 $2a$ 或 $2b$ 开头是 bcrypt 哈希的特征）
      const isHashed = row.password && (row.password.startsWith('$2a$') || row.password.startsWith('$2b$'))
      
      let passwordMatch = false
      if (isHashed) {
        // 使用 bcrypt 比较密码
        passwordMatch = await bcrypt.compare(password, row.password)
      } else {
        // 兼容旧的明文密码（首次验证成功后会自动升级为哈希密码）
        passwordMatch = row.password === password
        if (passwordMatch) {
          // 自动升级为哈希密码
          const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)
          await databaseService.update(
            'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [hashedPassword, row.id]
          )
        }
      }
      
      if (!passwordMatch) return null
      
      const user: User = {
        id: row.id,
        username: row.username,
        password_hash: '', // 不返回密码哈希
        name: row.name,
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        status: row.status,
        is_active: row.status === 1,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
      return user
    } catch (error) {
      console.error('用户认证失败:', error)
      throw error
    }
  }

  /**
   * 获取所有用户
   */
  async getAllUsers(page = 1, pageSize = 20): Promise<{ data: User[]; total: number; page: number; pageSize: number }> {
    try {
      const countResult = await databaseService.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM users WHERE status = 1'
      )
      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize
      const rows = await databaseService.query<any>(
        `SELECT id, username, name, email, phone, status, created_at, updated_at 
         FROM users 
         WHERE status = 1 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [pageSize, offset]
      )
      const users: User[] = rows.map((r: any) => ({
        id: r.id,
        username: r.username,
        password_hash: '',
        name: r.name,
        email: r.email ?? undefined,
        phone: r.phone ?? undefined,
        status: r.status,
        is_active: r.status === 1,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }))
      return { data: users, total, page, pageSize }
    } catch (error) {
      console.error('获取用户列表失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取用户
   */
  async getUserById(id: number): Promise<User | null> {
    try {
      const r = await databaseService.queryOne<any>(
        'SELECT id, username, name, email, phone, status, created_at, updated_at FROM users WHERE id = ?',
        [id]
      )
      if (!r) return null
      return {
        id: r.id,
        username: r.username,
        password_hash: '',
        name: r.name,
        email: r.email ?? undefined,
        phone: r.phone ?? undefined,
        status: r.status,
        is_active: r.status === 1,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      throw error
    }
  }

  /**
   * 创建用户
   */
  async createUser(userData: CreateUserData): Promise<User> {
    try {
      const exists = await databaseService.queryOne<{ id: number }>(
        'SELECT id FROM users WHERE username = ?',
        [userData.username]
      )
      if (exists) {
        throw new Error('用户名已存在')
      }
      
      // 使用 bcrypt 哈希密码
      const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS)
      
      const userId = await databaseService.insert(
        'INSERT INTO users (username, password, name, email, phone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [userData.username, hashedPassword, userData.name, userData.email || null, userData.phone || null]
      )
      const newUser = await this.getUserById(userId)
      if (!newUser) throw new Error('创建用户失败')
      return newUser
    } catch (error) {
      console.error('创建用户失败:', error)
      throw error
    }
  }

  /**
   * 更新用户
   */
  async updateUser(id: number, data: UpdateUserData): Promise<User> {
    try {
      const fields: string[] = []
      const values: any[] = []

      if (data.name !== undefined) {
        fields.push('name = ?')
        values.push(data.name)
      }
      if (data.email !== undefined) {
        fields.push('email = ?')
        values.push(data.email)
      }
      if (data.phone !== undefined) {
        fields.push('phone = ?')
        values.push(data.phone)
      }
      if (data.is_active !== undefined) {
        fields.push('status = ?')
        values.push(data.is_active ? 1 : 0)
      }

      if (fields.length === 0) {
        throw new Error('没有要更新的字段')
      }

      fields.push('updated_at = CURRENT_TIMESTAMP')
      values.push(id)

      const affectedRows = await databaseService.update(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values
      )

      if (affectedRows === 0) {
        throw new Error('用户不存在')
      }

      const updatedUser = await this.getUserById(id)
      if (!updatedUser) {
        throw new Error('更新用户失败')
      }

      return updatedUser
    } catch (error) {
      console.error('更新用户失败:', error)
      throw error
    }
  }

  /**
   * 删除用户（软删除）
   */
  async deleteUser(id: number): Promise<void> {
    try {
      const affectedRows = await databaseService.update(
        'UPDATE users SET status = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      )

      if (affectedRows === 0) {
        throw new Error('用户不存在')
      }
    } catch (error) {
      console.error('删除用户失败:', error)
      throw error
    }
  }

  /**
   * 修改密码
   */
  async changePassword(id: number, newPassword: string): Promise<void> {
    try {
      // 使用 bcrypt 哈希新密码
      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS)
      
      const affectedRows = await databaseService.update(
        'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedPassword, id]
      )

      if (affectedRows === 0) {
        throw new Error('用户不存在')
      }
    } catch (error) {
      console.error('修改密码失败:', error)
      throw error
    }
  }
}

export default new UserService()
