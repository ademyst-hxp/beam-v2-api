import { checkBadges } from "./jobs/check_badges.js";

setInterval(async () => {
    await checkBadges();
}, 5000);