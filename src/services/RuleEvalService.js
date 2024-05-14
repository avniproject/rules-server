import * as rulesConfig from 'rules-config';
import lodash, {forEach, get, isEmpty, isNil, reject, sortBy} from 'lodash';
import moment from 'moment';
import {common, motherCalculations, RuleRegistry} from "avni-health-modules";
import evalRule from "./evalRule";
import ruleService from "./RuleService";
import {individualService} from "./IndividualService";
import {FormElementStatus} from "openchs-models";

const removeStrictFromRuleCode = (rule) => isNil(rule) ? "" : rule.replace(/"use strict";|'use strict';/ig, '');

function isEmptyValues(value) {
    return value === undefined || value === null || (typeof value === 'object' && Object.keys(value).length === 0 )|| (typeof value === 'string' && value.trim().length === 0);
}

export const trimDecisionsMap = (decisionsMap) => {
    const trimmedDecisions = {};
    forEach(decisionsMap, (decisions, decisionType) => {
        trimmedDecisions[decisionType] = reject(reject(decisions, isEmpty), (d) => isEmptyValues(d.value));
    });
    return trimmedDecisions;
};

const services = {
    individualService,
};

function getImports() {
    return {rulesConfig, common, lodash, moment, motherCalculations, log: console.log};
}

export const decisionRule = async (rule, entity) => {
    const defaultDecisions = {
        "enrolmentDecisions": [],
        "encounterDecisions": [],
        "registrationDecisions": []
    };
    const entityName = get(entity, "constructor.schema.name");
    const code = removeStrictFromRuleCode(rule.decisionCode);
    const rulesFromTheBundle = await getAllRuleItemsFor(rule.formUuid, "Decision", "Form");
    if (!_.isEmpty(_.trim(code))) {
        const ruleFunc = evalRule(code);
        const ruleDecisions = ruleFunc({
            params: {decisions: defaultDecisions, entity, common, motherCalculations, services},
            imports: getImports()
        });
        return trimDecisionsMap(ruleDecisions);
    } else if (!_.isEmpty(rulesFromTheBundle)) {
        const decisionsMap = rulesFromTheBundle.reduce((decisions, rule) => {
            return runRuleAndSaveFailure(rule, entityName, entity, decisions, new Date());
        }, defaultDecisions);
        return trimDecisionsMap(decisionsMap);
    }
    return defaultDecisions;
};

export const visitScheduleRule = async (rule, entity, scheduledVisits) => {
    const entityName = get(entity, "constructor.schema.name");
    const code = removeStrictFromRuleCode(rule.visitScheduleCode);
    const rulesFromTheBundle = await getAllRuleItemsFor(rule.formUuid, "VisitSchedule", "Form");

    if (!isEmpty(code)) {
        const ruleFunc = evalRule(code);
        return ruleFunc({
            params: {visitSchedule: scheduledVisits, entity, common, motherCalculations, services},
            imports: getImports()
        });
    } else if (!isEmpty(rulesFromTheBundle)) {
        const nextVisits = rulesFromTheBundle
            .reduce((schedule, rule) => {
                console.info(`RuleEvaluationService`, `Executing Rule: ${rule.name} Class: ${rule.fnName}`);
                return runRuleAndSaveFailure(rule, entityName, entity, schedule);
            }, scheduledVisits);
        console.debug("RuleEvaluationService - Next Visits", nextVisits);
        return nextVisits;
    }
    return scheduledVisits;
};

export const checkListRule = async (rule, entity, checklistDetails) => {
    const entityName = get(entity, "constructor.schema.name");
    const code = removeStrictFromRuleCode(rule.checklistCode);
    const rulesFromTheBundle = await getAllRuleItemsFor(rule.formUuid, "Checklists", "Form");

    if (!isEmpty(code)) {
        const ruleFunc = evalRule(code);
        return ruleFunc({
            params: {checklistDetails: checklistDetails, entity, common, motherCalculations, services},
            imports: getImports()
        });
    } else if (!isEmpty(rulesFromTheBundle)) {
        return rulesFromTheBundle
            .reduce((checklists, rule) => runRuleAndSaveFailure(rule, entityName, entity, checklistDetails), []);
    }
    return [];
};

export const programSummaryRule = async (rule, entity) => {
    const entityName = get(entity, "constructor.schema.name");
    const code = removeStrictFromRuleCode(rule.programSummaryCode);
    const rulesFromTheBundle = await getAllRuleItemsFor(rule.formUuid, "EnrolmentSummary", "Program");
    if (!isEmpty(code)) {
        const ruleFunc = evalRule(code);
        return ruleFunc({
            params: {summaries: [], programEnrolment: entity, services},
            imports: getImports()
        });
    } else if (!isEmpty(rulesFromTheBundle)) {
        return rulesFromTheBundle
            .reduce((summaries, rule) => runRuleAndSaveFailure(rule, entityName, entity, summaries, new Date()), []);
    }
    return [];
};

export const subjectSummaryRule = async (rule, entity) => {
    const code = removeStrictFromRuleCode(rule.subjectSummaryCode);
    if (!isEmpty(code)) {
        const ruleFunc = evalRule(code);
        return ruleFunc({
            params: {summaries: [], individual: entity, services},
            imports: getImports()
        });
    }
    return [];
};

