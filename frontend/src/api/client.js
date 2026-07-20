import axios from 'axios';

const TOKEN_KEY = 'la_token';

const api = axios.create({
  baseURL: '/api',
});

// Tự động đính kèm token đăng nhập (nếu có) vào mọi request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Nếu backend trả 401 (chưa đăng nhập / hết phiên), bắn sự kiện để AuthContext tự đăng xuất
// và điều hướng về màn hình Login, trừ chính request đăng nhập (sai mật khẩu cũng trả 401).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLoginRequest = error?.config?.url?.includes('/auth/login');
    if (error?.response?.status === 401 && !isLoginRequest) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default api;
