import * as AWS from 'aws-sdk';
import * as http from 'http';

export class ConsoleSigninGenerator {

    private readonly awsAccessKeyId: string;
    private readonly awsSecretAccessKey: string;
    private readonly roleARN: string;
    private userAlias: string;
    private roleAssumeDurationSeconds: number;

    constructor(
        config: {
            AWS_ACCESS_KEY_ID: string,
            AWS_SECRET_ACCESS_KEY: string,
            role: {
                arn: string,
                assumeDurationSeconds?: number,
            },
            userAlias?: string,
        }
    ) {
        this.awsAccessKeyId = config.AWS_ACCESS_KEY_ID;
        this.awsSecretAccessKey = config.AWS_SECRET_ACCESS_KEY;
        this.roleARN = config.role.arn;
        this.roleAssumeDurationSeconds = config.role.assumeDurationSeconds ? config.role.assumeDurationSeconds : 900;
        this.userAlias = config.userAlias ? config.userAlias : "UnknownUser";
    }

    private getSts() {
        return new AWS.STS({
            credentials: new AWS.Credentials(this.awsAccessKeyId, this.awsSecretAccessKey),
        });
    }

    // Using the access keys for an IAM user in your AWS account,
    // call "AssumeRole" to get temporary access keys for the federated user
    // Note: Calls to AWS STS AssumeRole must be signed using the access key ID
    // and secret access key of an IAM user and NOT an IAM role or temporary credentials
    // This is a requirement by the AWS Federation service
    private async getStsToken() {
        // Get temporary credentials from the long-lived credentials
        // Will be used to call AWS /federation endpoint
        // with "Action=getSigninToken" later
        return await this.getSts().assumeRole({
            DurationSeconds: this.roleAssumeDurationSeconds,
            RoleArn: this.roleARN,
            RoleSessionName: this.userAlias,
        }).promise();
    }

    /**
     * Retrieve a console signin link that includes a "SigninToken" query parameter
     * allowing to autologin when visited, without any credentials required
     * The link must be used within 15 minutes of issuing
     */
    public async getConsoleSigninLink(): Promise<string> {
        const tempCredsFromSTS = await this.getStsToken();

        if (!tempCredsFromSTS.Credentials) {
            const identity = await this.getSts().getCallerIdentity().promise();
            throw new Error(`IAM credentials of ${identity.Arn} can not assume role ${this.roleARN}`);
        }

        // Format resulting temporary credentials from STS into JSON
        const sessionCredentialsForFederationApiCall = {
            sessionId: tempCredsFromSTS.Credentials.AccessKeyId,
            sessionKey: tempCredsFromSTS.Credentials.SecretAccessKey,
            sessionToken: tempCredsFromSTS.Credentials.SessionToken
        };

        // Step 4. Make request to AWS federation endpoint to get sign-in token. Construct the parameter string with
        // the sign-in action request, a X-hour session duration, and the JSON document with temporary credentials
        // as parameters.
        const request_url = `https://signin.aws.amazon.com/federation?` +
            `Action=getSigninToken&` +
            `SessionDuration=43200&` +
            `Session=${encodeURIComponent(JSON.stringify(sessionCredentialsForFederationApiCall))}`
        const rawFederationResponse = await this.fetch(request_url);

        if (!rawFederationResponse) {
            console.error(rawFederationResponse);
            throw new Error(`Can not get AWS federation SigninToken with credentials from STS`);
        }

        const federationResponse = JSON.parse(rawFederationResponse);

        if (!federationResponse.SigninToken) {
            throw new Error(`"SigninToken" not found in AWS federation response`);
        }

        // Federation response, on success, includes just a "SigninToken"
        const signinToken = federationResponse.SigninToken;

        // Create URL where users can use the sign-in token to sign in to
        // the console. This URL must be used within 15 minutes after the
        // sign-in token was issued.
        let federationRequestParameters = "?Action=login"
        federationRequestParameters += "&Issuer=Example.org"
        federationRequestParameters += "&Destination=" + encodeURIComponent("https://console.aws.amazon.com/")
        federationRequestParameters += "&SigninToken=" + signinToken
        return `https://signin.aws.amazon.com/federation${federationRequestParameters}`;
    }

    private fetch(url: string): Promise<string> {
        // return new pending promise
        return new Promise((resolve, reject) => {
            // select http or https module, depending on reqested url
            const lib = url.startsWith('https') ? require('https') : require('http');
            const request = lib.get(url, (response: http.IncomingMessage) => {
                if (!response) {
                    reject(new Error('No response from API call'));
                    return;
                }
                // handle http errors
                const statusCode = response.statusCode;
                if (!statusCode || statusCode < 200 || statusCode > 299) {
                    reject(new Error('Failed to load page, status code: ' + response.statusCode));
                }
                // temporary data holder
                const body: any[] = [];
                // on every content chunk, push it to the data array
                response.on('data', (chunk: any) => body.push(chunk));
                // we are done, resolve promise with those joined chunks
                response.on('end', () => resolve(body.join('')));
            });
            // handle connection errors of the request
            request.on('error', (err: Error) => reject(err))
        })
    }
}
