/**
 * Tutorial sandbox catalog — pick any drill without full raid flow.
 *
 * Pool missions: auto-listed from MissionGames (enabled + generator registered).
 * To add a new finale or bonus drill, append to FINALE_ENTRIES or BONUS_ENTRIES below.
 */
(function (global) {
    /** @type {Array<{ id: string, icon: string, titleKey: string, descKey: string, finaleMode: "classic"|"stroop" }>} */
    const FINALE_ENTRIES = [
        {
            id: "finale-classic",
            icon: "🔐",
            titleKey: "mission.finale.classicTitle",
            descKey: "mission.finale.classicDesc",
            finaleMode: "classic"
        },
        {
            id: "finale-stroop",
            icon: "🔥",
            titleKey: "mission.finale.stroopTitle",
            descKey: "mission.finale.stroopDesc",
            finaleMode: "stroop"
        }
    ];

    /** @type {Array<{ id: string, icon: string, titleKey: string, descKey: string, launchType: "bonus" }>} */
    const BONUS_ENTRIES = [
        {
            id: "intelread",
            icon: "🏦",
            titleKey: "tutorialIntelTitle",
            descKey: "tutorialIntelDesc",
            launchType: "bonus"
        }
    ];

    function missionTitleKey(kindId) {
        return `mission.${kindId}.title`;
    }

    function missionDescKey(kindId) {
        return `mission.${kindId}.desc`;
    }

    function getPoolMissions() {
        const MG = global.MissionGames;
        if (!MG) return [];
        const registry = MG.REGISTRY || {};
        return Object.keys(registry)
            .filter((id) => registry[id]?.enabled)
            .map((id) => {
                const meta = registry[id] || {};
                return {
                    id,
                    icon: meta.icon || "🎮",
                    titleKey: missionTitleKey(id),
                    descKey: missionDescKey(id),
                    section: "pool"
                };
            });
    }

    function getSections() {
        const pool = getPoolMissions();
        const finale = FINALE_ENTRIES.map((e) => ({ ...e, section: "finale" }));
        const bonus = BONUS_ENTRIES.map((e) => ({ ...e, section: "bonus" }));
        return [
            { id: "pool", titleKey: "tutorialSectionPool", items: pool },
            { id: "finale", titleKey: "tutorialSectionFinale", items: finale },
            { id: "bonus", titleKey: "tutorialSectionBonus", items: bonus }
        ].filter((s) => s.items.length > 0);
    }

    function launchUrl(kindId) {
        return `game.html?mode=tutorial&kind=${encodeURIComponent(kindId)}`;
    }

    function isFinaleKind(kindId) {
        return kindId === "finale-classic" || kindId === "finale-stroop";
    }

    function finaleModeForKind(kindId) {
        if (kindId === "finale-stroop") return "stroop";
        if (kindId === "finale-classic") return "classic";
        return null;
    }

    function isBonusKind(kindId) {
        return kindId === "intelread";
    }

    global.TutorialCatalog = {
        FINALE_ENTRIES,
        BONUS_ENTRIES,
        getPoolMissions,
        getSections,
        launchUrl,
        isFinaleKind,
        finaleModeForKind,
        isBonusKind
    };
})(typeof window !== "undefined" ? window : globalThis);
