'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SignIn from '../components/sign-in';
import Logo from '../components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await getCurrentUser();
        setIsAuthenticated(true);
        router.push('/search');
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isAuthenticated) {
    return null; // Will redirect to search
  }

  // Landing page for non-authenticated users
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
              <SignIn />
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
            <Button variant="outline" size="lg" className="text-lg font-display font-semibold hover:border-badger-red hover:text-badger-red transform hover:scale-105 transition-transform duration-200">
              Learn More
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
