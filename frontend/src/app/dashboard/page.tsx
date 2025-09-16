'use client';

import { useState, useEffect } from 'react';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-light-gray to-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-light-gray">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-3xl font-display font-bold text-text-dark-gray">
                🦡 Badger Class Tracker
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <Avatar 
                  src={user?.signInDetails?.profilePicture}
                  alt={user?.signInDetails?.loginId || user?.username || 'User'}
                  size="md"
                />
                <span className="font-text text-text-dark-gray">
                  {user?.signInDetails?.loginId || user?.username}
                </span>
              </div>
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
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <Card className="text-center border-dashed">
            <CardHeader>
              <CardTitle className="text-2xl">Welcome to your dashboard!</CardTitle>
              <CardDescription>
                Get notified when seats open up in your favorite UW-Madison classes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button asChild className="bg-badger-red hover:bg-dark-red text-white">
                <Link href="/search">
                  🔍 Search Classes
                </Link>
              </Button>
              <br />
              <Button asChild className="bg-link-blue hover:bg-badger-red text-white">
                <Link href="/subscriptions">
                  📋 My Subscriptions
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}