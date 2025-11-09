'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SignIn from '../../components/sign-in';
import Logo from '../../components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronDown, Bell, Clock, Shield, Zap, Mail, Search, Github } from 'lucide-react';

export default function LearnMorePage() {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
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
                <>
                  <Button asChild variant="ghost">
                    <Link href="/">Home</Link>
                  </Button>
                  <SignIn />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* About Us */}
        <section className="mb-20">
          <h2 className="text-3xl font-display font-bold text-text-dark-gray mb-12 text-center">
            About Us
          </h2>
          <div className="max-w-4xl mx-auto space-y-12">
            {/* Jin Kim */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="flex flex-col md:flex-row gap-6 items-start">
                  <Avatar className="h-32 w-32 flex-shrink-0">
                    <AvatarImage
                      src="/team/jin-kim.jpg"
                      alt="Jin Kim"
                    />
                    <AvatarFallback className="bg-badger-red text-white text-3xl">
                      JK
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-2xl font-display font-bold text-text-dark-gray mb-2">
                      Jin Kim
                    </h3>
                    <p className="text-badger-red font-semibold mb-4">
                      Developer & Designer
                    </p>
                    <p className="text-text-medium-gray text-base leading-relaxed mb-4">
                      Super senior at UW-Madison.
                      <br />
                      I know how much enrolling sucks because trust me, I&apos;ve been there.
                    </p>
                    <Button asChild variant="outline" size="sm" className="hover:border-badger-red hover:text-badger-red">
                      <a href="https://github.com/imnotjin" target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
                        <Github className="h-4 w-4 mr-2" />
                        GitHub
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Freddy Seo */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="flex flex-col md:flex-row gap-6 items-start">
                  <Avatar className="h-32 w-32 flex-shrink-0">
                    <AvatarImage
                      src="/team/freddy-seo.jpg"
                      alt="Freddy Seo"
                    />
                    <AvatarFallback className="bg-badger-red text-white text-3xl">
                      FS
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-2xl font-display font-bold text-text-dark-gray mb-2">
                      Freddy Seo
                    </h3>
                    <p className="text-badger-red font-semibold mb-4">
                      Developer & Designer
                    </p>
                    <p className="text-text-medium-gray text-base leading-relaxed mb-4">
                      UW-Madison student dedicated to creating user-friendly applications that enhance the student experience. Co-creator of Badger Class Tracker, bringing expertise in interface design and development to ensure the platform is intuitive and accessible for all students.
                    </p>
                    <Button asChild variant="outline" size="sm" className="hover:border-badger-red hover:text-badger-red">
                      <a href="https://github.com/wdragj" target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
                        <Github className="h-4 w-4 mr-2" />
                        GitHub
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Key Features */}
        <section className="mb-20 bg-white rounded-xl p-8 shadow-sm">
          <h2 className="text-3xl font-display font-bold text-text-dark-gray mb-8 text-center">
            Key Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-badger-red rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white text-sm">✓</span>
              </div>
              <div>
                <h3 className="font-display font-semibold text-text-dark-gray mb-1">Track Multiple Courses</h3>
                <p className="text-text-medium-gray">Monitor as many sections as you need across different subjects and terms.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-badger-red rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white text-sm">✓</span>
              </div>
              <div>
                <h3 className="font-display font-semibold text-text-dark-gray mb-1">Real-Time Updates</h3>
                <p className="text-text-medium-gray">Get notified within minutes when enrollment status changes.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-badger-red rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white text-sm">✓</span>
              </div>
              <div>
                <h3 className="font-display font-semibold text-text-dark-gray mb-1">Easy Management</h3>
                <p className="text-text-medium-gray">View and manage all your subscriptions in one convenient dashboard.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-badger-red rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white text-sm">✓</span>
              </div>
              <div>
                <h3 className="font-display font-semibold text-text-dark-gray mb-1">Mobile Friendly</h3>
                <p className="text-text-medium-gray">Access from any device - desktop, tablet, or smartphone.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-badger-red rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white text-sm">✓</span>
              </div>
              <div>
                <h3 className="font-display font-semibold text-text-dark-gray mb-1">Simple Sign-In</h3>
                <p className="text-text-medium-gray">Quick Google OAuth authentication - no complex registration required.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-badger-red rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-white text-sm">✓</span>
              </div>
              <div>
                <h3 className="font-display font-semibold text-text-dark-gray mb-1">Completely Free</h3>
                <p className="text-text-medium-gray">No subscription fees, no hidden costs. Built by students, for students.</p>
              </div>
            </div>
          </div>
          <div className="mt-8 text-center">
            <p className="text-text-medium-gray text-base">
              This project is <a href="https://github.com/BadgerClassTracker/badger-class-tracker" target="_blank" rel="noopener noreferrer" className="text-badger-red hover:underline font-semibold">open source</a>. Feel free to make a PR for additional feature suggestions!
            </p>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mb-20">
          <h2 className="text-3xl font-display font-bold text-text-dark-gray mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4 max-w-3xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How often does the system check for open seats?</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Our system polls the UW-Madison enrollment API every minute. When we detect a status change, we send email notifications immediately.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Is this service affiliated with UW-Madison?</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  No, Badger Class Tracker is an independent student project and is not officially affiliated with UW-Madison. We use publicly available enrollment data from the university&apos;s enrollment API.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Will you automatically enroll me when a seat opens?</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  No, we only send notifications. You&apos;ll need to manually enroll yourself through the official UW-Madison enrollment system.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How do I stop receiving notifications?</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  You can delete any subscription from your subscriptions dashboard at any time. You can also use the unsubscribe link included in every email notification.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What data do you collect?</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  We only collect your email address (via Google OAuth) and your course subscription preferences. We don&apos;t sell or share your data with third parties. All data is stored securely on AWS.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Why do I need to sign in with Google?</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Google OAuth provides secure authentication and allows us to send email notifications to you. We don&apos;t have access to your Google password and only request your email address and basic profile information.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I track courses from multiple semesters?</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Yes! You can search for and subscribe to courses from any active term. Our system automatically handles multiple semesters and will notify you when seats open in any of your tracked sections.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What happens if I miss the notification?</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  We send notifications every time we detect a seat opening, so you&apos;ll get multiple chances if seats continue to open up. Your subscription stays active until you manually delete it, so you won&apos;t miss future openings.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center bg-gradient-to-r from-badger-red to-dark-red rounded-xl p-12 text-white">
          <h2 className="text-3xl font-display font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg mb-8 opacity-90">
            Join hundreds of UW-Madison students who never miss a class opening.
          </p>
          <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
            <Button asChild size="lg" className="bg-white text-badger-red hover:bg-gray-100 text-lg font-display font-semibold">
              <Link href="/search">
                Start Tracking Classes
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg font-display font-semibold border-white text-white hover:bg-white/10">
              <Link href="/">
                Back to Home
              </Link>
            </Button>
          </div>
        </section>
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
