import api from "./api";
import {map} from 'lodash';
import {mapIndividual} from "../models/individualModel";

const notSupportedMessage = "Method not supported.";

class IndividualService {

    constructor() {
    }

    getSubjectsInLocation(addressLevel, subjectTypeName) {
       return api.getSubjects(addressLevel.uuid, subjectTypeName)
           .then(subjects => map(subjects, subject => mapIndividual(subject)));
    }

    getSubjectByUUID(uuid) {
        return api.getSubjectByUUID(uuid);
    }

    findAllSubjectsWithMobileNumberForType(mobileNumber, subjectTypeUUID) {
        throw Error(notSupportedMessage);
    }

}

export const individualService = new IndividualService();
