import * as cdk from 'aws-cdk-lib';
import { BadgerClassTrackerStack } from '../lib/badger-class-tracker-stack';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const app = new cdk.App();

new BadgerClassTrackerStack(app, 'BadgerClassTrackerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,  // resolved from your AWS_PROFILE
    region:  process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-2',
  },
});
