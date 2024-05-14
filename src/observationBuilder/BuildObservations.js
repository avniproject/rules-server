import {mapForm} from "../models/FormModel";
import {
    chain,
    differenceWith,
    filter,
    flatMap,
    forEach,
    get,
    head,
    isEmpty,
    isNil,
    map,
    remove,
    replace,
    size,
    startCase,
    toNumber,
    trim
} from 'lodash';
import {Concept, FormElementGroup, ObservationsHolder, ValidationResult,} from "openchs-models";
import moment, {max} from "moment";
import {decisionRule, getFormElementsStatuses, visitScheduleRule} from "../services/RuleEvalService";
import {mapIndividual} from "../models/individualModel";
import {mapEncounter} from "../models/encounterModel";
import {mapProgramEncounter} from "../models/programEncounterModel";
import {mapProgramEnrolment} from "../models/programEnrolmentModel";
import {transformVisitScheduleDates} from "../RuleExecutor";
import api from "../services/api";
import {getUploadUserToken} from "../services/AuthService";

const DATE_FORMAT = `YYYY-MM-DD`;
const TIME_FORMAT = 'HH:mm';

const formTypeToEntityMapper = {
    IndividualProfile: mapIndividual,
    Encounter: mapEncounter,
    ProgramEncounter: mapProgramEncounter,
    ProgramEnrolment: mapProgramEnrolment,
};

export const BuildObservations = async ({row, form, entity}) => {
    const entityModel = formTypeToEntityMapper[form.formType](entity);
    const observationsHolder = new ObservationsHolder([]);
    const errors = [];
    const formModel = mapForm(form);
    const allValidationResults = [];
    const handleValidationResults = (validationResults) => {
        validationResults.forEach((validationResult) => handleValidationResult(validationResult));
    };
    const handleValidationResult = (validationResult) => {
        remove(allValidationResults, (existingValidationResult) => existingValidationResult.formIdentifier === validationResult.formIdentifier);
        if (!validationResult.success) {
            allValidationResults.push(validationResult);
        }
    };
    for (const feg of formModel.getFormElementGroups()) {
        let filteredFormElements = [];
        const allFormElements = feg.getFormElements();
        const allExceptChildFormElements = _.filter(allFormElements, fe => _.isNil(fe.groupUuid));
        for (const fe of allExceptChildFormElements) {
            const concept = fe.concept;
            await addObservationValue(observationsHolder, concept, fe, row, errors, allFormElements);
            entityModel.observations = observationsHolder.observations;
            const formElementStatuses = getFormElementStatuses(entityModel, feg, observationsHolder);
            filteredFormElements = FormElementGroup._sortedFormElements(feg.filterElements(formElementStatuses));
            observationsHolder.updatePrimitiveCodedObs(filteredFormElements, formElementStatuses);
            const obsValue = observationsHolder.getObservationReadableValue(concept);
            const validationResults = validate(
                fe,
                obsValue,
                observationsHolder.observations,
                allValidationResults,
                formElementStatuses
            );
            handleValidationResults(validationResults);
        }
        const validationResults = feg.validate(observationsHolder, filteredFormElements);
        handleValidationResults(validationResults);
    }
    pushErrorMessages(formModel, allValidationResults, errors);
    const observations = map(entityModel.observations, (obs) => obs.toResource);
    const responseObject = {observations, errors};

    if (size(errors) > 0) {
        //return fast and don't run rules
        return responseObject
    }
    if (!isEmpty(formModel.decisionRule)) {
        const payload = {decisionCode: formModel.decisionRule, formUuid: formModel.uuid};
        responseObject.decisions = await decisionRule(payload, entityModel);
    }
    if (!isEmpty(formModel.visitScheduleRule)) {
        const payload = {visitScheduleCode: formModel.visitScheduleRule, formUuid: formModel.uuid};
        responseObject.visitSchedules = transformVisitScheduleDates(await visitScheduleRule(payload, entityModel, []));
    }
    return responseObject;
};

