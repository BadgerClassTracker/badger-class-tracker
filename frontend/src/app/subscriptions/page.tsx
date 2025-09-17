'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Search, RefreshCw, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { api } from '@/lib/api';
// import type { Subscription } from '@shared/types';

export default function SubscriptionsPage() {
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userPicture, setUserPicture] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const queryClient = useQueryClient();
  const [deletingSubscriptions, setDeletingSubscriptions] = useState<Set<string>>(new Set());
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const router = useRouter();

  const { data: subscriptions, isLoading: subscriptionsLoading, error, refetch } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => api.listSubscriptions(),
    enabled: !!user,
    refetchOnWindowFocus: true, // Refetch when user switches back to this tab
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    staleTime: 5000 // Consider data stale after 5 seconds
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);


        // Get user data from the session
        const session = await fetchAuthSession();
        const idTokenPayload = session.tokens?.idToken?.payload;

        const email = idTokenPayload?.email as string;
        const picture = idTokenPayload?.picture as string;
        const givenName = idTokenPayload?.given_name as string;
        const familyName = idTokenPayload?.family_name as string;
        const fullName = `${givenName} ${familyName}`.trim();

        if (email) setUserEmail(email);
        // Remove size parameter for better compatibility
        if (picture) {
          const cleanPicture = picture.replace(/=s\d+-c$/, '');
          setUserPicture(cleanPicture);
        }
        if (fullName) setUserName(fullName);
      } catch {
        router.push('/signin');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showUserDropdown && !target.closest('.relative')) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserDropdown]);

  // Cross-tab synchronization
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'subscriptions-updated') {
        // Another tab updated subscriptions, refetch our data
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [queryClient]);

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

  const handleDeleteSubscription = async (subId: string) => {
    setDeletingSubscriptions(prev => new Set([...prev, subId]));
    setDeleteErrors(prev => ({ ...prev, [subId]: '' }));

    try {
      await api.deleteSubscription(subId);

      // Invalidate and refetch subscriptions
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });

      // Notify other tabs that subscriptions were updated
      localStorage.setItem('subscriptions-updated', Date.now().toString());
    } catch (err) {
      setDeleteErrors(prev => ({
        ...prev,
        [subId]: err instanceof Error ? err.message : 'Failed to delete subscription'
      }));
    } finally {
      setDeletingSubscriptions(prev => {
        const newSet = new Set(prev);
        newSet.delete(subId);
        return newSet;
      });
    }
  };

  const getNotifyOnBadge = (notifyOn: string) => {
    switch (notifyOn) {
      case 'OPEN':
        return <Badge className="bg-green-500">Open Seats</Badge>;
      case 'WAITLISTED':
        return <Badge variant="secondary">Waitlisted</Badge>;
      case 'ANY':
        return <Badge className="bg-blue-500">Any Change</Badge>;
      default:
        return <Badge variant="outline">{notifyOn}</Badge>;
    }
  };

  const getStatusBadge = (active: boolean) => {
    return active ? (
      <Badge className="bg-green-500">Active</Badge>
    ) : (
      <Badge variant="destructive">Inactive</Badge>
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
                <Link href="/search">
                  <Search className="h-4 w-4 mr-2" />
                  Search Classes
                </Link>
              </Button>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <button
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={userPicture}
                        alt={userName || userEmail || 'User'}
                      />
                      <AvatarFallback className="bg-badger-red text-white text-sm">
                        {(userName || userEmail || 'U')
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </button>

                  {showUserDropdown && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="text-sm font-medium text-gray-900 mb-1">{userName || 'User'}</div>
                        <div className="text-xs text-gray-500 break-all">{userEmail || 'Loading...'}</div>
                      </div>
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          handleSignOut();
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Page Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-3xl font-display font-bold text-text-dark-gray">
                My Subscriptions
              </h2>
              <p className="text-gray-600 mt-2">
                Manage your class notification subscriptions
              </p>
            </div>
            <Button
              onClick={() => refetch()}
              variant="outline"
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Loading State */}
          {subscriptionsLoading && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-gray-500">Loading your subscriptions...</div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>
                Failed to load subscriptions. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {/* Subscriptions List */}
          {subscriptions && (
            <>
              {subscriptions.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <div className="text-gray-500 mb-4">
                      You don&apos;t have any subscriptions yet.
                    </div>
                    <Button asChild className="bg-badger-red hover:bg-dark-red">
                      <Link href="/search">
                        <Search className="h-4 w-4 mr-2" />
                        Search for Classes
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Your Subscriptions ({subscriptions.length})
                    </CardTitle>
                    <CardDescription>
                      You&apos;ll receive email notifications when seats become available in these classes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Course</TableHead>
                          <TableHead>Section</TableHead>
                          <TableHead>Notify When</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscriptions.map((subscription) => (
                          <TableRow key={subscription.subId}>
                            <TableCell>
                              <div>
                                <div className="font-medium">
                                  {subscription.subjectDescription || subscription.subjectCode} {subscription.catalogNumber || subscription.courseId}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {subscription.sectionName ? (
                                <div className="font-medium">
                                  {subscription.sectionName}
                                </div>
                              ) : (
                                <div className="text-gray-500 text-sm">
                                  Unknown Section
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {getNotifyOnBadge(subscription.notifyOn)}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(subscription.active)}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-gray-600">
                                {new Date(subscription.createdAt).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeleteSubscription(subscription.subId)}
                                  disabled={deletingSubscriptions.has(subscription.subId)}
                                  className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                                >
                                  {deletingSubscriptions.has(subscription.subId) ? (
                                    <>
                                      <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                                      Unsubscribing...
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      Unsubscribe
                                    </>
                                  )}
                                </Button>
                                {deleteErrors[subscription.subId] && (
                                  <div className="text-xs text-red-600">
                                    {deleteErrors[subscription.subId]}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}

        </div>
      </main>
    </div>
  );
}