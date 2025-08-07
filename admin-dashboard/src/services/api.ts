import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { 
  User, 
  LoginCredentials, 
  AuthResponse, 
  Device, 
  Policy, 
  RemoteCommand, 
  DashboardStats,
  ApiResponse,
  PaginatedResponse,
  CommandType,
  CommandParameters,
  PolicyType,
  PolicyRules
} from '@/types';

class ApiService {
  private axiosInstance: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: '/api', // Proxied through Vite to http://localhost:5001/api
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor to add auth token
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid - redirect to login
          this.clearToken();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Token management
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('mdm_token', token);
  }

  getToken(): string | null {
    if (this.token) return this.token;
    
    const stored = localStorage.getItem('mdm_token');
    if (stored) {
      this.token = stored;
      return stored;
    }
    
    return null;
  }

  clearToken(): void {
    this.token = null;
    localStorage.removeItem('mdm_token');
  }

  // Authentication API
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await this.axiosInstance.post<AuthResponse>('/auth/login', credentials);
    this.setToken(response.data.token);
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.axiosInstance.post('/auth/logout');
    } finally {
      this.clearToken();
    }
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.axiosInstance.get<{ user: User }>('/auth/profile');
    return response.data.user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.axiosInstance.post('/auth/change-password', {
      currentPassword,
      newPassword
    });
  }

  // Users API
  async getUsers(params?: {
    page?: number;
    limit?: number;
    role?: string;
    isActive?: boolean;
    search?: string;
  }): Promise<PaginatedResponse<User>> {
    const response = await this.axiosInstance.get<PaginatedResponse<User>>('/auth/users', {
      params
    });
    return response.data;
  }

  async getUserById(id: string): Promise<User> {
    const response = await this.axiosInstance.get<{ user: User }>(`/auth/users/${id}`);
    return response.data.user;
  }

  async createUser(userData: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
  }): Promise<User> {
    const response = await this.axiosInstance.post<{ user: User }>('/auth/register', userData);
    return response.data.user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const response = await this.axiosInstance.put<{ user: User }>(`/auth/users/${id}`, updates);
    return response.data.user;
  }

  async deleteUser(id: string): Promise<void> {
    await this.axiosInstance.delete(`/auth/users/${id}`);
  }

  // Devices API
  async getDevices(params?: {
    page?: number;
    limit?: number;
    status?: string;
    manufacturer?: string;
    search?: string;
  }): Promise<PaginatedResponse<Device>> {
    const response = await this.axiosInstance.get<PaginatedResponse<Device>>('/devices', {
      params
    });
    return response.data;
  }

  async getDeviceById(id: string): Promise<Device> {
    const response = await this.axiosInstance.get<Device>(`/devices/${id}`);
    return response.data;
  }

  async enrollDevice(deviceData: {
    deviceId: string;
    manufacturer: string;
    model: string;
    androidVersion: string;
    sdkVersion: number;
    fingerprint: string;
  }): Promise<Device> {
    const response = await this.axiosInstance.post<Device>('/devices/enroll', deviceData);
    return response.data;
  }

  async updateDeviceStatus(deviceId: string, status: string, location?: any): Promise<Device> {
    const response = await this.axiosInstance.put<Device>(`/devices/${deviceId}/status`, {
      status,
      location
    });
    return response.data;
  }

  // Policies API
  async getPolicies(params?: {
    page?: number;
    limit?: number;
    type?: PolicyType;
    isActive?: boolean;
  }): Promise<PaginatedResponse<Policy>> {
    const response = await this.axiosInstance.get<PaginatedResponse<Policy>>('/policies', {
      params
    });
    return response.data;
  }

  async getPolicyById(id: string): Promise<Policy> {
    const response = await this.axiosInstance.get<Policy>(`/policies/${id}`);
    return response.data;
  }

  async createPolicy(policyData: {
    name: string;
    description: string;
    type: PolicyType;
    rules: PolicyRules;
    targetDevices?: string[];
    priority?: number;
    isActive?: boolean;
  }): Promise<Policy> {
    const response = await this.axiosInstance.post<Policy>('/policies', policyData);
    return response.data;
  }

  async updatePolicy(id: string, updates: Partial<Policy>): Promise<Policy> {
    const response = await this.axiosInstance.put<Policy>(`/policies/${id}`, updates);
    return response.data;
  }

  async deletePolicy(id: string, force?: boolean): Promise<void> {
    await this.axiosInstance.delete(`/policies/${id}`, {
      params: { force }
    });
  }

  async applyPolicyToDevices(policyId: string, deviceIds: string[]): Promise<void> {
    await this.axiosInstance.post(`/policies/${policyId}/apply`, { deviceIds });
  }

  // Commands API
  async getCommands(params?: {
    page?: number;
    limit?: number;
    deviceId?: string;
    command?: CommandType;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedResponse<RemoteCommand>> {
    const response = await this.axiosInstance.get<PaginatedResponse<RemoteCommand>>('/commands', {
      params
    });
    return response.data;
  }

  async getCommandById(id: string): Promise<RemoteCommand> {
    const response = await this.axiosInstance.get<RemoteCommand>(`/commands/${id}`);
    return response.data;
  }

  async sendCommand(commandData: {
    deviceIds: string[];
    command: CommandType;
    parameters?: CommandParameters;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    executeAt?: string;
    expiresAt?: string;
  }): Promise<{ commands: RemoteCommand[]; message: string }> {
    const response = await this.axiosInstance.post<{ commands: RemoteCommand[]; message: string }>('/commands', commandData);
    return response.data;
  }

  async cancelCommand(id: string): Promise<RemoteCommand> {
    const response = await this.axiosInstance.put<RemoteCommand>(`/commands/${id}/cancel`);
    return response.data;
  }

  async bulkCommandOperation(operation: 'cancel' | 'retry', commandIds: string[]): Promise<{ affected: number }> {
    const response = await this.axiosInstance.post<{ affected: number }>('/commands/bulk', {
      operation,
      commandIds
    });
    return response.data;
  }

  async getCommandStatistics(params?: {
    deviceId?: string;
    days?: number;
  }): Promise<{
    summary: {
      total: number;
      successRate: number;
      avgExecutionTime: number | null;
    };
    byStatus: Array<{ status: string; count: number }>;
    byCommand: Array<{ command: string; count: number }>;
    recentActivity: RemoteCommand[];
  }> {
    const response = await this.axiosInstance.get('/commands/stats', { params });
    return response.data;
  }

  // Dashboard API
  async getDashboardStats(): Promise<DashboardStats> {
    // This would be a dedicated endpoint for dashboard statistics
    // For now, we'll aggregate from existing endpoints
    const [devices, policies, commands] = await Promise.all([
      this.getDevices({ limit: 1 }),
      this.getPolicies({ limit: 1 }),
      this.getCommands({ limit: 1 })
    ]);

    return {
      totalDevices: devices.pagination.total,
      activeDevices: 0, // Would need specific endpoint
      inactiveDevices: 0,
      suspendedDevices: 0,
      totalPolicies: policies.pagination.total,
      activePolicies: 0,
      pendingCommands: 0,
      executedCommands: 0,
      failedCommands: 0,
      totalUsers: 0
    };
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string; environment: string }> {
    const response = await axios.get('/health');
    return response.data;
  }
}

export const apiService = new ApiService();
export default apiService;