const pushErrorMessages = (form, allValidationResults, errors) => {
    const validationErrors = filter(allValidationResults, ({success}) => !success);
    if (size(validationErrors) === 0) {
        return
    }
    forEach(validationErrors, ({formIdentifier, messageKey}) => {
        const formElement = getFormElementByUUID(form, formIdentifier);
        const readableMessage = messageKey === 'emptyValidationMessage' ? 'Empty value not allowed' : startCase(messageKey);
        errors.push(`Column: "${get(formElement, 'concept.name')}" Error message: "${readableMessage}."`)
    })
};

const updateGroupQuestionObservations = (formElement, allFormElements, row, observationsHolder, errors) => {
    const allChildren = _.filter(allFormElements, fe => fe.groupUuid === formElement.uuid);
    if (formElement.repeatable) {
        const repeatableQuestionGroupPattern = new RegExp(`${formElement.concept.name}\\|.*\\|\\d`);
        const repeatableQuestionGroupHeaders = _.keys(row).filter(header => header.match(repeatableQuestionGroupPattern));
        const maxIndex = _.max(repeatableQuestionGroupHeaders.map(h => h.split("|")[2]));
        _.range(maxIndex).forEach(index => {
            observationsHolder.updateRepeatableGroupQuestion(index, formElement, null, null, 'add');
            allChildren.forEach(childFormElement => updateRepeatableGroupQuestionValue(formElement, childFormElement, row, errors, observationsHolder, index))
        })
    } else {
        _.forEach(allChildren, childFormElement => updateGroupQuestionValue(formElement, childFormElement, row, errors, observationsHolder))
    }
};

const updateCodedObs = (childFormElement, answerValue, errors, updateObs) => {
    const concept = childFormElement.concept;
    if (childFormElement.isMultiSelect()) {
        const providedAnswers = splitMultiSelectAnswer(answerValue);
        const answerUUIDs = [];
        forEach(providedAnswers, answerName => {
            const conceptAnswer = concept.getAnswerWithConceptName(answerName);
            if (!isNil(conceptAnswer)) {
                answerUUIDs.push(conceptAnswer.concept.uuid)
            } else {
                errors.push(`Column: "${concept.name}" Error message: "Answer concept ${answerName} not found."`)
            }
        });
        _.forEach(answerUUIDs, uuid => updateObs(uuid));

    } else {
        const conceptAnswer = concept.getAnswerWithConceptName(answerValue);
        if (!isNil(conceptAnswer)) {
            updateObs(conceptAnswer.concept.uuid);
        } else {
            errors.push(`Column: "${concept.name}" Error message: "Answer concept ${answerValue} not found."`);
        }
    }
};

const updateRepeatableGroupQuestionValue = (parentFormElement, childFormElement, row, errors, observationsHolder, questionGroupIndex) => {
    const answerValue = getAnswerValue(childFormElement, row, parentFormElement, questionGroupIndex + 1);
    const concept = childFormElement.concept;
    if (concept.datatype === Concept.dataType.Coded) {
        updateCodedObs(childFormElement, answerValue, errors, (value) => observationsHolder.updateRepeatableGroupQuestion(questionGroupIndex, parentFormElement, childFormElement, value));
    } else {
        observationsHolder.updateRepeatableGroupQuestion(questionGroupIndex, parentFormElement, childFormElement, answerValue)
    }
};


const updateGroupQuestionValue = (parentFormElement, childFormElement, row, errors, observationsHolder, questionGroupIndex) => {
    const answerValue = getAnswerValue(childFormElement, row, parentFormElement, questionGroupIndex);
    const concept = childFormElement.concept;
    if (concept.datatype === Concept.dataType.Coded) {
        updateCodedObs(childFormElement, answerValue, errors, (value) => observationsHolder.updateGroupQuestion(parentFormElement, childFormElement, value));
    } else {
        observationsHolder.updateGroupQuestion(parentFormElement, childFormElement, answerValue)
    }
};

