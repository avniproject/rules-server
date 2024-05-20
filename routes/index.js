import {
    rulesController,
    cleanRulesCache,
    summary,
    buildObservationAndRunRules, encounterEligibility,
    messagingResponse,
    getStatus
} from "../src/controllers/rulesController";

const express = require('express');
const router = express.Router();

router.post('/api/rules', rulesController);
router.get('/api/cleanRulesCache', cleanRulesCache);
router.post('/api/summaryRule', summary);
router.post('/api/encounterEligibility', encounterEligibility);
router.post('/api/upload', buildObservationAndRunRules);
router.post('/api/messagingRule', messagingResponse);
router.get('/api/status', getStatus);

module.exports = router;
