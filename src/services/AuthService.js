import cognitoDetails from "./CognitoDetails";
import api from "./api";
import {Auth} from 'aws-amplify';
import _ from 'lodash';

// During CSV upload token sent by the java server might expire so we use upload-user for
// communicating the java server
export const setUploadUser = async () => {
    console.debug("Cognito details ", cognitoDetails);
    if (cognitoDetails.isEmpty()) {
        const details = await api.getCognitoDetails();
        console.debug("Fetched details ", details);
        cognitoDetails.setDetails(details);
    }
    if (!cognitoDetails.isDummy()) {
        console.debug("Setting up upload user");
        await setupUploadUser();
    }
};

const setupUploadUser = async () => {
    Auth.configure({
        region: 'ap-south-1',
        userPoolId: cognitoDetails.poolId,
        userPoolWebClientId: cognitoDetails.clientId
    });
    const currentUser = await Auth.currentUserInfo();
    console.debug("Current user info ", currentUser);
    if (_.isEmpty(currentUser) || currentUser.username !== 'upload-user') {
        await signIn();
    }
};

const signIn = async function () {
    console.debug("Signing in for upload user: ", process.env.OPENCHS_UPLOAD_USER_USER_NAME);
    await Auth.signIn(process.env.OPENCHS_UPLOAD_USER_USER_NAME, process.env.OPENCHS_UPLOAD_USER_PASSWORD);
};

export const getUploadUserToken = async () => {
    if (cognitoDetails.isDummy()) return null;
    console.debug("Getting upload user token");
    const currentSession = await Auth.currentSession();
    const jwtToken = currentSession.idToken.jwtToken;
    console.debug("Upload user token ", jwtToken);
    return jwtToken;
};
