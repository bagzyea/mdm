import api from './api';

export interface APKRegistryParams {
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
  isActive?: boolean;
}

export interface DataFolderData {
  name: string;
  description?: string;
  folderType: string;
  sourcePath: string;
  targetPath: string;
  isRequired: boolean;
  geographicScope?: string;
  applicableDistricts?: string[];
}

export const apkRegistryService = {
  // Get all APKs with filtering and pagination
  getAPKs: async (params?: APKRegistryParams) => {
    const response = await api.get('/apk-registry', { params });
    return response.data;
  },

  // Get compatible APKs for specific device models
  getCompatibleAPKs: async (deviceModels: string[]) => {
    const response = await api.get('/apk-registry/compatible', {
      params: { deviceModels: deviceModels.join(',') }
    });
    return response.data;
  },

  // Get specific APK with data folders
  getAPK: async (apkId: string) => {
    const response = await api.get(`/apk-registry/${apkId}`);
    return response.data;
  },

  // Upload and register new APK
  uploadAPK: async (formData: FormData) => {
    const response = await api.post('/apk-registry/upload', formData, {
      headers: { 
        'Content-Type': 'multipart/form-data'
      },
      timeout: 300000 // 5 minutes for large APK uploads
    });
    return response.data;
  },

  // Update APK information
  updateAPK: async (apkId: string, updateData: any) => {
    const response = await api.put(`/apk-registry/${apkId}`, updateData);
    return response.data;
  },

  // Deactivate APK (soft delete)
  deactivateAPK: async (apkId: string) => {
    const response = await api.delete(`/apk-registry/${apkId}`);
    return response.data;
  },

  // Add data folder to APK
  addDataFolder: async (apkId: string, folderData: DataFolderData) => {
    const response = await api.post(`/apk-registry/${apkId}/data-folders`, folderData);
    return response.data;
  },

  // Update data folder
  updateDataFolder: async (apkId: string, folderId: string, updateData: Partial<DataFolderData>) => {
    const response = await api.put(`/apk-registry/${apkId}/data-folders/${folderId}`, updateData);
    return response.data;
  },

  // Delete data folder
  deleteDataFolder: async (apkId: string, folderId: string) => {
    const response = await api.delete(`/apk-registry/${apkId}/data-folders/${folderId}`);
    return response.data;
  },

  // Get available categories with counts
  getCategories: async () => {
    const response = await api.get('/apk-registry/categories');
    return response.data;
  },

  // Validate APK file before upload
  validateAPKFile: (file: File): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.apk')) {
      errors.push('File must have .apk extension');
    }
    
    // Check file size (500MB limit)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      errors.push(`File size must be less than ${maxSize / 1024 / 1024}MB`);
    }
    
    // Check MIME type
    if (file.type && file.type !== 'application/vnd.android.package-archive') {
      errors.push('Invalid file type. Please select a valid APK file');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Create APK upload session for bulk operations
  createUploadSession: async (sessionData: {
    name: string;
    description?: string;
    uploadPath: string;
  }) => {
    const response = await api.post('/apk-registry/upload-sessions', sessionData);
    return response.data;
  },

  // Get upload session status
  getUploadSession: async (sessionId: string) => {
    const response = await api.get(`/apk-registry/upload-sessions/${sessionId}`);
    return response.data;
  }
};

export default apkRegistryService;