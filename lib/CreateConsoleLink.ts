import * as iam from '@aws-cdk/aws-iam';
import {AccountRootPrincipal, PolicyStatement, Role, User} from '@aws-cdk/aws-iam';
import {NodejsFunction} from '@aws-cdk/aws-lambda-nodejs';
import * as cdk from '@aws-cdk/core';
import {CfnOutput} from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as path from 'path';

export class CreateConsoleLink extends cdk.Stack {
    functionToGenerateTemporaryLink: NodejsFunction;

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const role = this.createRole();

        // Federation endpoints requires STS temporary generated credentials that were created
        // by long-term credentials and not by an IAM role (Lambda assumes a role by default)
        // For this reason, we create a "hidden" user and use his credentials for the sts.AssumeRole
        // operation
        const user = new User(this, 'console-links-creator');

        // Allow the user to assume the role
        role.grant(user, "iam:AssumeRole");
        role.grant(user, "sts:AssumeRole");

        // Create IAM credentials for this user
        const accessKey = new iam.CfnAccessKey(this, 'secret-key', {
            userName: user.userName,
            serial: 1, // increment this to force regeneration
        });

        // Create the Lambda that will use the IAM user's credentials to generate a console signin link
        this.functionToGenerateTemporaryLink = new NodejsFunction(this, 'lambda', {
            entry: path.resolve(__dirname, '../lambdas/generate-link.ts'),
        });

        // The Lambda will generate a temporary link that will allow the visitor to
        // assume the role, provided here
        this.functionToGenerateTemporaryLink.addEnvironment('ASSUMED_ROLE_ARN', role.roleArn);

        // The AWS Federation service requires that temporary links are
        // created by an IAM user and NOT an IAM Role. For this reason,
        // we provide real IAM user credentials to the Lambda to use,
        // instead of its own Lambda executioner role
        this.functionToGenerateTemporaryLink.addEnvironment('IAM_USER_AWS_ACCESS_KEY_ID', accessKey.ref);
        this.functionToGenerateTemporaryLink.addEnvironment('IAM_USER_AWS_SECRET_ACCESS_KEY', accessKey.attrSecretAccessKey);

        this.outputs();
    }

    /**
     * Create a Role that will be assumed by the user who visits the Single Sign-On link
     * and give it the relevant permissions
     */
    private createRole() {
        const roleAssumedByUser = new Role(this, 'access-to-console', {
            assumedBy: new AccountRootPrincipal(),
            description: "IAM role that will be assumed by users who automatically login, by visiting the generated link"
        });
        roleAssumedByUser.addToPolicy(new PolicyStatement({
            resources: ["*"],
            actions: ["ec2:*"]
        }));
        return roleAssumedByUser;
    }

    private outputs() {
        new CfnOutput(this, 'lambda-temp-link-generator', {
            value: this.functionToGenerateTemporaryLink.functionArn,
        });
    }
}
