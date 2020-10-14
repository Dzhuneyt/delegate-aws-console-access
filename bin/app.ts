#!/usr/bin/env node
import 'source-map-support/register';
import {Tags} from '@aws-cdk/core';
import * as cdk from '@aws-cdk/core';
import {CreateConsoleLink} from '../lib/CreateConsoleLink';

const app = new cdk.App();
new CreateConsoleLink(app, 'CreateAwsConsoleLinkStack');

Tags.of(app).add('managed_by', 'aws-cdk');