const getAnswerValue = (formElement, row, parentFormElement, questionGroupIndex) => {
    if (formElement.groupUuid) {
        const parentChildName = `${parentFormElement.concept.name}|${formElement.concept.name}`;
        const headerName = parentFormElement.repeatable ? `${parentChildName}|${questionGroupIndex}` : parentChildName;
        return row[headerName];
    }
    return row[formElement.concept.name];
};

const addOrUpdateObs = (fe, value, observationsHolder) => {
    observationsHolder.addOrUpdateObservation(fe.concept, value);
};

const isNonEmptyQuestionGroup = (formElement, allFormElements, row) => {
    if (formElement.concept.datatype === Concept.dataType.QuestionGroup) {
        const allChildren = _.filter(allFormElements, fe => fe.groupUuid === formElement.uuid);
        return _.some(allChildren, fe => {
            const parentChildName = `${formElement.concept.name}|${fe.concept.name}`;
            const headerName = formElement.repeatable ? `${parentChildName}|1` : parentChildName;
            const rowValue = row[headerName];
            return !_.isEmpty(rowValue);
        })
    }
    return false;
};

async function addObservationValue(observationsHolder, concept, fe, row, errors, allFormElements) {
    const answerValue = getAnswerValue(fe, row);
    if (!isNonEmptyQuestionGroup(fe, allFormElements, row) && (_.isEmpty(answerValue) || _.isNil(answerValue))) return;
    switch (concept.datatype) {
        case Concept.dataType.Coded:
            if (fe.isMultiSelect()) {
                const providedAnswers = splitMultiSelectAnswer(answerValue);
                const answerUUIDs = [];
                forEach(providedAnswers, answerName => {
                    const conceptAnswer = concept.getAnswerWithConceptName(answerName);
                    if (!isNil(conceptAnswer)) {
                        answerUUIDs.push(conceptAnswer.concept.uuid)
                    } else {
                        errors.push(`Column: "${concept.name}" Error message: "Answer concept ${answerName} not found."`)
                    }
                });
                observationsHolder.addOrUpdateObservation(fe.concept, answerUUIDs);
            } else {
                const conceptAnswer = concept.getAnswerWithConceptName(answerValue);
                if (!isNil(conceptAnswer)) {
                    addOrUpdateObs(fe, conceptAnswer.concept.uuid, observationsHolder);
                } else {
                    errors.push(`Column: "${concept.name}" Error message: "Answer concept ${answerValue} not found."`);
                }
            }
            break;
        case Concept.dataType.Numeric: {
            const value = _.isEmpty(answerValue) ? null : toNumber(answerValue);
            addOrUpdateObs(fe, value, observationsHolder);
            break;
        }
        case Concept.dataType.Date: {
            const value = moment(answerValue).format(DATE_FORMAT);
            addOrUpdateObs(fe, value, observationsHolder);
            break;
        }
        case Concept.dataType.DateTime: {
            const value = moment(answerValue).toISOString();
            addOrUpdateObs(fe, value, observationsHolder);
            break;
        }
        case Concept.dataType.Time: {
            const value = moment(answerValue, TIME_FORMAT).format(TIME_FORMAT);
            addOrUpdateObs(fe, value, observationsHolder);
            break;
        }
        case Concept.dataType.PhoneNumber:
            observationsHolder.updatePhoneNumberValue(concept, answerValue, false);
            break;
        case Concept.dataType.Image:
        case Concept.dataType.Video: {
            const token = await getUploadUserToken();
            if (fe.isMultiSelect()) {
                const providedAnswers = splitMultiSelectAnswer(answerValue);
                const s3Urls = [];
                await Promise.all(_.map(providedAnswers, (answer) => {
                    return api.uploadToS3(answer, null, token)
                        .then(({value, error}) => {
                            if (error) {
                                errors.push(`Column: "${concept.name}" Error message: "${error}"`)
                            } else {
                                s3Urls.push(value)
                            }
                            return s3Urls;
                        })
                })).catch(error => errors.push(`Column: "${concept.name}" Error message: "${error}"`));
                console.debug("s3Urls =>>", s3Urls);
                addOrUpdateObs(fe, s3Urls, observationsHolder);
            } else {
                const oldValue = observationsHolder.getObservationReadableValue(concept);
                const {value, error} = await api.uploadToS3(answerValue, oldValue, token);
                if (error) {
                    errors.push(`Column: "${concept.name}" Error message: "${error}"`)
                }
                addOrUpdateObs(fe, value, observationsHolder);
            }
            break;
        }
        case Concept.dataType.Subject: {
            const token = await getUploadUserToken();
            const {value} = await api.getSubjectOrLocationObsValue(Concept.dataType.Subject, answerValue, fe.uuid, token);
            addOrUpdateObs(fe, value, observationsHolder);
            break;
        }
        case Concept.dataType.Location: {
            const token = await getUploadUserToken();
            const {value} = await api.getSubjectOrLocationObsValue(Concept.dataType.Location, answerValue, fe.uuid, token);
            addOrUpdateObs(fe, value, observationsHolder);
            break;
        }
        case Concept.dataType.QuestionGroup:
            updateGroupQuestionObservations(fe, allFormElements, row, observationsHolder, errors);
            break;
        default:
            addOrUpdateObs(fe, answerValue, observationsHolder);
            break;
    }
}

