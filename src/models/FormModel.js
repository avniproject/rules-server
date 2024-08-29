import {
    ModelGeneral as General,
    Form,
    FormElementGroup,
    FormElement,
    KeyValue,
    Format,
    ConceptAnswer, Concept
} from 'openchs-models';
import {map} from 'lodash';

export const mapForm = formJson => {
    const form = General.assignFields(formJson, new Form(),
        [
            "uuid",
            "name",
            "formType",
            "decisionRule",
            "visitScheduleRule",
            "validationRule",
            "checklistsRule",
        ]);
    form.formElementGroups = map(formJson.formElementGroups, feg => mapFormElementGroup(feg, form));
    return form;
};

const mapFormElementGroup = (formElementGroupJson, form) => {
    const formElementGroup = General.assignFields(formElementGroupJson, new FormElementGroup(),
        [
            "uuid",
            "name",
            "displayOrder",
            "voided",
            "rule",
        ]);
    formElementGroup.formElements = map(formElementGroupJson.formElements, fe => mapFormElement(fe, formElementGroup));
    formElementGroup.form = form;
    return formElementGroup;
};

const mapFormElement = (formElementJson, formElementGroup) => {
    const formElement = General.assignFields(
        formElementJson,
        new FormElement(),
        [
            "uuid",
            "name",
            "displayOrder",
            "mandatory",
            "type",
            "voided",
            "rule"
        ]
    );
    formElement.groupUuid = formElementJson.parentFormElementUuid;
    formElement.keyValues = map(formElementJson.keyValues, KeyValue.fromResource);
    formElement.validFormat = Format.fromResource(formElementJson["validFormat"]);
    formElement.concept = mapConcept(formElementJson.concept);
    formElement.formElementGroup = formElementGroup;
    return formElement;
};

const mapConcept = (concept) => {
    const conceptModel = General.assignFields(concept, new Concept(), ["uuid", "name", "hiAbsolute", "lowAbsolute", "keyValues", "lowNormal", "highNormal", "unit"]);
    conceptModel.datatype = concept.dataType;
    if (concept["answers"]) {
        conceptModel.answers = mapConceptAnswer(concept["answers"]);
    }
    return conceptModel;
};

const mapConceptAnswer = (conceptAnswers) => {
    return conceptAnswers.map((ca) => {
        const conceptAnswerModel = new ConceptAnswer();
        conceptAnswerModel.uuid = ca.uuid;
        conceptAnswerModel.answerOrder = ca.order;
        conceptAnswerModel.abnormal = ca.abnormal;
        conceptAnswerModel.unique = ca.unique;
        conceptAnswerModel.concept = mapConcept(ca);
        return conceptAnswerModel;
    });
};

