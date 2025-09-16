'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Clock, Users, MapPin, ChevronDown, ChevronUp, CheckCircle, Bell } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { api } from '@/lib/api';
import type { Course, Section, CreateSubscriptionRequest } from '@shared/types';

export default function SearchPage() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('0000'); // Default to all terms
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [subscriptionStates, setSubscriptionStates] = useState({});
  const [subscriptionErrors, setSubscriptionErrors] = useState({});
  const [courseSections, setCourseSections] = useState<{[key: string]: Section[]}>({});
  const [loadingSections, setLoadingSections] = useState<Set<string>>(new Set());
  const [expandedLectures, setExpandedLectures] = useState<Set<string>>(new Set());
  const router = useRouter();

  const { data: searchResults, isLoading: searchLoading, error } = useQuery({
    queryKey: ['searchCourses', searchQuery, selectedTerm],
    queryFn: () => api.searchCourses({ search: searchQuery, term: selectedTerm !== '0000' ? selectedTerm : undefined }),
    enabled: searchQuery.length > 2 && !!user
  });

  const { data: termsData, isLoading: termsLoading } = useQuery({
    queryKey: ['getTerms'],
    queryFn: () => api.getTerms(),
    enabled: !!user
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

  const toggleCourseExpansion = async (courseKey: string, course: Course) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseKey)) {
      newExpanded.delete(courseKey);
    } else {
      newExpanded.add(courseKey);

      // Load sections if not already loaded
      if (!courseSections[courseKey]) {
        setLoadingSections(prev => new Set(prev).add(courseKey));

        try {
          const sectionsData = await api.searchCourses({
            term: course.termCode,
            subject: course.subject?.subjectCode,
            courseId: course.courseId
          });

          // Handle enrollment packages - each package is one thing students can register for
          let groupedSections = [];
          if (Array.isArray(sectionsData)) {
            // Group enrollment packages by their parent section (auto-enroll class)
            const parentGroups = new Map();
            const standalonePackages = [];

            sectionsData.forEach(pkg => {
              const autoEnrollClasses = pkg.autoEnrollClasses || [];
              const sections = pkg.sections || [];

              // Transform the enrollment section (what students register for)
              const enrollmentSection = sections.find(s => s.classUniqueId.classNumber.toString() === pkg.enrollmentClassNumber.toString());
              if (!enrollmentSection) return;

              const transformedEnrollmentSection = {
                classUniqueId: enrollmentSection.classUniqueId,
                type: enrollmentSection.type,
                sectionNumber: enrollmentSection.sectionNumber,
                enrollmentStatus: {
                  enrolled: enrollmentSection.enrollmentStatus?.currentlyEnrolled || 0,
                  capacity: enrollmentSection.enrollmentStatus?.capacity || 0,
                  openSeats: enrollmentSection.enrollmentStatus?.openSeats || 0,
                  waitlisted: enrollmentSection.enrollmentStatus?.waitlistCurrentSize || 0
                },
                packageEnrollmentStatus: {
                  status: enrollmentSection.enrollmentStatus?.openSeats > 0 ? "OPEN" : "CLOSED"
                },
                instructors: enrollmentSection.instructors?.map(inst => ({
                  name: `${inst.name?.first || ''} ${inst.name?.last || ''}`.trim(),
                  email: inst.email
                })) || [],
                meetings: enrollmentSection.classMeetings?.filter(meeting => meeting.meetingType === 'CLASS')?.map(meeting => ({
                  dayPattern: meeting.meetingDays || '',
                  startTime: new Date(meeting.meetingTimeStart).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  }),
                  endTime: new Date(meeting.meetingTimeEnd).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  }),
                  room: meeting.building && meeting.room ? {
                    facility: meeting.building.buildingName || '',
                    room: meeting.room
                  } : undefined
                })) || [],
                isSubscribable: true // Students register for this directly
              };

              if (autoEnrollClasses && autoEnrollClasses.length > 0) {
                // This package has a parent (LEC + LAB/DIS pattern)
                const parentId = autoEnrollClasses[0];

                if (!parentGroups.has(parentId)) {
                  // Find and store the parent section
                  const parentSection = sections.find(s => s.classUniqueId.classNumber.toString() === parentId.toString());
                  if (parentSection) {
                    const transformedParentSection = {
                      classUniqueId: parentSection.classUniqueId,
                      type: parentSection.type,
                      sectionNumber: parentSection.sectionNumber,
                      enrollmentStatus: {
                        enrolled: parentSection.enrollmentStatus?.currentlyEnrolled || 0,
                        capacity: parentSection.enrollmentStatus?.capacity || 0,
                        openSeats: parentSection.enrollmentStatus?.openSeats || 0,
                        waitlisted: parentSection.enrollmentStatus?.waitlistCurrentSize || 0
                      },
                      packageEnrollmentStatus: {
                        status: parentSection.enrollmentStatus?.openSeats > 0 ? "OPEN" : "CLOSED"
                      },
                      instructors: parentSection.instructors?.map(inst => ({
                        name: `${inst.name?.first || ''} ${inst.name?.last || ''}`.trim(),
                        email: inst.email
                      })) || [],
                      meetings: parentSection.classMeetings?.filter(meeting => meeting.meetingType === 'CLASS')?.map(meeting => ({
                        dayPattern: meeting.meetingDays || '',
                        startTime: new Date(meeting.meetingTimeStart).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }),
                        endTime: new Date(meeting.meetingTimeEnd).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }),
                        room: meeting.building && meeting.room ? {
                          facility: meeting.building.buildingName || '',
                          room: meeting.room
                        } : undefined
                      })) || [],
                      isSubscribable: false // Students don't register for this directly
                    };

                    parentGroups.set(parentId, {
                      lecture: transformedParentSection,
                      labs: []
                    });
                  }
                }

                // Add this enrollment section to the parent group
                const parentGroup = parentGroups.get(parentId);
                if (parentGroup) {
                  parentGroup.labs.push(transformedEnrollmentSection);
                }
              } else {
                // This is a standalone course (SEM, standalone LEC, etc.)
                standalonePackages.push({
                  lecture: transformedEnrollmentSection,
                  labs: []
                });
              }
            });

            // Combine parent groups and standalone packages, then reverse to correct order
            groupedSections = [...Array.from(parentGroups.values()), ...standalonePackages].reverse();

            // Also reverse labs within each group
            groupedSections.forEach(group => {
              if (group.labs && group.labs.length > 0) {
                group.labs.reverse();
              }
            });
          }

          if (groupedSections.length > 0) {

            setCourseSections(prev => ({
              ...prev,
              [courseKey]: groupedSections
            }));
          }
        } catch (error) {
          console.error('Failed to load sections:', error);
        } finally {
          setLoadingSections(prev => {
            const newSet = new Set(prev);
            newSet.delete(courseKey);
            return newSet;
          });
        }
      }
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
      return <Badge className="bg-red-600 text-white">Closed</Badge>;
    }
  };

  const toggleLectureExpansion = (lectureId: string) => {
    const newExpanded = new Set(expandedLectures);
    if (newExpanded.has(lectureId)) {
      newExpanded.delete(lectureId);
    } else {
      newExpanded.add(lectureId);
    }
    setExpandedLectures(newExpanded);
  };

  const getTermLabel = (termCode: string) => {
    const term = termsData?.terms?.find((t: any) => t.value === termCode);
    if (term) return term.label;

    // Fallback: decode UW term codes using the correct pattern
    if (termCode.length === 4) {
      const termNum = parseInt(termCode);
      const lastDigit = termCode.substring(3);

      // Find the year by working backwards from the term number
      // Pattern: 1204=2020 Spring, 1214=2021 Spring, 1224=2022 Spring, etc.
      // Spring terms end in 4 and increment by 10 each year starting at 1204 for 2020
      let year, semesterName;

      if (lastDigit === '4') {
        // Spring: 1204, 1214, 1224, 1234, 1244, 1254...
        year = 2020 + (termNum - 1204) / 10;
        semesterName = 'Spring';
      } else if (lastDigit === '6') {
        // Summer: 1206, 1216, 1226, 1236, 1246, 1256...
        year = 2020 + (termNum - 1206) / 10;
        semesterName = 'Summer';
      } else if (lastDigit === '2') {
        // Fall: 1212, 1222, 1232, 1242, 1252, 1262...
        year = 2020 + (termNum - 1212) / 10;
        semesterName = 'Fall';
      } else {
        return `Term ${termCode}`;
      }

      return `${semesterName} ${year}`;
    }

    return `Term ${termCode}`;
  };

  const getSubscriptionButton = (section: Section, course: Course) => {
    const sectionKey = section.classUniqueId.classNumber;
    const state = (subscriptionStates as any)[sectionKey] || 'idle';
    const error = (subscriptionErrors as any)[sectionKey];

    if (state === 'success') {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled
          className="border-green-500 text-green-600 bg-green-50 hover:bg-green-50"
        >
          <CheckCircle className="h-3 w-3 mr-1" />
          Subscribed
        </Button>
      );
    }

    return (
      <div className="space-y-1">
        <Button
          size="sm"
          variant="outline"
          className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:border-blue-600"
          onClick={() => handleSubscribe(section, course)}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent mr-1"></div>
              Subscribing...
            </>
          ) : (
            <>
              <Bell className="h-3 w-3 mr-1" />
              Subscribe
            </>
          )}
        </Button>
        {error && (
          <div className="text-xs text-red-600 mt-1">{error}</div>
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
                <div className="w-48">
                  <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-white">
                      {termsLoading ? (
                        <SelectItem value="loading" disabled>Loading terms...</SelectItem>
                      ) : (
                        termsData?.terms?.map((term: any) => (
                          <SelectItem key={term.value} value={term.value}>
                            {term.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
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
              
              {searchResults.courses.map((course: Course, index: number) => {
                const courseKey = `${course.subject.termCode}-${course.subject.subjectCode}-${course.catalogNumber}-${index}`;
                const isExpanded = expandedCourses.has(courseKey);
                
                return (
                  <Card key={courseKey} className="cursor-pointer hover:bg-gray-50 hover:shadow-md transition-all duration-200">
                    <CardHeader onClick={() => toggleCourseExpansion(courseKey, course)}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-lg">
                            <div className="flex items-center gap-2">
                              <span>{course.subject?.shortDescription || course.subject?.subjectCode} {course.catalogNumber}</span>
                              <span className="text-sm font-normal text-gray-600">
                                ({(() => {
                                  const credits = course.creditRange || course.credits;
                                  return credits === '1' ? '1 credit' : `${credits} credits`;
                                })()})
                              </span>
                              {selectedTerm === '0000' && (
                                <Badge variant="outline" className="text-xs">
                                  {getTermLabel(course.termCode)}
                                </Badge>
                              )}
                            </div>
                          </CardTitle>
                          <CardDescription>
                            {course.title}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 ml-4">
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-4 w-4" />
                              <span className="text-sm font-medium">Hide Sections</span>
                            </>
                          ) : loadingSections.has(courseKey) ? (
                            <span className="text-sm font-medium">Loading Sections...</span>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4" />
                              <span className="text-sm font-medium">Show Sections</span>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent>
                        <div className="space-y-4">
                          {courseSections[courseKey]?.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 font-medium text-gray-700">Section</th>
                                    <th className="text-left py-2 px-3 font-medium text-gray-700">Day/Time & Location</th>
                                    <th className="text-left py-2 px-3 font-medium text-gray-700">Instructor</th>
                                    <th className="text-left py-2 px-3 font-medium text-gray-700">Credits</th>
                                    <th className="text-left py-2 px-3 font-medium text-gray-700">Seats</th>
                                    <th className="text-left py-2 px-3 font-medium text-gray-700">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {courseSections[courseKey].map((group, groupIndex) => {
                                    const lectureId = group.lecture?.classUniqueId.classNumber;
                                    const isExpanded = lectureId && expandedLectures.has(lectureId);
                                    const hasLabs = (group.labs || []).length > 0;

                                    return [
                                      // Lecture row
                                      group.lecture && (
                                        <tr
                                          key={`lecture-${group.lecture.classUniqueId.classNumber}-${groupIndex}`}
                                          className={`border-b border-gray-100 cursor-pointer transition-colors ${
                                            hasLabs ? 'hover:bg-blue-50' : 'hover:bg-gray-50'
                                          }`}
                                          onClick={() => hasLabs && toggleLectureExpansion(lectureId)}
                                        >
                                          <td className="py-3 px-3">
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                {hasLabs && (
                                                  <div className="text-gray-400">
                                                    {isExpanded ? (
                                                      <ChevronUp className="h-4 w-4" />
                                                    ) : (
                                                      <ChevronDown className="h-4 w-4" />
                                                    )}
                                                  </div>
                                                )}
                                                <div>
                                                  <div className="font-medium">
                                                    {group.lecture.type} {group.lecture.sectionNumber}
                                                    <span className="text-sm text-gray-500 ml-2">
                                                      ({(group.labs || []).length} section{(group.labs || []).length !== 1 ? 's' : ''})
                                                    </span>
                                                  </div>
                                                  <div className="text-xs text-gray-500">
                                                    Class #{group.lecture.classUniqueId.classNumber}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            <div className="space-y-1">
                                              {group.lecture.meetings.map((meeting, idx) => (
                                                <div key={idx} className="text-sm">
                                                  <div className="font-medium">
                                                    {meeting.dayPattern} {meeting.startTime} - {meeting.endTime}
                                                  </div>
                                                  {meeting.room && (
                                                    <div className="text-gray-600">
                                                      {meeting.room.room} {meeting.room.facility}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            <div className="text-sm">
                                              {group.lecture.instructors.length > 0
                                                ? group.lecture.instructors.map(i => i.name).join(', ')
                                                : 'TBA'
                                              }
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            <div className="text-sm">
                                              {(() => {
                                                const credits = course.creditRange || course.credits;
                                                return credits === '1' ? '1.00 Cr' : `${credits}.00 Cr`;
                                              })()}
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                {getStatusBadge(
                                                  group.lecture.packageEnrollmentStatus.status,
                                                  group.lecture.enrollmentStatus.openSeats
                                                )}
                                              </div>
                                              <div className="text-xs text-gray-600">
                                                {group.lecture.enrollmentStatus.enrolled}/{group.lecture.enrollmentStatus.capacity}
                                                {group.lecture.enrollmentStatus.waitlisted > 0 && (
                                                  <span className="ml-1">({group.lecture.enrollmentStatus.waitlisted} waitlisted)</span>
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            {group.lecture.isSubscribable ? (
                                              getSubscriptionButton(group.lecture, course)
                                            ) : (
                                              <div className="text-xs text-gray-500 text-center">
                                                Auto-enrolled
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      ),
                                      // Lab rows (only show when expanded)
                                      ...(isExpanded ? (group.labs || []).map((section, labIndex) => (
                                        <tr
                                          key={`lab-${section.classUniqueId.classNumber}-${groupIndex}-${labIndex}`}
                                          className="border-b border-gray-100 hover:bg-blue-50 bg-gray-50"
                                        >
                                          <td className="py-3 px-3 pl-8">
                                            <div className="space-y-1">
                                              <div className="font-medium text-blue-600">
                                                {section.type} {section.sectionNumber}
                                              </div>
                                              <div className="text-xs text-gray-500">
                                                Class #{section.classUniqueId.classNumber}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            <div className="space-y-1">
                                              {section.meetings.map((meeting, idx) => (
                                                <div key={idx} className="text-sm">
                                                  <div className="font-medium">
                                                    {meeting.dayPattern} {meeting.startTime} - {meeting.endTime}
                                                  </div>
                                                  {meeting.room && (
                                                    <div className="text-gray-600">
                                                      {meeting.room.room} {meeting.room.facility}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            <div className="text-sm">
                                              {section.instructors.length > 0
                                                ? section.instructors.map(i => i.name).join(', ')
                                                : 'TBA'
                                              }
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            <div className="text-sm">
                                              {(() => {
                                                const credits = course.creditRange || course.credits;
                                                return credits === '1' ? '1.00 Cr' : `${credits}.00 Cr`;
                                              })()}
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                {getStatusBadge(
                                                  section.packageEnrollmentStatus.status,
                                                  section.enrollmentStatus.openSeats
                                                )}
                                              </div>
                                              <div className="text-xs text-gray-600">
                                                {section.enrollmentStatus.enrolled}/{section.enrollmentStatus.capacity}
                                                {section.enrollmentStatus.waitlisted > 0 && (
                                                  <span className="ml-1">({section.enrollmentStatus.waitlisted} waitlisted)</span>
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-3 px-3">
                                            {section.isSubscribable ? (
                                              getSubscriptionButton(section, course)
                                            ) : (
                                              <div className="text-xs text-gray-500 text-center">
                                                Auto-enrolled
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      )) : [])
                                    ].flat().filter(Boolean);
                                  }).flat()}
                                </tbody>
                              </table>
                            </div>
                          ) : loadingSections.has(courseKey) ? (
                            <div className="p-4 border rounded-lg bg-gray-50 text-center text-gray-600">
                              Loading sections...
                            </div>
                          ) : (
                            <div className="p-4 border rounded-lg bg-gray-50 text-center text-gray-600">
                              No sections available for this course.
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