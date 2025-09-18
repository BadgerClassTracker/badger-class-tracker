import { Amplify } from 'aws-amplify';

// Get the current origin dynamically
const getRedirectUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin + '/';
  }
  // Fallback for SSR
  return process.env.NODE_ENV === 'production'
    ? 'https://main.d3pso0t0wx1syr.amplifyapp.com/'
    : 'http://localhost:3000/';
};

const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
      loginWith: {
        oauth: {
          domain: `bct-prod-898512.auth.${process.env.NEXT_PUBLIC_AWS_REGION}.amazoncognito.com`,
          scopes: ['openid', 'email', 'profile'] as const,
          redirectSignIn: [getRedirectUrl()],
          redirectSignOut: [getRedirectUrl()],
          responseType: 'code' as const
        }
      }
    }
  }
};

Amplify.configure(amplifyConfig as any);

export default amplifyConfig;