export const isEligibleForEntityType = async (individual, entityType, bundleRuleParams) => {
    let eligible = true;
    const rulesFromTheBundle = await getAllRuleItemsFor(entityType.uuid, bundleRuleParams.ruleType, entityType);
    if (!_.isNil(entityType.entityEligibilityCheckRule) && !_.isEmpty(_.trim(entityType.entityEligibilityCheckRule))) {
        const code = removeStrictFromRuleCode(entityType.entityEligibilityCheckRule);
        const ruleFunc = eval(code);
        eligible = ruleFunc({
            params: {entity: individual, services},
            imports: getImports()
        });
    } else if (!_.isEmpty(rulesFromTheBundle)) {
        eligible = runRuleAndSaveFailure(_.last(rulesFromTheBundle), bundleRuleParams.entityName, {individual}, true);
    }
    return {
        "isEligible": eligible,
        "typeUUID": entityType.uuid,
    };
};

export const messagingRule = async (rule, entity) => {
    const code = removeStrictFromRuleCode(rule);
    const ruleFunc = eval(code);
    const response = ruleFunc({
        params: {entity},
        imports: getImports()
    });
    return response;
}

const getAllRuleItemsFor = async (entityUuid, type, entityType) => {
    const applicableRules = RuleRegistry.getRulesFor(entityUuid, type, entityType); //Core module rules
    const additionalRules = await ruleService.getApplicableRules(entityUuid, type, entityType);
    return sortBy(applicableRules.concat(additionalRules), r => r.executionOrder);
};

const runRuleAndSaveFailure = (rule, entityName, entity, ruleTypeValue, config, context) => {
    try {
        if (entityName === "WorkList") {
            ruleTypeValue = entity;
            return rule.fn.exec(entity, context);
        } else {
            return _.isNil(context)
                ? rule.fn.exec(entity, ruleTypeValue, config)
                : rule.fn.exec(entity, ruleTypeValue, context, config);
        }
    } catch (error) {
        console.error("Rule-Failure", `Rule failed: ${rule.name}, uuid: ${rule.uuid}`);
        return ruleTypeValue;
    }
};

const runFormElementGroupRule = (formElementGroup, entity) => {
    if (_.isNil(formElementGroup.rule) || _.isEmpty(_.trim(formElementGroup.rule))) {
        return formElementGroup
            .getFormElements()
            .map(formElement => new FormElementStatus(formElement.uuid, true, undefined));
    }
    try {
        const ruleFunc = eval(formElementGroup.rule);
        return ruleFunc({
            params: {formElementGroup, entity, services},
            imports: getImports()
        });
    } catch (e) {
        console.error(
            `Rule-Failure for formElement group name: ${formElementGroup.name} Error message : ${e}`
        );
    }
};

const getTheChildFormElementStatues = (childFormElement, entity) => {
    const parentFormElement = childFormElement.getParentFormElement();
    const questionGroupObservations = entity.findObservation(parentFormElement.concept.uuid);
    const questionGroupObs = questionGroupObservations && questionGroupObservations.getValueWrapper();
    const size = questionGroupObs ? questionGroupObs.size() : 1;
    return _.range(size)
        .map(questionGroupIndex => {
            const formElementStatus = runFormElementStatusRule(childFormElement, entity, questionGroupIndex);
            formElementStatus.addQuestionGroupInformation(questionGroupIndex, childFormElement.groupUuid);
            return formElementStatus;
        })
        .filter(fs => !_.isNil(fs))
        .reduce((all, curr) => all.concat(curr), [])
};

export const getFormElementsStatuses = (entity, formElementGroup) => {
    if ([entity, formElementGroup].some(_.isEmpty)) return [];
    const formElementsWithRules = formElementGroup
        .getFormElements()
        .filter(formElement => !_.isNil(formElement.rule) && !_.isEmpty(_.trim(formElement.rule)));
    const formElementStatusAfterGroupRule = runFormElementGroupRule(formElementGroup, entity);
    const visibleFormElementsUUIDs = _.filter(formElementStatusAfterGroupRule, ({visibility}) => visibility === true).map(({uuid}) => uuid);
    const applicableFormElements = formElementsWithRules
        .filter((fe) => _.includes(visibleFormElementsUUIDs, fe.uuid));
    if (!_.isEmpty(formElementsWithRules) && !_.isEmpty(visibleFormElementsUUIDs)) {
        let formElementStatuses = applicableFormElements
            .map(formElement => {
                if (formElement.groupUuid) {
                    return getTheChildFormElementStatues(formElement, entity);
                }
                return runFormElementStatusRule(formElement, entity);
            })
            .filter(fs => !_.isNil(fs))
            .reduce((all, curr) => all.concat(curr), formElementStatusAfterGroupRule)
            .reduce((acc, fs) => acc.set(`${fs.uuid}-${fs.questionGroupIndex || 0}`, fs), new Map())
            .values();
        return [...formElementStatuses];
    }
    return formElementStatusAfterGroupRule;
};

const runFormElementStatusRule = (formElement, entity, questionGroupIndex) => {
    try {
        const ruleFunc = eval(formElement.rule);
        return ruleFunc({
            params: {formElement, entity, questionGroupIndex, services},
            imports: getImports()
        });
    } catch (e) {
        console.error(
            `Rule-Failure for formElement name: ${formElement.name} Error message: ${
                e.message
            } stack: ${e.stack}`
        );
        return null;
    }
};