const getFormElementByUUID = (form, formElementUUID) => {
    let formElement;
    _.forEach(form.nonVoidedFormElementGroups(), (formElementGroup) => {
        const foundFormElement = _.find(
            formElementGroup.getFormElements(),
            (formElement) => formElement.uuid === formElementUUID
        );
        if (!_.isNil(foundFormElement)) formElement = foundFormElement;
    });
    return formElement;
};

const getFormElementStatuses = (entity, formElementGroup, observationsHolder) => {
    const formElementStatuses = getFormElementsStatuses(entity, formElementGroup);
    const filteredFormElements = FormElementGroup._sortedFormElements(
        formElementGroup.filterElements(formElementStatuses)
    );
    const removedObs = observationsHolder.removeNonApplicableObs(
        formElementGroup.getFormElements(),
        filteredFormElements
    );
    if (isEmpty(removedObs)) {
        return formElementStatuses;
    }
    return getFormElementStatuses(entity, formElementGroup, observationsHolder);
};

const splitMultiSelectAnswer = str => {
    return chain(str)
        .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
        .map(value => replace(trim(value), /"/g, ""))
        .value();
};

const getRuleValidationErrors = formElementStatuses => {
    return flatMap(
        formElementStatuses,
        status =>
            new ValidationResult(
                isEmpty(status.validationErrors),
                status.uuid,
                head(status.validationErrors)
            )
    );
};

const checkValidationResult = (ruleValidationErrors, validationResult) => {
    return map(ruleValidationErrors, error =>
        error.formIdentifier === validationResult.formIdentifier && !validationResult.success
            ? validationResult
            : error
    );
};

const addPreviousValidationErrors = (ruleValidationErrors, validationResult, previousErrors) => {
    const otherFEFailedStatuses = previousErrors.filter(
        ({formIdentifier, success}) => validationResult.formIdentifier !== formIdentifier && !success
    );
    return [
        ...checkValidationResult(ruleValidationErrors, validationResult),
        ...otherFEFailedStatuses
    ];
};

const validate = (formElement, value, observations, validationResults, formElementStatuses) => {
    const validationResult = formElement.validate(value);
    remove(
        validationResults,
        existingValidationResult =>
            existingValidationResult.formIdentifier === validationResult.formIdentifier
    );
    const ruleValidationErrors = getRuleValidationErrors(formElementStatuses);
    const hiddenFormElementStatus = filter(
        formElementStatuses,
        status => status.visibility === false
    );
    const ruleErrorsAdded = addPreviousValidationErrors(
        ruleValidationErrors,
        validationResult,
        validationResults
    );
    remove(ruleErrorsAdded, result => result.success);
    return differenceWith(
        ruleErrorsAdded,
        hiddenFormElementStatus,
        (a, b) => a.formIdentifier === b.uuid
    );
};
