import {encounterEligibility} from "../../src/controllers/rulesController";
import {getMockReq, getMockRes} from "@jest-mock/express";

jest.mock("../../src/services/RuleService", () => ({
    __esModule: true,
    default: {getApplicableRules: jest.fn().mockResolvedValue([])}
}));

const individual = {
        "uuid": "fdbbf07d-31f3-4752-a58e-cd0ef3c74e79",
        "firstName": "maha",
        "middleName": null,
        "lastName": "asam",
        "profilePicture": null,
        "dateOfBirth": [
            2022,
            10,
            1
        ],
        "gender": {
            "uuid": "ad7d1d14-54fd-45a2-86b7-ea329b744484",
            "name": "Female"
        },
        "registrationDate": [
            2022,
            10,
            19
        ],
        "lowestAddressLevel": {
            "uuid": "9b4e6e5b-8335-4913-b398-097bd496a1ad",
            "name": "Aldandi Village",
            "version": 1,
            "organisationId": 2,
            "title": "Aldandi Village",
            "level": 1
        },
        "observations": [],
        "voided": false,
        "registrationLocation": null,
        "subjectType": {
            "name": "student",
            "uuid": "bd0cb293-39aa-4c5f-861f-3127e938ec8c",
            "type": "Person",
            "allowEmptyLocation": false,
            "allowMiddleName": false,
            "allowProfilePicture": false,
            "uniqueName": false,
            "shouldSyncByLocation": false,
            "directlyAssignable": false,
            "household": false,
            "group": false,
            "voided": false
        },
        "rule": null,
        "enrolments": [],
        "encounters": [],
        "visitSchedules": null,
        "groups": []
    };

const program = (uuid, entityEligibilityCheckRule) => ({uuid, name: uuid, voided: false, active: true, entityEligibilityCheckRule});

const checkEligibility = async (entityTypes, ruleEntityType = "Program") => {
    const {res, next} = getMockRes({});
    const req = getMockReq({body: {individual, entityTypes, ruleEntityType}});
    await encounterEligibility(req, res, next);
    return res;
};

beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));
afterEach(() => console.log.mockRestore());

test("one program's throwing eligibility rule does not fail the check for the other programs", async () => {
    const res = await checkEligibility([
        program("fine", "'use strict'; ({params, imports}) => true;"),
        program("throwing", "'use strict'; ({params, imports}) => { throw new Error('QA1079 eligibility rule throws'); };"),
        program("ineligible", "'use strict'; ({params, imports}) => false;"),
        program("no-rule", null),
    ]);

    expect(res.status).toHaveBeenCalledWith(200);
    const {status, eligibilityRuleEntities} = res.json.mock.calls[0][0];
    expect(status).toBe("success");
    expect(eligibilityRuleEntities).toEqual([
        {isEligible: true, typeUUID: "fine"},
        {isEligible: true, typeUUID: "throwing", error: {message: "QA1079 eligibility rule throws", stack: expect.stringContaining("QA1079 eligibility rule throws")}},
        {isEligible: false, typeUUID: "ineligible"},
        {isEligible: true, typeUUID: "no-rule"},
    ]);
});

test("a throwing encounter eligibility rule is reported for that encounter type only", async () => {
    const res = await checkEligibility([
        {uuid: "throwing-visit", name: "Visit", voided: false, entityEligibilityCheckRule: "'use strict'; ({params, imports}) => params.entity.missing.field;"},
        {uuid: "ineligible-visit", name: "Other visit", voided: false, entityEligibilityCheckRule: "'use strict'; ({params, imports}) => false;"},
    ], "EncounterType");

    const {eligibilityRuleEntities} = res.json.mock.calls[0][0];
    expect(eligibilityRuleEntities[0]).toMatchObject({isEligible: true, typeUUID: "throwing-visit", error: {message: expect.any(String)}});
    expect(eligibilityRuleEntities[1]).toEqual({isEligible: false, typeUUID: "ineligible-visit"});
});
