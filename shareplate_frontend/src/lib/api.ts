const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:8000/api";

const getAuthToken = (): string | null => localStorage.getItem("authToken");

const getHeaders = (includeAuth = true): HeadersInit => {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Token ${token}`;
    }
  }
  return headers;
};

const extractErrorMessage = (error: unknown, fallback = "Request failed"): string => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as Record<string, unknown>;
  const direct = candidate.detail || candidate.error || candidate.message;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  for (const value of Object.values(candidate)) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === "string" && first.trim()) {
        return first;
      }
    }
  }

  return fallback;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(extractErrorMessage(error));
  }
  return response.json();
};

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: "donor" | "recipient" | "volunteer" | null;
  phone_number?: string;
  email_notifications_enabled?: boolean;
}

export interface CompactUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: "donor" | "recipient" | "volunteer" | null;
}

export interface DonationItem {
  id: number;
  name: string;
  description: string;
  quantity: number;
  expiry_date: string;
  expiry_status?: "expired" | "today" | "urgent" | "fresh";
  address: string;
  is_available: boolean;
  created_at: string;
  donor: CompactUser;
  donor_name: string;
  latitude?: number | null;
  longitude?: number | null;
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

export interface RecipientLocationPayload {
  recipient_latitude?: number;
  recipient_longitude?: number;
}

export interface RegisterUserData {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  role: "donor" | "recipient" | "volunteer";
  phone_number?: string;
}

export interface DeliveryRequest {
  id: number;
  status: string;
  delivery_status: "pending" | "assigned" | "picked" | "delivering" | "delivered";
  tracking_message?: string;
  delivery?: {
    id: number;
    status: string;
    tracking_note: string;
    volunteer_id: number | null;
    request_id: number;
    current_latitude?: number | null;
    current_longitude?: number | null;
    updated_at: string;
  } | null;
  created_at: string;
  updated_at: string;
  assigned_at?: string | null;
  completed_at?: string | null;
  requester?: CompactUser;
  volunteer?: CompactUser | null;
  volunteer_location?: VolunteerLocation | null;
  recipient_location?: {
    latitude: number;
    longitude: number;
  } | null;
  recipient_latitude?: number | null;
  recipient_longitude?: number | null;
  item_details: DonationItem;
}

export interface DashboardSummary {
  role: string | null;
  network: {
    total_requests: number;
    delivered_requests: number;
    active_deliveries: number;
  };
  server_time: string;
  [key: string]: string | number | null | object;
}

export interface VolunteerLocation {
  latitude?: number | null;
  longitude?: number | null;
  updated_at?: string;
}

export const api = {
  async registerUser(data: RegisterUserData): Promise<{ user: User; token: string }> {
    return request("/users/register/", {
      method: "POST",
      headers: getHeaders(false),
      body: JSON.stringify(data),
    });
  },

  async loginUser(email: string, password: string): Promise<{ token: string; user: User; role?: string; name?: string }> {
    return request("/api-token-auth/", {
      method: "POST",
      headers: getHeaders(false),
      body: JSON.stringify({ email, password }),
    });
  },

  async getMe(): Promise<User> {
    return request("/users/me/", {
      method: "GET",
      headers: getHeaders(),
    });
  },

  async getUsersByRole(role: "donor" | "recipient" | "volunteer"): Promise<User[]> {
    return request(`/users/?role=${role}`, {
      method: "GET",
      headers: getHeaders(),
    });
  },

  async createDonation(data: CreateDonationData): Promise<DonationItem> {
    return request("/add_food/", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
  },

  async deleteDonation(itemId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/items/${itemId}/`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Failed to delete donation" }));
      throw new Error(extractErrorMessage(error, "Failed to delete donation"));
    }
  },

  async getDonations(options?: { mine?: boolean; bbox?: string }): Promise<DonationItem[]> {
    const url = new URL(`${API_BASE_URL}/get_food/`);
    if (options?.mine) {
      url.searchParams.set("mine", "1");
    }
    if (options?.bbox) {
      url.searchParams.set("in_bbox", options.bbox);
    }
    url.searchParams.set("_ts", `${Date.now()}`);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: getHeaders(),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Failed to fetch donations");
    }
    return response.json();
  },

  async getRequests(scope?: "all"): Promise<DeliveryRequest[]> {
    const search = scope ? `?scope=${scope}` : "";
    const path = `/requests/${search}${search ? "&" : "?"}_ts=${Date.now()}`;
    return request(path, {
      method: "GET",
      headers: getHeaders(),
      cache: "no-store",
    });
  },

  async createRequest(itemId: number, location?: RecipientLocationPayload): Promise<DeliveryRequest> {
    try {
      return await request("/request_food/", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ item: itemId, ...(location || {}) }),
      });
    } catch (error) {
      const hasLocationPayload =
        location &&
        (typeof location.recipient_latitude === "number" || typeof location.recipient_longitude === "number");

      if (!hasLocationPayload) {
        throw error;
      }

      return request("/request_food/", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ item: itemId }),
      });
    }
  },

  async claimVolunteerDelivery(requestId: number): Promise<DeliveryRequest> {
    return request(`/assign_volunteer/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ request_id: requestId }),
    });
  },

  async updateDeliveryStatus(requestId: number, delivery_status: DeliveryRequest["delivery_status"]): Promise<DeliveryRequest> {
    return request(`/update_delivery_status/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ request_id: requestId, status: delivery_status }),
    });
  },

  async getDashboardSummary(): Promise<DashboardSummary> {
    return request("/dashboard/summary/", {
      method: "GET",
      headers: getHeaders(),
    });
  },

  async updateVolunteerLocation(location: VolunteerLocation): Promise<VolunteerLocation> {
    return request("/volunteer/location/", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(location),
    });
  },
};

export const saveAuthToken = (token: string) => {
  localStorage.setItem("authToken", token);
};

export const removeAuthToken = () => {
  localStorage.removeItem("authToken");
};

export const isAuthenticated = (): boolean => Boolean(getAuthToken());
