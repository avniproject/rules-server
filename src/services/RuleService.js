import {defaults, identity, isFunction, isEmpty} from "lodash";
import {common, motherCalculations} from "avni-health-modules";
import * as models from "openchs-models";
import api from "./api";
import cache from "./cache";
import axios from "axios";
import {ORGANISATION_UUID_HEADER} from "../controllers/UserHeaders";

class RuleService {
    constructor() {
        this.cache = {};
    }

    async getApplicableRules(entityUuid, ruleType, ruledEntityType) {
        console.debug("RuleService",
            `Getting Rules of Type ${ruleType} for ${ruledEntityType} - ${entityUuid}`);
        const rules = await this._getRules();
        const matchingRules = rules
            .map(identity)
            .filter(rule =>
                rule.voided === false && rule.type === ruleType &&
                rule.entity.uuid === entityUuid && rule.entity.type === ruledEntityType);
        return this._getRuleFunctions(matchingRules);
    }

    async _getRuleFunctions(rules = []) {
        if (isEmpty(rules)) return [];
        const allRules = await this._getRuleFunctionsFromBundle();
        return defaults(rules, [])
            .filter(ar => isFunction(allRules[ar.fnName]) && isFunction(allRules[ar.fnName].exec))
            .map(ar => ({...ar, fn: allRules[ar.fnName]}));
    }

    async _getRuleFunctionsFromBundle() {
        const orgUuid = axios.defaults.headers.common[ORGANISATION_UUID_HEADER];
        let result = cache[orgUuid];
        if (result) {
            console.debug("RuleService", "Cache hit successful");
            return result;
        } else {
            console.debug("RuleService", "Cache hit unsuccessful");
            let bundleCode = await api.getLegacyRulesBundle();
            let ruleServiceLibraryInterfaceForSharingModules = {
                log: console.log,
                common: common,
                motherCalculations: motherCalculations,
                models: models
            };
            let wrappedCode = `
                ${bundleCode}
                rulesConfig;
            `;
            cache[orgUuid] = eval(wrappedCode);
            return cache[orgUuid];
        }
    }

    async _getRules() {
        let newVar = await api.getLegacyRules();
        return newVar;
    }
}

let ruleService = new RuleService();
export default ruleService;
