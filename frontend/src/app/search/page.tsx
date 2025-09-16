'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Clock, Users, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { api } from '@/lib/api';
import type { Course, Section, CreateSubscriptionRequest } from '@shared/types';

export default function SearchPage() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [subscriptionStates, setSubscriptionStates] = useState({});
  const [subscriptionErrors, setSubscriptionErrors] = useState({});
  const router = useRouter();

  const { data: searchResults, isLoading: searchLoading, error } = useQuery({
    queryKey: ['searchCourses', searchQuery],
    queryFn: () => api.searchCourses({ search: searchQuery }),
    enabled: searchQuery.length > 2 && !!user
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        router.push('/signin');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null; // Will redirect
  }

  const toggleCourseExpansion = (courseKey: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseKey)) {
      newExpanded.delete(courseKey);
    } else {
      newExpanded.add(courseKey);
    }
    setExpandedCourses(newExpanded);
  };

  const handleSubscribe = async (section: Section, course: Course) => {
    const sectionKey = section.classUniqueId.classNumber;
    
    setSubscriptionStates(prev => ({ ...prev, [sectionKey]: 'loading' }));
    setSubscriptionErrors(prev => ({ ...prev, [sectionKey]: '' }));
    
    try {
      const request: CreateSubscriptionRequest = {
        termCode: section.classUniqueId.termCode,
        subjectCode: course.subject.subjectCode,
        courseId: course.catalogNumber,
        classNumber: section.classUniqueId.classNumber,
        notifyOn: 'OPEN'
      };
      
      await api.createSubscription(request);
      setSubscriptionStates(prev => ({ ...prev, [sectionKey]: 'success' }));
      
      // Clear success state after 3 seconds
      setTimeout(() => {
        setSubscriptionStates(prev => ({ ...prev, [sectionKey]: 'idle' }));
      }, 3000);
    } catch (err) {
      setSubscriptionStates(prev => ({ ...prev, [sectionKey]: 'error' }));
      setSubscriptionErrors(prev => ({ 
        ...prev, 
        [sectionKey]: err instanceof Error ? err.message : 'Failed to create subscription' 
      }));
    }
  };

  const getStatusBadge = (status: string, openSeats: number) => {
    if (status === 'OPEN' && openSeats > 0) {
      return <Badge className="bg-green-500">Open ({openSeats} seats)</Badge>;
    } else if (status === 'WAITLISTED') {
      return <Badge variant="secondary">Waitlisted</Badge>;
    } else {
      return <Badge variant="destructive">Closed</Badge>;
    }
  };

  const getSubscriptionButton = (section: Section, course: Course) => {
    const sectionKey = section.classUniqueId.classNumber;
    const state = (subscriptionStates as any)[sectionKey] || 'idle';
    const error = (subscriptionErrors as any)[sectionKey];

    if (state === 'success') {
      return (
        <Button size="sm" disabled className="bg-green-500">
          ✓ Subscribed
        </Button>
      );
    }

    return (
      <div className="space-y-1">
        <Button 
          size="sm" 
          className="bg-badger-red hover:bg-dark-red"
          onClick={() => handleSubscribe(section, course)}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? (
            'Subscribing...'
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" />
              Subscribe
            </>
          )}
        </Button>
        {error && (
          <div className="text-xs text-red-600">{error}</div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-light-gray to-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-light-gray">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <Link href="/search" className="flex items-center">
              <h1 className="text-3xl font-display font-bold text-text-dark-gray">
                🦡 Badger Class Tracker
              </h1>
            </Link>
            <div className="flex items-center space-x-4">
              <Button asChild variant="outline">
                <Link href="/subscriptions">My Subscriptions</Link>
              </Button>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-600">
                  {user?.signInDetails?.loginId || user?.username}
                </span>
                <Button
                  onClick={handleSignOut}
                  variant="secondary"
                  className="hover:bg-badger-red hover:text-white"
                >
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Search Form */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search UW-Madison Classes
              </CardTitle>
              <CardDescription>
                Find courses and subscribe to get notified when seats open up
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search by course code, title, or instructor (e.g., 'COMP SCI 300', 'data structures', 'Smith')"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
              {searchQuery.length > 0 && searchQuery.length <= 2 && (
                <p className="text-sm text-gray-500 mt-2">
                  Type at least 3 characters to search
                </p>
              )}
            </CardContent>
          </Card>

          {/* Search Results */}
          {searchLoading && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-gray-500">Searching courses...</div>
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to search courses. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {searchResults?.courses && searchResults.courses.length > 0 && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                Found {searchResults.totalResults} results
              </div>
              
              {searchResults.courses.map((course: Course) => {
                const courseKey = `${course.subject.subjectCode}-${course.catalogNumber}`;
                const isExpanded = expandedCourses.has(courseKey);
                
                return (
                  <Card key={courseKey}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">
                            {course.subject.subjectCode} {course.catalogNumber}: {course.title}
                          </CardTitle>
                          <CardDescription>
                            {course.credits} credits • {course.subject.description}
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCourseExpansion(courseKey)}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-4 w-4 mr-1" />
                              Hide Sections
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4 mr-1" />
                              Show Sections ({course.sections?.length || 0})
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent>
                        <div className="space-y-3">
                          {course.sections?.length > 0 ? course.sections.map((section) => (
                            <div 
                              key={section.classUniqueId.classNumber}
                              className="p-4 border rounded-lg bg-gray-50"
                            >
                              <div className="flex justify-between items-start">
                                <div className="space-y-2 flex-1">
                                  <div className="flex items-center gap-4">
                                    <span className="font-medium">
                                      {section.type} {section.sectionNumber}
                                    </span>
                                    {getStatusBadge(
                                      section.packageEnrollmentStatus.status,
                                      section.enrollmentStatus.openSeats
                                    )}
                                    <span className="text-sm text-gray-600">
                                      Class #{section.classUniqueId.classNumber}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 text-sm text-gray-600">
                                    <div className="flex items-center gap-1">
                                      <Users className="h-4 w-4" />
                                      {section.enrollmentStatus.enrolled}/{section.enrollmentStatus.capacity}
                                    </div>
                                    {section.enrollmentStatus.waitlisted > 0 && (
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-4 w-4" />
                                        {section.enrollmentStatus.waitlisted} waitlisted
                                      </div>
                                    )}
                                  </div>

                                  {section.meetings.map((meeting, idx) => (
                                    <div key={idx} className="flex items-center gap-4 text-sm text-gray-600">
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-4 w-4" />
                                        {meeting.dayPattern} {meeting.startTime}-{meeting.endTime}
                                      </div>
                                      {meeting.room && (
                                        <div className="flex items-center gap-1">
                                          <MapPin className="h-4 w-4" />
                                          {meeting.room.facility} {meeting.room.room}
                                        </div>
                                      )}
                                    </div>
                                  ))}

                                  {section.instructors.length > 0 && (
                                    <div className="text-sm text-gray-600">
                                      Instructor: {section.instructors.map(i => i.name).join(', ')}
                                    </div>
                                  )}
                                </div>
                                
                                <div className="ml-4">
                                  {getSubscriptionButton(section, course)}
                                </div>
                              </div>
                            </div>
                          )) : (
                            <div className="p-4 border rounded-lg bg-gray-50 text-center text-gray-600">
                              No sections available. Click course title to load enrollment information.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {searchResults?.courses && searchResults.courses.length === 0 && searchQuery.length > 2 && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-gray-500">
                  No courses found matching &quot;{searchQuery}&quot;. Try different keywords.
                </div>
              </CardContent>
            </Card>
          )}

          {!searchQuery && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-gray-500">
                  Start typing to search for UW-Madison courses
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}