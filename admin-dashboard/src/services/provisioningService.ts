import { 
  ProvisioningProfile, 
  ProvisioningSession,
  CreateProvisioningProfileRequest,
  CreateProvisioningSessionRequest,
  StartProvisioningRequest,
  ProvisioningValidationResult,
  CompatibleDevicesResponse,
  ProvisioningStatistics,
  ProvisioningStatusUpdate
} from '../types';
import { apiClient } from './api';

class ProvisioningService {
  private baseUrl = '/api/provisioning';

  // Provisioning Profiles
  async getProfiles(): Promise<ProvisioningProfile[]> {
    const response = await apiClient.get(`${this.baseUrl}/profiles`);
    return response.data;
  }

  async getProfile(id: string): Promise<ProvisioningProfile> {
    const response = await apiClient.get(`${this.baseUrl}/profiles/${id}`);
    return response.data;
  }

  async createProfile(data: CreateProvisioningProfileRequest): Promise<ProvisioningProfile> {
    const response = await apiClient.post(`${this.baseUrl}/profiles`, data);
    return response.data;
  }

  async updateProfile(id: string, data: Partial<CreateProvisioningProfileRequest>): Promise<ProvisioningProfile> {
    const response = await apiClient.put(`${this.baseUrl}/profiles/${id}`, data);
    return response.data;
  }

  async deleteProfile(id: string, force: boolean = false): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/profiles/${id}?force=${force}`);
  }

  async validateProfile(id: string): Promise<ProvisioningValidationResult> {
    const response = await apiClient.post(`${this.baseUrl}/profiles/${id}/validate`);
    return response.data;
  }

  async getCompatibleDevices(id: string): Promise<CompatibleDevicesResponse> {
    const response = await apiClient.get(`${this.baseUrl}/profiles/${id}/compatible-devices`);
    return response.data;
  }

  // Provisioning Sessions
  async getSessions(params?: {
    status?: string;
    profileId?: string;
    createdBy?: string;
    page?: number;
    limit?: number;
  }): Promise<{ sessions: ProvisioningSession[]; pagination: any }> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    
    const response = await apiClient.get(`${this.baseUrl}/sessions?${queryParams.toString()}`);
    return response.data;
  }

  async getSession(id: string): Promise<ProvisioningSession> {
    const response = await apiClient.get(`${this.baseUrl}/sessions/${id}`);
    return response.data;
  }

  async createSession(data: CreateProvisioningSessionRequest): Promise<ProvisioningSession> {
    const response = await apiClient.post(`${this.baseUrl}/sessions`, data);
    return response.data;
  }

  async startSession(id: string, options?: StartProvisioningRequest): Promise<void> {
    await apiClient.post(`${this.baseUrl}/sessions/${id}/start`, options || {});
  }

  async pauseSession(id: string): Promise<void> {
    await apiClient.post(`${this.baseUrl}/sessions/${id}/pause`);
  }

  async cancelSession(id: string): Promise<void> {
    await apiClient.post(`${this.baseUrl}/sessions/${id}/cancel`);
  }

  async updateProgress(sessionId: string, deviceId: string, update: ProvisioningStatusUpdate): Promise<void> {
    await apiClient.put(`${this.baseUrl}/sessions/${sessionId}/progress/${deviceId}`, update);
  }

  // Statistics
  async getStatistics(timeRange: number = 30): Promise<ProvisioningStatistics> {
    const response = await apiClient.get(`${this.baseUrl}/statistics?timeRange=${timeRange}`);
    return response.data;
  }

  // Bulk operations helper
  async createSessionAndStart(
    profileId: string,
    deviceIds: string[],
    sessionName: string,
    options?: StartProvisioningRequest['options']
  ): Promise<ProvisioningSession> {
    // Create session
    const session = await this.createSession({
      profileId,
      name: sessionName,
      deviceIds
    });

    // Start session
    await this.startSession(session.id, { options });

    return session;
  }
}

export const provisioningService = new ProvisioningService();