import {
    executeEligibilityCheckRule,
    executeRule,
    executeSummaryRule,
    executeMessagingRule,
} from '../RuleExecutor';
import {ORGANISATION_UUID_HEADER, AUTH_TOKEN_HEADER, USER_NAME_HEADER} from "./UserHeaders";
import axios from "axios";
import cache from "../services/cache";
import {BuildObservations} from "../observationBuilder/BuildObservations";
import {setupCognitoDetails, setUploadUser} from "../services/AuthService";
import {get} from 'lodash';

const delegateTo = (fn) => async (req, res, next) => {
    try {
        setGlobalAxiosHeaders(req);
        await setupCognitoDetails();
        const ruleResponse = await fn(req.body);
        ruleResponse.status = "success";
        res.status(200).json(ruleResponse);
    } catch (err) {
        catchRuleError(err, res);
    }
}

function catchRuleError(err, res) {
    console.warn("rulesController", "catchRuleError", err);
    res.status(222)
        .json({
            status: 'failure',
            error: {
                message: err.message,
                stack: err.stack
            }
        })
}

export const cleanRulesCache = async (req, res, next) => {
    const orgUuid = axios.defaults.headers.common[ORGANISATION_UUID_HEADER];
    delete cache[orgUuid];
    res.status(200).send('Cleaned the rules bundle cache');
}

const setGlobalAxiosHeaders = (req) => {
    const userName = req.get(USER_NAME_HEADER);
    const authToken = req.get(AUTH_TOKEN_HEADER);
    const orgUuid = req.get(ORGANISATION_UUID_HEADER);
    console.debug(`Headers from req: ${userName} ${authToken} ${orgUuid}`);

    if(userName)
        axios.defaults.headers.common[USER_NAME_HEADER] = userName;
    if(authToken)
        axios.defaults.headers.common[AUTH_TOKEN_HEADER] = authToken;
    if(orgUuid)
        axios.defaults.headers.common[ORGANISATION_UUID_HEADER] = orgUuid;
}


export const buildObservationAndRunRules = async (req, res, next) => {
    try {
        setGlobalAxiosHeaders(req);
        await setUploadUser();
        const responseContract = await BuildObservations(req.body);
        res.status(200).json(responseContract);
    } catch (err) {
        console.error("rulesController", "buildObservationAndRunRules", err);
        res.status(222)
            .json({
                errors: [`Error in rule server. Message: "${get(err, 'message')}", Stack: "${get(err, 'stack')}"`]
            })
    }
};

export const getStatus = async function(req, res, next) {
    console.debug("Getting status");
    res.status(200).send('Rule server is up and running with upload user as: ' + process.env.OPENCHS_UPLOAD_USER_USER_NAME);
}

export const rulesController = delegateTo(executeRule);
export const summary = delegateTo(executeSummaryRule);
export const messagingResponse = delegateTo(executeMessagingRule);
export const encounterEligibility = delegateTo(executeEligibilityCheckRule);
