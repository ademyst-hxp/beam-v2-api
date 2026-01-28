import { checkBadges } from "./jobs/check_badges.js";
import { checkLevels } from "./jobs/check_levels.js";

// Initial run
(async () => {
    await checkBadges();
    await checkLevels();
})();

// Schedule to run every hour
setInterval(async () => {
    await checkBadges();
    await checkLevels();
}, parseInt(process.env.CRON_DELAY || "3600") * 1000);