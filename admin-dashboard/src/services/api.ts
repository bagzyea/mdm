import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { 
  User, 
  LoginCredentials, 
  AuthResponse, 
  Device, 
  Policy, 
  RemoteCommand, 
  DashboardStats,
  PaginatedResponse,
  CommandType,
  CommandParameters,
  PolicyType,
  PolicyRules,
  DeviceAnalytics,
  DeviceHealthSummary,
  Certificate,
  CertificateRequest,
  DeviceCertificate,
  SecurityStatus,
  ComplianceCheck,
  ComplianceReport,
  EncryptionPolicy
} from '../types';

class ApiService {
  private axiosInstance: AxiosInstance;
  private token: string | null = null;
  private onTokenExpiredCallback: (() => void) | null = null;

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
        const status = error.response?.status;
        const code = error.response?.data?.code;
        // Handle both 401 (no token) and 403 with INVALID_TOKEN (expired token)
        if (status === 401 || (status === 403 && code === 'INVALID_TOKEN')) {
          // Token expired or invalid - trigger graceful logout
          this.handleTokenExpired();
        }
        return Promise.reject(error);
      }
    );
  }

  // Token expiry handling
  setOnTokenExpiredCallback(callback: () => void): void {
    this.onTokenExpiredCallback = callback;
  }

  private handleTokenExpired(): void {
    console.warn('🔐 Token expired or invalid, triggering automatic logout...');
    this.clearToken();
    
    // Trigger the callback to handle logout through AuthContext
    if (this.onTokenExpiredCallback) {
      this.onTokenExpiredCallback();
    } else {
      // Fallback if no callback is set (shouldn't happen in normal flow)
      console.warn('⚠️ No token expired callback set, falling back to direct redirect');
      window.location.href = '/login';
    }
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

  async deleteDevice(deviceId: string, force?: boolean): Promise<void> {
    await this.axiosInstance.delete(`/devices/${deviceId}`, {
      params: { force }
    });
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

  async sendCommand(deviceId: string, command: CommandType, parameters?: any): Promise<RemoteCommand> {
    const response = await this.axiosInstance.post<{ commands: RemoteCommand[]; message: string }>('/commands', {
      deviceIds: [deviceId],
      command,
      parameters: parameters || {},
      priority: 'NORMAL'
    });
    const cmd = response.data.commands[0];
    if (!cmd) throw new Error('No command returned from server');
    return cmd;
  }

  async sendCommandToMultipleDevices(commandData: {
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

  async getCommandStatistics(_params?: {
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
    const response = await this.axiosInstance.get('/commands/stats', { params: _params });
    return response.data;
  }

  // Dashboard API
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      console.log('🔄 Fetching dashboard stats...');
      console.log('🔑 Current auth token:', this.getToken() ? 'Present' : 'Missing');
      
      // Get actual data from multiple endpoints
      const [devicesData, policiesData, usersData, commandsData] = await Promise.all([
        this.getDevices({ limit: 100 }), // Get devices to analyze status
        this.getPolicies({ limit: 100 }), // Get policies
        this.getUsers({ limit: 100 }), // Get users count
        this.getCommandStatistics() // Get command statistics
      ]);

      console.log('📊 API Responses:', { 
        devices: { total: devicesData.pagination?.total || 0, count: devicesData.data?.length || 0 },
        policies: { total: policiesData.pagination?.total || 0, count: policiesData.data?.length || 0 },
        users: { total: usersData.pagination?.total || 0, count: usersData.data?.length || 0 },
        commands: commandsData.summary || {}
      });

      // Analyze device statuses
      const devices = devicesData.data || [];
      const activeDevices = devices.filter(d => d.status === 'ACTIVE' || d.status === 'ENROLLED').length;
      const inactiveDevices = devices.filter(d => d.status === 'INACTIVE').length;
      const suspendedDevices = devices.filter(d => d.status === 'SUSPENDED').length;

      // Analyze policies
      const policies = policiesData.data || [];
      const activePolicies = policies.filter(p => p.isActive !== false).length;

      // Get command statistics
      const commandsByStatus = commandsData.byStatus || [];
      
      const pendingCommands = commandsByStatus.find(s => s.status === 'PENDING')?.count || 0;
      const executedCommands = commandsByStatus.find(s => s.status === 'EXECUTED')?.count || 0;
      const failedCommands = commandsByStatus.find(s => s.status === 'FAILED')?.count || 0;

      const stats = {
        totalDevices: devicesData.pagination?.total || 0,
        activeDevices,
        inactiveDevices,
        suspendedDevices,
        totalPolicies: policiesData.pagination?.total || 0,
        activePolicies,
        pendingCommands,
        executedCommands,
        failedCommands,
        totalUsers: usersData.pagination?.total || 0
      };

      console.log('✅ Dashboard stats calculated:', stats);
      return stats;
    } catch (error: any) {
      console.error('❌ Error fetching dashboard stats:', {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        hasToken: !!this.getToken()
      });
      
      // If it's an auth error, throw it to let React Query handle the redirect
      if (error.response?.status === 401) {
        throw error;
      }
      
      // Return fallback data for other errors
      return {
        totalDevices: 0,
        activeDevices: 0,
        inactiveDevices: 0,
        suspendedDevices: 0,
        totalPolicies: 0,
        activePolicies: 0,
        pendingCommands: 0,
        executedCommands: 0,
        failedCommands: 0,
        totalUsers: 0
      };
    }
  }

  // Enhanced monitoring API methods
  async updateDeviceAnalytics(deviceId: string, analytics: DeviceAnalytics): Promise<Device> {
    const response = await this.axiosInstance.put(`/devices/${deviceId}/analytics`, analytics);
    return response.data;
  }

  async getDeviceAnalytics(deviceId: string, days: number = 7): Promise<{
    current: Device;
    historical: DeviceAnalytics[];
  }> {
    const response = await this.axiosInstance.get(`/devices/${deviceId}/analytics?days=${days}`);
    return response.data;
  }

  async getDeviceHealthSummary(): Promise<DeviceHealthSummary> {
    try {
      console.log('🔄 Fetching device health summary...');
      console.log('🔑 Current auth token:', this.getToken() ? 'Present' : 'Missing');
      
      const response = await this.axiosInstance.get('/devices/health/summary');
      console.log('✅ Device health API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching device health summary:', {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        hasToken: !!this.getToken()
      });
      
      // If it's an auth error, throw it to let React Query handle the redirect
      if (error.response?.status === 401) {
        throw error;
      }
      
      // Return fallback data for other errors
      return {
        totalDevices: 0,
        activeDevices: 0,
        lowBatteryDevices: 0,
        lowStorageDevices: 0,
        offlineDevices: 0
      };
    }
  }

  // Certificate Management API methods
  async getCertificates(): Promise<Certificate[]> {
    const response = await this.axiosInstance.get('/certificates');
    return response.data;
  }

  async getCertificate(id: string): Promise<Certificate> {
    const response = await this.axiosInstance.get(`/certificates/${id}`);
    return response.data;
  }

  async createCertificate(certificateRequest: CertificateRequest): Promise<Certificate> {
    const response = await this.axiosInstance.post('/certificates', certificateRequest);
    return response.data;
  }

  async deployCertificate(certificateId: string, deviceIds: string[]): Promise<{
    message: string;
    deployments: DeviceCertificate[];
  }> {
    const response = await this.axiosInstance.post(`/certificates/${certificateId}/deploy`, { deviceIds });
    return response.data;
  }

  async revokeCertificate(id: string, reason?: string): Promise<Certificate> {
    const response = await this.axiosInstance.put(`/certificates/${id}/revoke`, { reason });
    return response.data;
  }

  async getDeviceCertificates(deviceId: string): Promise<DeviceCertificate[]> {
    const response = await this.axiosInstance.get(`/certificates/device/${deviceId}`);
    return response.data;
  }

  // Security Management API methods
  async getSecurityStatus(deviceId: string): Promise<SecurityStatus> {
    const response = await this.axiosInstance.get(`/security/device/${deviceId}/status`);
    return response.data;
  }

  async updateSecurityStatus(deviceId: string, securityData: Partial<SecurityStatus>): Promise<SecurityStatus> {
    const response = await this.axiosInstance.put(`/security/device/${deviceId}/status`, securityData);
    return response.data;
  }

  async runComplianceCheck(deviceId: string, complianceCheck: ComplianceCheck): Promise<ComplianceReport> {
    const response = await this.axiosInstance.post(`/security/device/${deviceId}/compliance`, complianceCheck);
    return response.data;
  }

  async getComplianceReports(deviceId: string, limit?: number, type?: string): Promise<ComplianceReport[]> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (type) params.append('type', type);
    
    const response = await this.axiosInstance.get(`/security/device/${deviceId}/compliance?${params}`);
    return response.data;
  }

  async enforceEncryptionPolicy(deviceId: string, encryptionPolicy: EncryptionPolicy): Promise<{
    message: string;
    securityStatus: SecurityStatus;
    command: any;
  }> {
    const response = await this.axiosInstance.post(`/security/device/${deviceId}/encryption`, encryptionPolicy);
    return response.data;
  }

  async detectRootStatus(deviceId: string): Promise<{
    message: string;
    command: any;
  }> {
    const response = await this.axiosInstance.post(`/security/root-detection/${deviceId}`);
    return response.data;
  }

  // Provisioning Service Methods
  async getProvisioningProfiles(): Promise<any[]> {
    const response = await this.axiosInstance.get('/provisioning/profiles');
    return response.data;
  }

  async getProvisioningProfile(id: string): Promise<any> {
    const response = await this.axiosInstance.get(`/provisioning/profiles/${id}`);
    return response.data;
  }

  async createProvisioningProfile(profileData: any): Promise<any> {
    const response = await this.axiosInstance.post('/provisioning/profiles', profileData);
    return response.data;
  }

  async updateProvisioningProfile(id: string, profileData: any): Promise<any> {
    const response = await this.axiosInstance.put(`/provisioning/profiles/${id}`, profileData);
    return response.data;
  }

  async deleteProvisioningProfile(id: string): Promise<void> {
    await this.axiosInstance.delete(`/provisioning/profiles/${id}`);
  }

  async validateProvisioningProfile(id: string): Promise<any> {
    const response = await this.axiosInstance.post(`/provisioning/profiles/${id}/validate`);
    return response.data;
  }

  async getCompatibleDevices(profileId: string): Promise<any> {
    const response = await this.axiosInstance.get(`/provisioning/profiles/${profileId}/compatible-devices`);
    return response.data;
  }

  async getProvisioningSessions(params?: {
    page?: number;
    limit?: number;
    status?: string;
    profileId?: string;
  }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.profileId) queryParams.append('profileId', params.profileId);

    const url = `/provisioning/sessions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.axiosInstance.get(url);
    return response.data;
  }

  async getProvisioningSession(id: string): Promise<any> {
    const response = await this.axiosInstance.get(`/provisioning/sessions/${id}`);
    return response.data;
  }

  async createProvisioningSession(sessionData: any): Promise<any> {
    const response = await this.axiosInstance.post('/provisioning/sessions', sessionData);
    return response.data;
  }

  async updateProvisioningSession(id: string, sessionData: any): Promise<any> {
    const response = await this.axiosInstance.put(`/provisioning/sessions/${id}`, sessionData);
    return response.data;
  }

  async deleteProvisioningSession(id: string): Promise<void> {
    await this.axiosInstance.delete(`/provisioning/sessions/${id}`);
  }

  async startProvisioningSession(id: string): Promise<any> {
    const response = await this.axiosInstance.post(`/provisioning/sessions/${id}/start`);
    return response.data;
  }

  async pauseProvisioningSession(id: string): Promise<any> {
    const response = await this.axiosInstance.post(`/provisioning/sessions/${id}/pause`);
    return response.data;
  }

  async cancelProvisioningSession(id: string): Promise<any> {
    const response = await this.axiosInstance.post(`/provisioning/sessions/${id}/cancel`);
    return response.data;
  }

  async getProvisioningProgress(sessionId: string): Promise<any[]> {
    const response = await this.axiosInstance.get(`/provisioning/sessions/${sessionId}/progress`);
    return response.data;
  }

  async getSessionStatistics(sessionId: string): Promise<any> {
    const response = await this.axiosInstance.get(`/provisioning/sessions/${sessionId}/statistics`);
    return response.data;
  }

  // Bulk Application Deployment
  async bulkDeployApplications(profileId: string, deploymentData: {
    deviceIds: string[];
    applications: string[];
    options?: {
      parallelLimit?: number;
      retryAttempts?: number;
      skipValidation?: boolean;
    };
  }): Promise<any> {
    const response = await this.axiosInstance.post(`/provisioning/profiles/${profileId}/bulk-deploy`, deploymentData);
    return response.data;
  }

  async getDeploymentProgress(sessionId: string): Promise<any> {
    const response = await this.axiosInstance.get(`/provisioning/deployment/${sessionId}/progress`);
    return response.data;
  }

  async cancelDeployment(sessionId: string): Promise<any> {
    const response = await this.axiosInstance.post(`/provisioning/deployment/${sessionId}/cancel`);
    return response.data;
  }

  // Field Configuration Management
  async getFieldConfigurations(): Promise<any[]> {
    const response = await this.axiosInstance.get('/provisioning/field-configurations');
    return response.data;
  }

  async getFieldConfiguration(id: string): Promise<any> {
    const response = await this.axiosInstance.get(`/provisioning/field-configurations/${id}`);
    return response.data;
  }

  async createFieldConfiguration(configData: {
    name: string;
    description?: string;
    deviceModels: string[];
    applications: string[];
    networkConfig?: any;
    securityConfig?: any;
    filePackages: any[];
    geographicRules?: any;
  }): Promise<any> {
    const response = await this.axiosInstance.post('/provisioning/field-configurations', configData);
    return response.data;
  }

  async updateFieldConfiguration(id: string, configData: any): Promise<any> {
    const response = await this.axiosInstance.put(`/provisioning/field-configurations/${id}`, configData);
    return response.data;
  }

  async deleteFieldConfiguration(id: string): Promise<void> {
    await this.axiosInstance.delete(`/provisioning/field-configurations/${id}`);
  }

  async applyFieldConfiguration(id: string, deviceIds: string[]): Promise<any> {
    const response = await this.axiosInstance.post(`/provisioning/field-configurations/${id}/apply`, { deviceIds });
    return response.data;
  }

  // Device Model Recognition
  async detectDeviceModel(deviceId: string): Promise<any> {
    const response = await this.axiosInstance.get(`/provisioning/devices/${deviceId}/detect-model`);
    return response.data;
  }

  async getCompatibleAPKs(deviceModels: string[]): Promise<{ apks: any[] }> {
    const response = await this.axiosInstance.get(`/apk-registry/compatible?deviceModels=${deviceModels.join(',')}`);
    return response.data;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string; environment: string }> {
    const response = await this.axiosInstance.get('/health');
    return response.data;
  }

  // Generic HTTP methods for component compatibility
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.get<T>(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.post<T>(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }
}

// Export the API service instance
export const apiService = new ApiService();
export const apiClient = apiService;

// Export provisioning service methods for convenience
export const provisioningService = {
  getProfiles: () => apiService.getProvisioningProfiles(),
  getProfile: (id: string) => apiService.getProvisioningProfile(id),
  createProfile: (data: any) => apiService.createProvisioningProfile(data),
  updateProfile: (id: string, data: any) => apiService.updateProvisioningProfile(id, data),
  deleteProfile: (id: string) => apiService.deleteProvisioningProfile(id),
  validateProfile: (id: string) => apiService.validateProvisioningProfile(id),
  getCompatibleDevices: (profileId: string) => apiService.getCompatibleDevices(profileId),
  getSessions: (params?: any) => apiService.getProvisioningSessions(params),
  getSession: (id: string) => apiService.getProvisioningSession(id),
  createSession: (data: any) => apiService.createProvisioningSession(data),
  updateSession: (id: string, data: any) => apiService.updateProvisioningSession(id, data),
  deleteSession: (id: string) => apiService.deleteProvisioningSession(id),
  startSession: (id: string) => apiService.startProvisioningSession(id),
  pauseSession: (id: string) => apiService.pauseProvisioningSession(id),
  cancelSession: (id: string) => apiService.cancelProvisioningSession(id),
  getProgress: (sessionId: string) => apiService.getProvisioningProgress(sessionId),
  getStatistics: (sessionId: string) => apiService.getSessionStatistics(sessionId),
  getDevices: () => apiService.getDevices(),
  // Bulk Application Deployment
  bulkDeployApplications: (profileId: string, deploymentData: any) => apiService.bulkDeployApplications(profileId, deploymentData),
  getDeploymentProgress: (sessionId: string) => apiService.getDeploymentProgress(sessionId),
  cancelDeployment: (sessionId: string) => apiService.cancelDeployment(sessionId),
  // Field Configuration Management
  getFieldConfigurations: () => apiService.getFieldConfigurations(),
  getFieldConfiguration: (id: string) => apiService.getFieldConfiguration(id),
  createFieldConfiguration: (data: any) => apiService.createFieldConfiguration(data),
  updateFieldConfiguration: (id: string, data: any) => apiService.updateFieldConfiguration(id, data),
  deleteFieldConfiguration: (id: string) => apiService.deleteFieldConfiguration(id),
  applyFieldConfiguration: (id: string, deviceIds: string[]) => apiService.applyFieldConfiguration(id, deviceIds),
  // Device Model Recognition
  detectDeviceModel: (deviceId: string) => apiService.detectDeviceModel(deviceId),
};

// Export APK Vault service for enterprise app repository management
export const apkVaultService = {
  /** Fetch all apps in the corporate app vault */
  getAll: (): Promise<any[]> => apiService.get('/apk-registry'),

  /** Upload a new APK. formData must contain the 'apk' file field. */
  upload: (formData: FormData): Promise<any> =>
    apiService.post('/apk-registry/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 minutes for large APK uploads
    }),

  /** Permanently delete an APK and its file from the server */
  delete: (id: string): Promise<void> => apiService.delete(`/apk-registry/${id}`),

  /**
   * Ask the server for a short-lived signed download URL for an APK.
   *
   * APKs are no longer served from an unauthenticated static path (finding F-06), so a
   * URL can no longer be constructed client-side. The previous implementation also
   * built `<host>:5001/apks/<file>`, which never matched the served `/public/apks/`
   * path, so the download button was already broken.
   */
  getDownloadUrl: async (id: string): Promise<string> => {
    const response: { url: string; expiresAt: string } = await apiService.get(
      `/apk-registry/${id}/download-url`
    );
    return new URL(
      response.url,
      `${window.location.protocol}//${window.location.hostname}:5001`
    ).toString();
  },
};