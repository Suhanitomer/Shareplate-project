/**
 * API service for communicating with the SharePlate backend
 */

const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000/api';

// Helper function to get auth token from localStorage
const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

// Helper function to get default headers
const getHeaders = (includeAuth = true): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Token ${token}`;
    }
  }

  return headers;
};

// API response types
export interface DonationItem {
  id: number;
  name: string;
  description: string;
  quantity: number;
  expiry_date: string;
  address: string;
  is_available: boolean;
  created_at: string;
  donor: string;
  latitude?: number;
  longitude?: number;
  location?: {
    type: string;
    coordinates: number[];
  };
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: 'donor' | 'recipient' | 'volunteer' | null;
  phone_number?: string;
  email_notifications_enabled: boolean;
}

export interface CreateDonationData {
  name: string;
  description?: string;
  quantity: number;
  expiry_date: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface RegisterUserData {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  role: 'donor' | 'recipient' | 'volunteer';
  phone_number?: string;
}

// API functions
export const api = {
  // Donations/Items
  async createDonation(data: CreateDonationData): Promise<DonationItem> {
    const response = await fetch(`${API_BASE_URL}/items/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        name: data.name,
        description: data.description || '',
        quantity: data.quantity,
        expiry_date: data.expiry_date,
        address: data.address,
        // Include location if coordinates are provided
        ...(data.latitude && data.longitude && {
          location: {
            type: 'Point',
            coordinates: [data.longitude, data.latitude] // GeoJSON format: [lng, lat]
          }
        })
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to create donation' }));
      throw new Error(error.detail || error.message || 'Failed to create donation');
    }

    const result = await response.json();
    // Handle GeoJSON response
    if (result.geometry && result.properties) {
      const coords = result.geometry.coordinates;
      return {
        ...result.properties,
        id: result.properties.id,
        latitude: coords[1],
        longitude: coords[0],
        address: result.properties.address || data.address,
      };
    }
    return result;
  },

  async getDonations(bbox?: string): Promise<DonationItem[]> {
    const url = new URL(`${API_BASE_URL}/items/`);
    if (bbox) {
      url.searchParams.append('in_bbox', bbox);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch donations');
    }

    const data = await response.json();
    // Handle GeoJSON FeatureCollection
    if (data.type === 'FeatureCollection' && data.features) {
      return data.features.map((feature: any) => ({
        ...feature.properties,
        id: feature.properties.id,
        latitude: feature.geometry?.coordinates[1],
        longitude: feature.geometry?.coordinates[0],
      }));
    }
    return data;
  },

  // User management
  async registerUser(data: RegisterUserData): Promise<{ user: User; token: string }> {
    const response = await fetch(`${API_BASE_URL}/users/register/`, {
      method: 'POST',
      headers: getHeaders(false),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to register user' }));
      throw new Error(error.detail || error.message || 'Failed to register user');
    }

    return await response.json();
  },

  async loginUser(email: string, password: string): Promise<{ token: string; user: User; role?: string; name?: string }> {
    const response = await fetch(`${API_BASE_URL}/api-token-auth/`, {
      method: 'POST',
      headers: getHeaders(false),
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Invalid credentials' }));
      throw new Error(error.detail || error.message || 'Invalid credentials');
    }

    const { token, role, name } = await response.json();
    saveAuthToken(token); // Save token to be used in getMe

    // We already have role and name from login, but let's fetch full user profile to be safe
    // or just return the user object if getMe succeeds.
    let user: User | any = {};
    try {
      user = await this.getMe(email);
    } catch (e) {
      console.warn("Could not fetch full user profile", e);
    }

    return { token, user, role, name };
  },

  async getRequests(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/requests/`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch requests');
    }

    return await response.json();
  },

  async createRequest(itemId: number): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/requests/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ item: itemId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create request');
    }

    return await response.json();
  },

  async getMe(email: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/users/?email=${email}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }

    const users = await response.json();
    if (users.length === 0) {
      throw new Error('User not found');
    }
    return users[0];
  },

  async getVolunteers(): Promise<User[]> {
    const response = await fetch(`${API_BASE_URL}/users/?role=volunteer`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch volunteers');
    }

    return await response.json();
  },
};

// Helper to save auth token
export const saveAuthToken = (token: string) => {
  localStorage.setItem('authToken', token);
};

// Helper to remove auth token
export const removeAuthToken = () => {
  localStorage.removeItem('authToken');
};

// Helper to check if user is authenticated
export const isAuthenticated = (): boolean => {
  return !!getAuthToken();
};

