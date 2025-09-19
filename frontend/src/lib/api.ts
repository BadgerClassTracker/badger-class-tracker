// frontend/src/lib/api.ts
import { fetchAuthSession } from 'aws-amplify/auth';
import type { 
  Subscription, 
  CreateSubscriptionRequest, 
  CreateSubscriptionResponse, 
  CourseSearchResponse 
} from '@shared/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

class ApiClient {
  private async getAuthHeaders() {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      return {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      };
    } catch {
      return {
        'Content-Type': 'application/json',
      };
    }
  }

  // Subscription endpoints (protected)
  async createSubscription(data: CreateSubscriptionRequest): Promise<CreateSubscriptionResponse> {
    const response = await fetch(`${API_BASE}/subscriptions`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      const err = new Error(error.error || error.message || 'Failed to create subscription') as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    return response.json();
  }

  async listSubscriptions(): Promise<Subscription[]> {
    const response = await fetch(`${API_BASE}/subscriptions`, {
      method: 'GET',
      headers: await this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      const err = new Error(error.error || error.message || 'Failed to list subscriptions') as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    return data.subscriptions || [];
  }

  async deleteSubscription(subId: string): Promise<void> {
    // Get user email from the current session
    const session = await fetchAuthSession();
    const userEmail = session.tokens?.idToken?.payload?.email;

    if (!userEmail) {
      throw new Error('User email not found in session');
    }

    const response = await fetch(`${API_BASE}/subscriptions/${subId}?email=${encodeURIComponent(String(userEmail))}`, {
      method: 'DELETE',
      headers: await this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      const err = new Error(error.error || error.message || 'Failed to delete subscription') as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
  }

  // Course search (public)
  async searchCourses(params: {
    search?: string;
    term?: string;
    subject?: string;
    courseId?: string;
    openOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<any> {
    const searchParams = new URLSearchParams();
    
    if (params.search) searchParams.set('search', params.search);
    if (params.term) searchParams.set('term', params.term);
    if (params.subject) searchParams.set('subject', params.subject);
    if (params.courseId) searchParams.set('courseId', params.courseId);
    if (params.openOnly) searchParams.set('openOnly', 'true');
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.pageSize) searchParams.set('pageSize', params.pageSize.toString());

    const response = await fetch(`${API_BASE}/courses?${searchParams.toString()}`);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Search failed' }));
      throw new Error(error.error || error.message || 'Failed to search courses');
    }

    const data = await response.json();
    
    // Transform UW API response format to expected format
    if (data.hits && Array.isArray(data.hits)) {
      return {
        courses: data.hits,
        totalResults: data.found || data.hits.length
      };
    }
    
    // Return as-is if already in expected format
    return data;
  }

  // Terms endpoint (public)
  async getTerms(): Promise<any> {
    const response = await fetch(`${API_BASE}/terms`);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Get terms failed' }));
      throw new Error(error.error || error.message || 'Failed to get terms');
    }

    const data = await response.json();
    return data;
  }
}

export const api = new ApiClient();