import {mapProgramEncounter} from './models/programEncounterModel';
import {createEncounterType, mapEncounter} from './models/encounterModel';
import {mapIndividual} from './models/individualModel';
import {mapProgramEnrolment} from './models/programEnrolmentModel';
import {createProgram} from "./models/programModel";
import {
    checkListRule,
    decisionRule,
    programSummaryRule,
    subjectSummaryRule,
    visitScheduleRule,
    messagingRule,
    isEligibleForEntityType
} from './services/RuleEvalService';
import {map} from 'lodash';
import {mapUser} from './models/userModel';

export const transformVisitScheduleDates = (visitSchedules) => {
    visitSchedules.forEach((visitSchedule, index, array) => {
        array[index].maxDate = visitSchedule.maxDate ? new Date(visitSchedule.maxDate).getTime() : null;
        array[index].earliestDate = visitSchedule.earliestDate ? new Date(visitSchedule.earliestDate).getTime() : null;
    });
    return visitSchedules;
}
const mappers = {
    "User": mapUser,
    "Individual": mapIndividual,
    "Subject": mapIndividual,
    "ProgramEnrolment": mapProgramEnrolment,
    "ProgramEncounter": mapProgramEncounter,
    "Encounter": mapEncounter,
    "ProgramSummary": mapProgramEnrolment,
    "SubjectSummary": mapIndividual,
}

const summaryRule = {
    "ProgramSummary": programSummaryRule,
    "SubjectSummary": subjectSummaryRule,
};

const createTypeMapper = {
    "EncounterType": createEncounterType,
    "Program": createProgram
}

const bundleEligibilityCheckRuleParamsMapper = {
    "EncounterType": {
        ruleType: "EncounterEligibilityCheck",
        entityName: "Encounter"
    },
    "Program": {
        ruleType: "EnrolmentEligibilityCheck",
        entityName: "Program"
    }
}

export const executeRule = async (requestBody) => {
    const mapEntity = mappers[requestBody.rule.workFlowType];
    if (!mapEntity)
        throw new Error("Value of workFlowType param is invalid");
    const entity = mapEntity(requestBody);
    return {
        "decisions": await decisionRule(requestBody.rule, entity),
        "visitSchedules": transformVisitScheduleDates(await visitScheduleRule(requestBody.rule, entity, requestBody.visitSchedules)),
        "checklists": await checkListRule(requestBody.rule, entity, requestBody.checklistDetails)
    }
}

export const executeSummaryRule = async (requestBody) => {
    const workflowType = requestBody.rule.workFlowType;
    const mapEntity = mappers[workflowType];
    if (!mapEntity)
        throw new Error("Value of workFlowType param is invalid");
    const entity = mapEntity(requestBody);
    return {
        "summaries": await summaryRule[workflowType](requestBody.rule, entity)
    }
};

export const executeEligibilityCheckRule = async (requestBody) => {
    const {individual, entityTypes, ruleEntityType} = requestBody;
    const individualModel = mapIndividual(individual);
    const eligibilityRuleEntities = await Promise.all(map(entityTypes, et => isEligibleForEntityType(individualModel, createTypeMapper[ruleEntityType](et), bundleEligibilityCheckRuleParamsMapper[ruleEntityType])));
    return {eligibilityRuleEntities};
};

export const executeMessagingRule = async (requestBody) => {
    const {entity, rule, entityType} = requestBody;
    const mapEntity = mappers[entityType];
    if (!mapEntity)
        throw new Error("Value of entityType param is invalid");
    const model = mapEntity(entity);

    return await messagingRule(rule, model);
}
