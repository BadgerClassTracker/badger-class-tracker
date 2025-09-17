// shared/types.ts
// Shared TypeScript types for frontend and backend

export interface Subscription {
  subId: string;
  userId: string;
  termCode: string;
  subjectCode: string;
  courseId: string;
  catalogNumber?: string;
  classNumber: string;
  sectionName?: string;
  notifyOn: "OPEN" | "WAITLISTED" | "ANY";
  active: boolean;
  createdAt: string;
  title?: string;
  subjectDescription?: string;
}

export interface CreateSubscriptionRequest {
  termCode: string;
  subjectCode: string;
  courseId: string;
  catalogNumber: string;
  classNumber: number | string;
  notifyOn?: "OPEN" | "WAITLISTED" | "ANY";
  sectionName?: string;
}

export interface CreateSubscriptionResponse {
  subId: string;
  message: string;
}

export interface Course {
  courseId: string;
  subject: {
    subjectCode: string;
    shortDescription: string;
    description: string;
    termCode: string;
  };
  catalogNumber: string;
  title: string;
  credits: string;
  sections: Section[];
}

export interface Section {
  classUniqueId: {
    classNumber: string;
    termCode: string;
  };
  type: string; // "LEC", "LAB", "DIS", etc.
  sectionNumber: string;
  enrollmentStatus: {
    enrolled: number;
    capacity: number;
    openSeats: number;
    waitlisted: number;
  };
  packageEnrollmentStatus: {
    status: "OPEN" | "WAITLISTED" | "CLOSED";
  };
  instructors: {
    name: string;
    email?: string;
  }[];
  meetings: {
    dayPattern: string;
    startTime: string;
    endTime: string;
    room?: {
      facility: string;
      room: string;
    };
  }[];
}

export interface CourseSearchResponse {
  courses: Course[];
  totalResults: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  message?: string;
}

// UW API Types
export interface UWCourseSearchRequest {
  selectedTerm: string;
  queryString: string;
  filters?: any[];
  page: number;
  pageSize: number;
  sortOrder: string;
}

export interface UWEnrollmentPackage {
  enrollmentClassNumber: string;
  subject: {
    termCode: string;
    subjectCode: string;
    description: string;
    shortDescription: string;
  };
  catalogNumber: string;
  title: string;
  sections: {
    classUniqueId: {
      classNumber: string;
    };
    type: string;
    sectionNumber: string;
  }[];
  packageEnrollmentStatus: {
    status: string;
  };
}