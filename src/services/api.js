import axios from "axios";
import {get} from "lodash";

const BASE_URL = "http://localhost:8021";

export default {
    getLegacyRulesBundle: () =>
        axios
            .get(
                BASE_URL + "/ruleDependency/search/lastModified?lastModifiedDateTime=1900-01-01T00:00:00.000Z&size=1000"
            )
            .then(response => get(response, "data._embedded.ruleDependency[0].code")),
    getLegacyRules: () =>
        axios
            .get(BASE_URL + "/rule/search/lastModified?lastModifiedDateTime=1900-01-01T00:00:00.000Z&size=1000")
            .then(response => get(response, "data._embedded.rule")),
    getSubjects: (addressLevelUUID, subjectTypeName) =>
        axios
            .get(BASE_URL + `/subject/search?addressLevelUUID=${addressLevelUUID}&subjectTypeName=${subjectTypeName}`)
            .then(response => get(response, 'data')),
    getCognitoDetails: () => axios.get(`${BASE_URL}/cognito-details`).then(res => res.data),
    uploadToS3: (url, oldValue) => axios.get(`${BASE_URL}/upload/media?url=${Buffer.from(url).toString('base64')}&oldValue=${oldValue}`)
        .then(res => res.data),
    getSubjectOrLocationObsValue: (entityType, ids, formElementUuid) => axios.get(`${BASE_URL}/upload?type=${entityType}&ids=${ids}&formElementUuid=${formElementUuid}`)
        .then(res => res.data)
};
