'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Search, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';

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
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const [deletingSubscriptions, setDeletingSubscriptions] = useState<Set<string>>(new Set());
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const router = useRouter();

  const { data: subscriptions, isLoading: subscriptionsLoading, error, refetch } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => api.listSubscriptions(),
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

  const handleDeleteSubscription = async (subId: string) => {
    setDeletingSubscriptions(prev => new Set([...prev, subId]));
    setDeleteErrors(prev => ({ ...prev, [subId]: '' }));
    
    try {
      await api.deleteSubscription(subId);
      
      // Invalidate and refetch subscriptions
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
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
                          <TableHead>Class #</TableHead>
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
                                  {subscription.subjectCode} {subscription.courseId}
                                </div>
                                {subscription.title && (
                                  <div className="text-sm text-gray-600">
                                    {subscription.title}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                                {subscription.classNumber}
                              </code>
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
                                >
                                  {deletingSubscriptions.has(subscription.subId) ? (
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3 w-3" />
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

          {/* Help Text */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg">How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-badger-red text-white rounded-full flex items-center justify-center text-xl font-display font-bold mb-3 mx-auto">
                    1
                  </div>
                  <h3 className="font-medium mb-2">Subscribe to Classes</h3>
                  <p className="text-sm text-gray-600">
                    Search for courses and subscribe to specific sections you want to get into.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-badger-red text-white rounded-full flex items-center justify-center text-xl font-display font-bold mb-3 mx-auto">
                    2
                  </div>
                  <h3 className="font-medium mb-2">We Monitor</h3>
                  <p className="text-sm text-gray-600">
                    Our system continuously checks for seat availability in your subscribed classes.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-badger-red text-white rounded-full flex items-center justify-center text-xl font-display font-bold mb-3 mx-auto">
                    3
                  </div>
                  <h3 className="font-medium mb-2">Get Notified</h3>
                  <p className="text-sm text-gray-600">
                    Receive instant email alerts when seats become available in your classes.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}