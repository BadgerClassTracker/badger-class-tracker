'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SignIn from '../components/sign-in';
import Logo from '../components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronDown } from 'lucide-react';

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userPicture, setUserPicture] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await getCurrentUser();
        setIsAuthenticated(true);

        // Get user data from the session
        const session = await fetchAuthSession();
        const idTokenPayload = session.tokens?.idToken?.payload;

        const email = idTokenPayload?.email as string;
        const picture = idTokenPayload?.picture as string;
        const givenName = idTokenPayload?.given_name as string;
        const familyName = idTokenPayload?.family_name as string;
        const fullName = `${givenName} ${familyName}`.trim();

        if (email) setUserEmail(email);
        if (picture) {
          const cleanPicture = picture.replace(/=s\d+-c$/, '');
          setUserPicture(cleanPicture);
        }
        if (fullName) setUserName(fullName);

        // Check if user should be redirected after sign-in
        const redirectPath = sessionStorage.getItem('redirectAfterSignIn');
        if (redirectPath) {
          sessionStorage.removeItem('redirectAfterSignIn');
          router.push(redirectPath);
        }
      } catch {
        setIsAuthenticated(false);
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

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsAuthenticated(false);
      setShowUserDropdown(false);
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Landing page for all users
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-badger-red/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-light-gray">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <Logo size="md" />
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <>
                  <Button asChild variant="outline">
                    <Link href="/search">Search</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/subscriptions">Subscriptions</Link>
                  </Button>
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
                          onClick={handleSignOut}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Sign out
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <SignIn />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16">
        <div className="text-center">
          <h1 className="text-4xl sm:text-6xl font-display font-bold text-text-dark-gray mb-6">
            Never Miss a
            <span className="text-badger-red"> UW-Madison</span>
            <br />Class Opening
          </h1>
          <p className="text-xl text-text-medium-gray mb-8 max-w-3xl mx-auto">
            Get instant email notifications when seats open up in your favorite courses.
            From <span className="font-semibold text-badger-red">COMP SCI 300</span> to <span className="font-semibold text-badger-red">BIOCHEM 501</span>,
            we&apos;ll help you get into the classes you need.
          </p>

          <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
            <Button asChild size="lg" className="bg-badger-red hover:bg-dark-red text-lg font-display font-semibold transform hover:scale-105 transition-transform duration-200">
              <Link href="/search">
                Get Started Free
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-lg font-display font-semibold hover:border-badger-red hover:text-badger-red transform hover:scale-105 transition-transform duration-200">
              <Link href="/learn-more">
                Learn More
              </Link>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="text-center hover:shadow-lg transform hover:scale-105 transition-all duration-200">
            <CardHeader>
              <div className="text-3xl mb-4">⚡</div>
              <CardTitle className="text-xl">Instant Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>Get notified within seconds when a seat opens up in your tracked classes.</CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transform hover:scale-105 transition-all duration-200">
            <CardHeader>
              <div className="text-3xl mb-4">🎯</div>
              <CardTitle className="text-xl">Smart Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>Track specific sections, labs, and discussion groups - not just lectures.</CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transform hover:scale-105 transition-all duration-200">
            <CardHeader>
              <div className="text-3xl mb-4">📱</div>
              <CardTitle className="text-xl">Mobile Friendly</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>Manage your subscriptions on any device, anywhere on campus.</CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* How it works */}
        <div className="mt-20">
          <h2 className="text-3xl font-display font-bold text-text-dark-gray mb-12 text-center">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-badger-red text-white rounded-full flex items-center justify-center text-xl font-display font-bold mb-4">1</div>
              <h3 className="text-lg font-display font-semibold mb-2 text-text-dark-gray">Search & Subscribe</h3>
              <p className="text-text-medium-gray">Find your desired course and click subscribe to track seat availability.</p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-badger-red text-white rounded-full flex items-center justify-center text-xl font-display font-bold mb-4">2</div>
              <h3 className="text-lg font-display font-semibold mb-2 text-text-dark-gray">We Monitor</h3>
              <p className="text-text-medium-gray">Our system continuously checks for open seats in your tracked classes.</p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-badger-red text-white rounded-full flex items-center justify-center text-xl font-display font-bold mb-4">3</div>
              <h3 className="text-lg font-display font-semibold mb-2 text-text-dark-gray">Get Notified</h3>
              <p className="text-text-medium-gray">Receive instant email alerts when seats become available.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-text-dark-gray">
            <p>&copy; 2025 Badger Class Tracker. Made for UW-Madison students.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
