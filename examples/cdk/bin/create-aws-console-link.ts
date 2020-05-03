#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CreateAwsConsoleLinkStack } from '../lib/create-aws-console-link-stack';

const app = new cdk.App();
new CreateAwsConsoleLinkStack(app, 'CreateAwsConsoleLinkStack');
