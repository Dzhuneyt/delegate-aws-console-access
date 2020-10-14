import {ConsoleSigninGenerator} from './ConsoleSigninGenerator';


/**
 * A Lambda that uses sts.AssumeRole to generate an AWS console link for temporary login
 *
 * Based roughly on:
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_enable-console-custom-url.html#STSConsoleLink_programPython
 */
export const handler = async (event: any) => {
    const roleToAssumeARN = process.env.ASSUMED_ROLE_ARN as string;

    const AWS_ACCESS_KEY_ID = process.env.IAM_USER_AWS_ACCESS_KEY_ID as string;
    const AWS_SECRET_ACCESS_KEY = process.env.IAM_USER_AWS_SECRET_ACCESS_KEY as string;

    // Step 1: Authenticate user in your own identity system.
    // @TODO
    const currentUser = 'john@example.com';

    const link = await new ConsoleSigninGenerator(
        {
            AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY,
            role: {
                arn: roleToAssumeARN,
                assumeDurationSeconds: 900
            },
            userAlias: currentUser
        }
    ).getConsoleSigninLink();

    return {
        link,
    }
}
