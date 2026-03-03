import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UIState {
  sidebarCollapsed: boolean
  theme: 'light' | 'dark'
  language: 'zh-CN' | 'en-US'
  notifications: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    description?: string
    duration?: number
  }>
  loading: boolean
  modalVisible: boolean
  modalContent: React.ReactNode | null
}

const initialState: UIState = {
  sidebarCollapsed: false,
  theme: 'light',
  language: 'zh-CN',
  notifications: [],
  loading: false,
  modalVisible: false,
  modalContent: null
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload
      localStorage.setItem('theme', action.payload)
    },
    setLanguage: (state, action: PayloadAction<'zh-CN' | 'en-US'>) => {
      state.language = action.payload
      localStorage.setItem('language', action.payload)
    },
    addNotification: (state, action: PayloadAction<{
      type: 'success' | 'error' | 'warning' | 'info'
      message: string
      description?: string
      duration?: number
    }>) => {
      const notification = {
        id: Date.now().toString(),
        ...action.payload,
        duration: action.payload.duration || 4.5
      }
      state.notifications.push(notification)
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(
        notification => notification.id !== action.payload
      )
    },
    clearNotifications: (state) => {
      state.notifications = []
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    showModal: (state, action: PayloadAction<React.ReactNode>) => {
      state.modalVisible = true
      state.modalContent = action.payload
    },
    hideModal: (state) => {
      state.modalVisible = false
      state.modalContent = null
    }
  }
})

export const {
  toggleSidebar,
  setSidebarCollapsed,
  setTheme,
  setLanguage,
  addNotification,
  removeNotification,
  clearNotifications,
  setLoading,
  showModal,
  hideModal
} = uiSlice.actions

export default uiSlice.reducer