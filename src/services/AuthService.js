import cognitoDetails from "./CognitoDetails";
import api from "./api";
import {Auth} from 'aws-amplify';
import _ from 'lodash';

// During CSV upload token sent by the java server might expire so we use upload-user for
export const setupCognitoDetails = async () => {
    console.debug("Cognito details ", cognitoDetails);
    if (cognitoDetails.isEmpty()) {
        return api.getCognitoDetails().then(details => {
            console.debug("Fetched details ", details);
            cognitoDetails.setDetails(details);
        }, _.noop);
    }
}

// communicating the java server
export const setUploadUser = async () => {
    await setupCognitoDetails();
    if (!(cognitoDetails.isDummy() || cognitoDetails.isEmpty())) {
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

async function getCurrentSession() {
    return Auth.currentSession().catch(e => {
        console.error("No current user, redoing setup of upload user");
        return setUploadUser().then(() => Auth.currentSession());
    });
}

export const getUploadUserToken = async () => {
    if (cognitoDetails.isDummy() || cognitoDetails.isEmpty()) return null;
    console.debug("Getting upload user token");
    let currentSession = await getCurrentSession();
    const jwtToken = currentSession.idToken.jwtToken;
    console.debug("Upload user token ", jwtToken);
    return jwtToken;
};
