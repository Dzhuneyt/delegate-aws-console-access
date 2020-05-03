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
import * as ssm from '@aws-cdk/aws-ssm';

export class CreateAwsConsoleLinkStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Federation endpoints requires STS temporary generated credentials that were created
        // by long-term credentials and not by an IAM role (Lambda runs with roles by default)
        // For this reason, we create a "hidden" user and use his credentials for the sts.AssumeRole
        // operation
        const user = new User(this, 'console-links-creator');
        user.addToPolicy(new PolicyStatement({
            actions: ["iam:AssumeRole"],
            resources: ["*"],
        }))
        const accessKey = new iam.CfnAccessKey(this, 'secret-key', {
            userName: user.userName
        });
        const paramForAccessKey = new ssm.StringParameter(this, 'access-key-s', {
            stringValue: accessKey.ref,
        });
        const paramForSecretAccessKey = new ssm.StringParameter(this, 'access-key-ss', {
            stringValue: accessKey.attrSecretAccessKey,
        });

        const someRole = new Role(this, 'access-console', {
            assumedBy: new AnyPrincipal(),
        });

        // const fnGenerateLink = new lambda.Function(this, 'generate-console-link', {
        //     runtime: Runtime.PYTHON_3_8,
        //     code: Code.fromAsset(path.resolve(__dirname, '../lambdas/generate-aws-console-link')),
        //     handler: 'generate-link.my_handler',
        // });
        const fnGenerateLink = new lambda.Function(this, 'generate-console-link', {
            runtime: Runtime.NODEJS_12_X,
            code: Code.fromAsset(path.resolve(__dirname, '../lambdas/dist')),
            handler: 'generate-link.handler',
        });
        fnGenerateLink.addEnvironment('ASSUMED_ROLE_ARN', someRole.roleArn);

        // Point to the "Systems Manager" secret values where the Lambda can retrieve
        // the IAM credentials of the service user that will be used to assume role
        fnGenerateLink.addEnvironment('SSM_ACCESS_KEY_ID', paramForAccessKey.parameterName);
        paramForAccessKey.grantRead(fnGenerateLink);
        fnGenerateLink.addEnvironment('SSM_SECRET_ACCESS_KEY_ID', paramForSecretAccessKey.parameterName);
        paramForSecretAccessKey.grantRead(fnGenerateLink);
    }
}
