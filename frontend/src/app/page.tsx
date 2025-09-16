'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SignIn from '../components/sign-in';
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
    <div className="min-h-screen bg-gradient-to-br from-light-gray to-white">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm shadow-sm border-b border-light-gray">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-display font-bold text-text-dark-gray">
                🦡 Badger Class Tracker
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <SignIn></SignIn>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <h1 className="text-4xl sm:text-6xl font-display font-bold text-text-dark-gray mb-6">
            Never Miss a
            <span className="text-badger-red"> UW-Madison</span>
            <br />Class Opening
          </h1>
          <p className="text-xl font-text text-text-dark-gray mb-8 max-w-3xl mx-auto">
            Get instant email notifications when seats open up in your favorite courses.
            From <span className="font-display font-semibold text-badger-red">CURRIC 277</span> to <span className="font-display font-semibold text-badger-red">BIOCHEM 104</span>, we&apos;ll help you get into the classes you need.
          </p>

          <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
            <Button asChild size="lg" className="w-full sm:w-auto bg-badger-red hover:bg-dark-red text-lg font-display font-semibold shadow-lg">
              <Link href="/signin">
                Get Started Free
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="w-full sm:w-auto text-lg font-display font-semibold hover:border-badger-red hover:text-badger-red">
              Learn More
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="text-center hover:border-badger-red transition-colors duration-200">
            <CardHeader>
              <div className="text-3xl mb-4">⚡</div>
              <CardTitle className="text-xl">Instant Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>Get notified within seconds when a seat opens up in your tracked classes.</CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center hover:border-badger-red transition-colors duration-200">
            <CardHeader>
              <div className="text-3xl mb-4">🎯</div>
              <CardTitle className="text-xl">Smart Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>Track specific sections, labs, and discussion groups - not just lectures.</CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center hover:border-badger-red transition-colors duration-200">
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
        <div className="mt-20 text-center">
          <h2 className="text-3xl font-display font-bold text-text-dark-gray mb-12">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-badger-red text-white rounded-full flex items-center justify-center text-xl font-display font-bold mb-4">1</div>
              <h3 className="text-lg font-display font-semibold mb-2 text-text-dark-gray">Search & Subscribe</h3>
              <p className="font-text text-text-dark-gray">Find your desired course and click subscribe to track seat availability.</p>
            </div>

            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-badger-red text-white rounded-full flex items-center justify-center text-xl font-display font-bold mb-4">2</div>
              <h3 className="text-lg font-display font-semibold mb-2 text-text-dark-gray">We Monitor</h3>
              <p className="font-text text-text-dark-gray">Our system continuously checks for open seats in your tracked classes.</p>
            </div>

            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-badger-red text-white rounded-full flex items-center justify-center text-xl font-display font-bold mb-4">3</div>
              <h3 className="text-lg font-display font-semibold mb-2 text-text-dark-gray">Get Notified</h3>
              <p className="font-text text-text-dark-gray">Receive instant email alerts when seats become available.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-light-gray mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-text-dark-gray">
            <p className="font-text">&copy; 2025 Badger Class Tracker. Made for UW-Madison students.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
