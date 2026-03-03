import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { authAPI } from '@/services/api'
import { User } from '@/types'

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  token: string | null
  users: User[]
  loading: boolean
  error: string | null
}

// 异步登录操作
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { username: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authAPI.login(credentials.username, credentials.password)
      
      if (!response.success || !response.data) {
        throw new Error(response.error || '用户名或密码错误')
      }
      
      const user = response.data
      const token = 'jwt-token-' + Date.now() + '-' + user.id
      
      sessionStorage.setItem('token', token)
      sessionStorage.setItem('user', JSON.stringify(user))
      
      return { user, token }
    } catch (error: any) {
      return rejectWithValue(error.message)
    }
  }
)

// 获取用户列表
export const fetchUsers = createAsyncThunk(
  'auth/fetchUsers',
  async (_, { rejectWithValue }) => {
    try {
      // 这里需要实现获取用户列表的API
      // 暂时返回空数组，实际应用中需要管理员权限
      return []
    } catch (error: any) {
      return rejectWithValue(error.message)
    }
  }
)

// 初始化状态
const loadAuthFromStorage = (): AuthState => {
  const token = sessionStorage.getItem('token')
  const userStr = sessionStorage.getItem('user')
  
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr)
      return {
        isAuthenticated: true,
        user,
        token,
        users: [],
        loading: false,
        error: null
      }
    } catch {
      // 如果解析失败，清除存储
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
    }
  }
  
  return {
    isAuthenticated: false,
    user: null,
    token: null,
    users: [],
    loading: false,
    error: null
  }
}

const initialState: AuthState = loadAuthFromStorage()

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.isAuthenticated = false
      state.user = null
      state.token = null
      state.error = null
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
    },
    clearError: (state) => {
      state.error = null
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload
      sessionStorage.setItem('user', JSON.stringify(action.payload))
    }
  },
  extraReducers: (builder) => {
    builder
      // 登录处理
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.isAuthenticated = true
        state.user = action.payload.user
        state.token = action.payload.token
        state.error = null
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.isAuthenticated = false
        state.user = null
        state.token = null
        state.error = action.payload as string
      })
      // 获取用户列表
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false
        state.users = action.payload
        state.error = null
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
  }
})

export const { logout, clearError, setUser } = authSlice.actions
export default authSlice.reducer
