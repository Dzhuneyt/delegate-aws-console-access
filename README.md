# Generate temporary AWS Console signin link (TypeScript)

Use TypeScript code to generate a temporary signin link that allows any user you send it to (even ones outside of your organization) - to assume an IAM role and manage AWS resources for temporary (predefined) duration.

The way this works is: it uses the long-term IAM credentials of an existing IAM user within your AWS account (you could also create a dedicated IAM user for this), to 
