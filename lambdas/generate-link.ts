import * as AWS from 'aws-sdk';

const axios = require('axios').default;

const currentUser = 'John';

function quote_plus_function(s: string) {
    return encodeURIComponent(s);
}

/**
 * A Lambda that uses sts.AssumeRole to generate an AWS console link for temporary login
 *
 * Based roughly on:
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_enable-console-custom-url.html#STSConsoleLink_programPython
 */
export const handler = async (event: any) => {

    const ssm = new AWS.SSM();

    // Step 1: Authenticate user in your own identity system.
    // @TODO

    // Step 2: Using the access keys for an IAM user in your AWS account,
    // call "AssumeRole" to get temporary access keys for the federated user
    // Note: Calls to AWS STS AssumeRole must be signed using the access key ID
    // and secret access key of an IAM user or using existing temporary credentials.
    // The credentials can be in EC2 instance metadata, in environment variables,
    // or in a configuration file, and will be discovered automatically by the SDK
    const iamUserAccessKey = await ssm.getParameter({
        Name: process.env.SSM_ACCESS_KEY_ID as string,
    }).promise();
    const iamUserSecretAccessKey = await ssm.getParameter({
        Name: process.env.SSM_SECRET_ACCESS_KEY_ID as string,
    }).promise();
    const sts = new AWS.STS({
        credentials: new AWS.Credentials(iamUserAccessKey.Parameter?.Value!,
            iamUserSecretAccessKey.Parameter?.Value!)
    });
    // The "AssumeRole" call below needs to be created using long-lived IAM credentials, not a Role!
    // Otherwise the /federation call below fails
    const token = await sts.assumeRole({
        DurationSeconds: 3600,
        RoleArn: process.env.ASSUMED_ROLE_ARN as string,
        RoleSessionName: currentUser
    }).promise();

    if (!token.Credentials) {
        throw new Error(`Can not assume role ${process.env.ASSUMED_ROLE_ARN}`);
    }

    // Step 3: Format resulting temporary credentials into JSON
    const url_credentials: {
        [key: string]: string
    } = {};
    url_credentials['sessionId'] = token.Credentials.AccessKeyId;
    url_credentials['sessionKey'] = token.Credentials.SecretAccessKey;
    url_credentials['sessionToken'] = token.Credentials.SessionToken;
    const json_string_with_temp_credentials = JSON.stringify(url_credentials);

    // Step 4. Make request to AWS federation endpoint to get sign-in token. Construct the parameter string with
    // the sign-in action request, a 12-hour session duration, and the JSON document with temporary credentials
    // as parameters.
    let request_parameters = "?Action=getSigninToken"
    request_parameters += "&SessionDuration=43200"

    request_parameters += "&Session=" + quote_plus_function(json_string_with_temp_credentials)
    const request_url = "https://signin.aws.amazon.com/federation" + request_parameters;
    const response = await axios.get(request_url);

    if (response.status !== 200) {
        console.error(response.statusText);
        throw new Error(`Can not get federation token`);
    }

    const signinToken = response.data.SigninToken;

    // Step 5: Create URL where users can use the sign-in token to sign in to
    // the console. This URL must be used within 15 minutes after the
    // sign-in token was issued.
    request_parameters = "?Action=login"
    request_parameters += "&Issuer=Example.org"
    request_parameters += "&Destination=" + quote_plus_function("https://console.aws.amazon.com/")
    request_parameters += "&SigninToken=" + signinToken
    return `https://signin.aws.amazon.com/federation${request_parameters}`;
}
