import {encounterEligibility} from "../../src/controllers/rulesController";
import {getMockReq, getMockRes} from "@jest-mock/express";
import ruleService from "../../src/services/RuleService";

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

test("failing to fetch the rules fails the whole check instead of making every program eligible", async () => {
    ruleService.getApplicableRules.mockRejectedValueOnce(new Error("Request failed with status code 401"));
    const res = await checkEligibility([
        program("ineligible", "'use strict'; ({params, imports}) => false;"),
        program("no-rule", null),
    ]);

    expect(res.status).toHaveBeenCalledWith(222);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe("failure");
    expect(body.eligibilityRuleEntities).toBeUndefined();
});

test("programs with their own rule are checked without fetching the rules, so a failed fetch only affects programs without one", async () => {
    ruleService.getApplicableRules.mockClear();
    ruleService.getApplicableRules.mockRejectedValue(new Error("Request failed with status code 401"));
    try {
        const res = await checkEligibility([
            program("fine", "'use strict'; ({params, imports}) => true;"),
            program("ineligible", "'use strict'; ({params, imports}) => false;"),
        ]);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].eligibilityRuleEntities).toEqual([
            {isEligible: true, typeUUID: "fine"},
            {isEligible: false, typeUUID: "ineligible"},
        ]);
        expect(ruleService.getApplicableRules).not.toHaveBeenCalled();
    } finally {
        ruleService.getApplicableRules.mockResolvedValue([]);
    }
});

test("a rule that throws something other than an Error still reports a message", async () => {
    const res = await checkEligibility([
        program("throws-string", "'use strict'; ({params, imports}) => { throw 'QA1079 not an Error'; };"),
    ]);

    expect(res.json.mock.calls[0][0].eligibilityRuleEntities).toEqual([
        {isEligible: true, typeUUID: "throws-string", error: {message: "QA1079 not an Error", stack: "QA1079 not an Error"}},
    ]);
});

test("a rule that throws a value that cannot be converted to text is still kept eligible on its own", async () => {
    const res = await checkEligibility([
        program("throws-bare-object", "'use strict'; ({params, imports}) => { const value = Object.create(null); value.self = value; throw value; };"),
        program("ineligible", "'use strict'; ({params, imports}) => false;"),
    ]);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].eligibilityRuleEntities).toEqual([
        {isEligible: true, typeUUID: "throws-bare-object", error: {message: "Rule threw a value that cannot be converted to text", stack: "Rule threw a value that cannot be converted to text"}},
        {isEligible: false, typeUUID: "ineligible"},
    ]);
});

test("a rule that throws a plain object reports the object, not [object Object]", async () => {
    const res = await checkEligibility([
        program("throws-object", "'use strict'; ({params, imports}) => { throw {code: 'QA1079', reason: 'bad data'}; };"),
    ]);

    expect(res.json.mock.calls[0][0].eligibilityRuleEntities).toEqual([
        {isEligible: true, typeUUID: "throws-object", error: {message: '{"code":"QA1079","reason":"bad data"}', stack: '{"code":"QA1079","reason":"bad data"}'}},
    ]);
});

test("an Error without a message is reported by its name, and a large thrown object is cut short", async () => {
    const res = await checkEligibility([
        program("throws-empty-error", "'use strict'; ({params, imports}) => { throw new TypeError(); };"),
        program("throws-large-object", "'use strict'; ({params, imports}) => { throw {data: 'x'.repeat(2000)}; };"),
    ]);

    const [emptyError, largeObject] = res.json.mock.calls[0][0].eligibilityRuleEntities;
    expect(emptyError).toMatchObject({isEligible: true, typeUUID: "throws-empty-error", error: {message: "TypeError"}});
    expect(largeObject.isEligible).toBe(true);
    expect(largeObject.error.message).toBe(`{"data":"${"x".repeat(491)}...`);
});

test("thrown values the server could not read, or that would lose detail, are sent as text", async () => {
    const res = await checkEligibility([
        program("object-message", "'use strict'; ({params, imports}) => { throw {message: {code: 1}}; };"),
        program("empty-object", "'use strict'; ({params, imports}) => { throw {}; };"),
        program("long-error", "'use strict'; ({params, imports}) => { throw new Error('y'.repeat(2000)); };"),
        program("emoji-at-the-cut", "'use strict'; ({params, imports}) => { throw new Error('a'.repeat(499) + '\u{1F600}' + 'b'.repeat(10)); };"),
    ]);

    const [objectMessage, emptyObject, longError, emojiAtTheCut] = res.json.mock.calls[0][0].eligibilityRuleEntities;
    expect(objectMessage.error).toEqual({message: '{"message":{"code":1}}', stack: '{"message":{"code":1}}'});
    expect(emptyObject.error).toEqual({message: "{}", stack: "{}"});
    expect(longError.error.message).toBe(`${"y".repeat(500)}...`);
    expect(Array.from(longError.error.stack).length).toBeLessThanOrEqual(4003);
    expect(emojiAtTheCut.error.message).toBe(`${"a".repeat(499)}\u{1F600}...`);
});
