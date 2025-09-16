import { Amplify } from 'aws-amplify';

const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
      loginWith: {
        oauth: {
          domain: `bct-prod-898512.auth.${process.env.NEXT_PUBLIC_AWS_REGION}.amazoncognito.com`,
          scopes: ['openid', 'email', 'profile'] as const,
          redirectSignIn: ['http://localhost:3000/'],
          redirectSignOut: ['http://localhost:3000/'],
          responseType: 'code' as const
        }
      }
    }
  }
};

Amplify.configure(amplifyConfig as any);

export default amplifyConfig;