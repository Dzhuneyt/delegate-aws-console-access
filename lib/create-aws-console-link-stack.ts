import {
    AnyPrincipal,
    IManagedPolicy,
    ManagedPolicy,
    PolicyStatement,
    Role,
    ServicePrincipal,
    User
} from '@aws-cdk/aws-iam';
import {Code, Runtime} from '@aws-cdk/aws-lambda';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';

export class CreateAwsConsoleLinkStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const someRole = new Role(this, 'access-console', {
            assumedBy: new AnyPrincipal(),
        });
        someRole.addToPolicy(new PolicyStatement({
            resources: ["*"],
            actions: ["ec2:*"]
        }));

        // Federation endpoints requires STS temporary generated credentials that were created
        // by long-term credentials and not by an IAM role (Lambda runs with roles by default)
        // For this reason, we create a "hidden" user and use his credentials for the sts.AssumeRole
        // operation
        const user = new User(this, 'console-links-creator');

        // Allow the user to assume the role
        user.addToPolicy(new PolicyStatement({
            actions: ["iam:AssumeRole"],
            resources: [
                someRole.roleArn
            ],
        }))

        // Create IAM credentials for this user
        const accessKey = new iam.CfnAccessKey(this, 'secret-key', {
            userName: user.userName,
            serial: 1, // increment this to force regeneration
        });

        // Create the Lambda that will use the IAM user's credentials to generate a console signin link
        const fnGenerateLink = new lambda.Function(this, 'generate-console-link', {
            runtime: Runtime.NODEJS_12_X,
            code: Code.fromAsset(path.resolve(__dirname, '../lambdas/dist')),
            handler: 'generate-link.handler',
        });

        // The role which users of the console signin link will automatically assume
        // Note that this role itself need to be assumable by the IAM user who generated
        // the console signin link
        fnGenerateLink.addEnvironment('ASSUMED_ROLE_ARN', someRole.roleArn);

        // Allow the Lambda to use the IAM credentials of the "service user"
        // for the purposes of calling sts.AssumeRole with them, because the
        // federation service of AWS requires that the console signin link is generated
        // using long-lived access credentials and not through an assumed role
        fnGenerateLink.addEnvironment('IAM_USER_AWS_ACCESS_KEY_ID', accessKey.ref);
        fnGenerateLink.addEnvironment('IAM_USER_AWS_SECRET_ACCESS_KEY', accessKey.attrSecretAccessKey);
    }
}
